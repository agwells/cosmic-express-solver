import createGraph, { Graph } from 'ngraph.graph';

export interface MyNodeData {
  content?: string;
  x: number;
  y: number;
}

export function copyGraph<T, U>(from: Graph<T, U>): Graph<T, U> {
  const to = createGraph();
  to.beginUpdate();
  from.forEachNode((node) => {
    to.addNode(node.id, node.data);
  });
  from.forEachLink((link) => {
    to.addLink(link.fromId, link.toId, link.data);
  });
  to.endUpdate();
  return to;
}

export function manhattanDistance(a: MyNodeData, b: MyNodeData): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.abs(dx) + Math.abs(dy);
}
