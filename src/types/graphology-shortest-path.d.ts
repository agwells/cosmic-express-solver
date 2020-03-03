declare module 'graphology-shortest-path/dijkstra' {
  import { AbstractGraph, NodeKey } from 'graphology-types';
  interface Dijkstra {
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

declare module 'graphology-shortest-path/unweighted' {
  import { AbstractGraph, NodeKey } from 'graphology-types';
  interface Unweighted {
    bidirectional: (
      graph: AbstractGraph,
      source: NodeKey,
      target: NodeKey
    ) => NodeKey[] | null;
  }

  const unweighted: Unweighted;
  export default unweighted;
}
