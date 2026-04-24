declare module 'react-force-graph-2d' {
  import { Component } from 'react';

  export type ForceGraphNode = Record<string, unknown> & {
    id?: string | number;
    x?: number;
    y?: number;
  };

  export type ForceGraphLink<NodeType extends ForceGraphNode = ForceGraphNode> = Record<string, unknown> & {
    source: NodeType;
    target: NodeType;
  };

  export interface ForceGraphProps<
    NodeType extends ForceGraphNode = ForceGraphNode,
    LinkType extends ForceGraphLink<NodeType> = ForceGraphLink<NodeType>
  > {
    graphData?: {
      nodes: NodeType[];
      links: LinkType[];
    };
    nodeLabel?: string | ((node: NodeType) => string);
    nodeColor?: string | ((node: NodeType) => string);
    nodeRelSize?: number;
    nodeVal?: number | string | ((node: NodeType) => number);
    linkSource?: string;
    linkTarget?: string;
    linkLabel?: string | ((link: LinkType) => string);
    linkColor?: string | ((link: LinkType) => string);
    linkWidth?: number | string | ((link: LinkType) => number);
    linkDirectionalParticles?: number | string | ((link: LinkType) => number);
    linkDirectionalParticleSpeed?: number | string | ((link: LinkType) => number);
    linkDirectionalParticleWidth?: number | string | ((link: LinkType) => number);
    linkDirectionalParticleColor?: string | ((link: LinkType) => string);
    onNodeClick?: (node: NodeType, event: MouseEvent) => void;
    onNodeRightClick?: (node: NodeType, event: MouseEvent) => void;
    onNodeHover?: (node: NodeType | null, previousNode: NodeType | null) => void;
    onNodeDrag?: (node: NodeType, translate: { x: number; y: number }) => void;
    onNodeDragEnd?: (node: NodeType, translate: { x: number; y: number }) => void;
    onLinkClick?: (link: LinkType, event: MouseEvent) => void;
    onLinkRightClick?: (link: LinkType, event: MouseEvent) => void;
    onLinkHover?: (link: LinkType | null, previousLink: LinkType | null) => void;
    onBackgroundClick?: (event: MouseEvent) => void;
    onBackgroundRightClick?: (event: MouseEvent) => void;
    onZoom?: (transform: { k: number; x: number; y: number }) => void;
    onZoomEnd?: (transform: { k: number; x: number; y: number }) => void;
    width?: number;
    height?: number;
    backgroundColor?: string;
    showNavInfo?: boolean;
    nodeCanvasObject?: (node: NodeType, ctx: CanvasRenderingContext2D, globalScale: number) => void;
    nodePointerAreaPaint?: (node: NodeType, color: string, ctx: CanvasRenderingContext2D) => void;
    linkCanvasObject?: (link: LinkType, ctx: CanvasRenderingContext2D, globalScale: number) => void;
    linkPointerAreaPaint?: (link: LinkType, color: string, ctx: CanvasRenderingContext2D) => void;
    enableNodeDrag?: boolean;
    enableNavigationControls?: boolean;
    enablePointerInteraction?: boolean;
    cooldownTicks?: number;
    cooldownTime?: number;
    onEngineTick?: () => void;
    onEngineStop?: () => void;
    forceEngine?: 'd3' | 'ngraph';
    d3AlphaMin?: number;
    d3AlphaDecay?: number;
    d3VelocityDecay?: number;
    warmupTicks?: number;
  }

  export default class ForceGraph2D<
    NodeType extends ForceGraphNode = ForceGraphNode,
    LinkType extends ForceGraphLink<NodeType> = ForceGraphLink<NodeType>
  > extends Component<ForceGraphProps<NodeType, LinkType>> {
    centerAt(x?: number, y?: number, durationMs?: number): void;
    zoom(k?: number, durationMs?: number): void;
    zoomToFit(durationMs?: number, padding?: number, nodeFilter?: (node: NodeType) => boolean): void;
    stopAnimation(): void;
    resumeAnimation(): void;
    pauseAnimation(): void;
    getGraphBbox(nodeFilter?: (node: NodeType) => boolean): { x: [number, number]; y: [number, number] };
    d3Force(forceName: string): unknown;
    d3Force(forceName: string, forceFn: unknown): this;
    d3ReheatSimulation(): void;
  }
}
