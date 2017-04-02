import React, {Component} from 'react';

import DeckGL from 'deck.gl';
import ArcBrushingLayer from './arc-brushing-layer';
import ScatterplotBrushingLayer from './scatterplot-brushing-layer';

export const inFlowColors = [
  [35, 181, 184]
];

export const outFlowColors = [
  [166, 3, 3]
];

// migrate out
const sourceColor = [166, 3, 3];
// migrate in
const targetColor = [35, 181, 184];

export function linearScale(domain, range, value) {

  return (value - domain[0]) / (domain[1] - domain[0]) * (range[1] - range[0]) + range[0];
}

export default class DeckGLOverlay extends Component {

  static get defaultViewport() {
    return {
      longitude: -100,
      latitude: 40.7,
      zoom: 3,
      maxZoom: 15,
      pitch: 0,
      bearing: 0
    };
  }

  constructor(props) {
    super(props);
    this.state = {
      arcs: [],
      targets: [],
      sources: []
    };
  }

  /* eslint-disable react/no-did-mount-set-state */
  componentDidMount() {
    this.setState({
      ...this._getLayerData(this.props)
    });
  }
  /* eslint-enable react/no-did-mount-set-state */

  componentWillReceiveProps(nextProps) {
    if (nextProps.data !== this.props.data) {
      this.setState({
        ...this._getLayerData(nextProps)
      });
    }
  }

  _getLayerData({data}) {
    if (!data) {
      return null;
    }
    const arcs = [];
    const targets = [];
    const sources = [];
    const pairs = {};

    data.forEach((county, i) => {

      const {flows, centroid: targetCentroid} = county.properties;
      const value = {gain: 0, loss: 0};

      Object.keys(flows).forEach(toId => {
        value[flows[toId] > 0 ? 'gain' : 'loss'] += flows[toId];

        // if number too small, ignore it
        if (Math.abs(flows[toId]) < 50) {
          return;
        }
        const pairKey = [i, Number(toId)].sort((a, b) => a - b).join('-');
        const sourceCentroid = data[toId].properties.centroid;
        const gain = Math.sign(flows[toId]);

        // add point at arc source
        sources.push({
          position: sourceCentroid,
          target: targetCentroid,
          name: data[toId].properties.name,
          radius: 3,
          gain: -gain
        });

        // eliminate duplicates arcs
        if (pairs[pairKey]) {
          return;
        }

        pairs[pairKey] = true;

        arcs.push({
          target: gain > 0 ? targetCentroid : sourceCentroid,
          source: gain > 0 ? sourceCentroid : targetCentroid,
          value: flows[toId]
        });
      });

      // add point at arc target
      targets.push({
        ...value,
        position: [targetCentroid[0], targetCentroid[1], 10],
        net: value.gain + value.loss,
        name: county.properties.name
      });
    });

    // sort targets by radius large -> small
    targets.sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
    const domain = [0, Math.abs(targets[0].net)];
    const range = [36, 400];

    targets.forEach(pt => {
      pt.radius = Math.sqrt(linearScale(domain, range, Math.abs(pt.net)));
    });

    return {arcs, targets, sources};
  }

  _initialize(gl) {
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
  }

  render() {
    const {viewport, brushRadius, strokeWidth, opacity, mouseEntered, mousePosition} = this.props;
    const {arcs, targets, sources} = this.state;

    if (!arcs || !targets) {
      return null;
    }

    const layers = [
      new ScatterplotBrushingLayer({
        id: 'sources',
        data: sources,
        brushRadius,
        brushTarget: true,
        mousePosition,
        opacity: 1,
        enableBrushing: mouseEntered,
        pickable: false,
        radiusScale: mouseEntered ? 3000 : 0,
        getColor: d => (d.gain > 0 ? targetColor : sourceColor)
      }),
      new ScatterplotBrushingLayer({
        id: 'targets-ring',
        data: targets,
        brushRadius,
        mousePosition,
        strokeWidth: 2,
        outline: true,
        opacity: 1,
        enableBrushing: Boolean(mouseEntered),
        radiusScale: mouseEntered ? 4000 : 0,
        getColor: d => (d.net > 0 ? targetColor : sourceColor)
      }),
      new ScatterplotBrushingLayer({
        id: 'targets',
        data: targets,
        brushRadius,
        mousePosition,
        opacity: 1,
        enableBrushing: Boolean(mouseEntered),
        pickable: true,
        radiusScale: 3000,
        onHover: this.props.onHover,
        getColor: d => (d.net > 0 ? targetColor : sourceColor)
      }),
      new ArcBrushingLayer({
        id: 'arc',
        data: arcs,
        strokeWidth,
        opacity,
        brushRadius,
        enableBrushing: Boolean(mouseEntered),
        mousePosition,
        getSourcePosition: d => d.source,
        getTargetPosition: d => d.target,
        getSourceColor: d => sourceColor,
        getTargetColor: d => targetColor
      })
    ];

    return (
      <DeckGL {...viewport} layers={ layers } onWebGLInitialized={this._initialize}/>
    );
  }
}