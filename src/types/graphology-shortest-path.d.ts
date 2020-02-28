declare module 'graphology-shortest-path/dijkstra' {
  import { AbstractGraph, NodeKey } from 'graphology-types';
  export interface Dijkstra {
    bidirectional: (
      graph: AbstractGraph,
      source: NodeKey,
      target: NodeKey,
      weightAttribute?: string
    ) => NodeKey[] | null;
    singleSource: (
      graph: AbstractGraph,
      source: NodeKey,
      weightAttribute?: string
    ) => Record<NodeKey, NodeKey[]>;
  }

  const dijkstra: Dijkstra;
  export default dijkstra;
}
