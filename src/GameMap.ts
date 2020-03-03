import fs from 'fs';
import { Cell } from './Cell';
import { CELLTYPE } from './constants';
import createGraph from 'ngraph.graph';
import { MyNodeData } from 'graph-util';

export class GameMap {
  cellcache: Map<string, Cell>;
  height: number;
  width: number;
  numberOfCars: number;
  navigableCells: Cell[];
  startingPos: Cell;
  exitPos: Cell;
  warps: Cell[];
  aliens: Cell[];
  houses: Cell[];
  hintCells: Cell[];
  rawmap: string;
  graph = createGraph<MyNodeData>();

  /**
   *
   * @param {string} file The file to parse the game map from.
   */
  constructor(file: string) {
    this.cellcache = new Map();

    this.height = 0;
    this.width = 0;
    this.numberOfCars = 1;
    this.navigableCells = [];
    // HACK: need to give these initial values to satisfy TS
    this.startingPos = undefined as any;
    this.exitPos = undefined as any;

    // TODO: support for more than one pair of warps
    // ... wait, *are* there any levels with more than one pair
    // of warps?
    this.warps = [];
    this.aliens = [];
    this.houses = [];
    this.hintCells = [];
    this.rawmap = '';

    this.rawmap = fs.readFileSync(file, 'UTF-8');
    // Ignore dangling newline at the end of the file.
    if (this.rawmap.slice(-1) === '\n') {
      this.rawmap = this.rawmap.slice(0, -1);
    }

    // Find out the size of the map
    {
      const lines = this.rawmap.split('\n');
      this.height = lines.length;
      this.width = lines[0].length;
      // Validate that the map is properly rectangular
      if (!lines.every((line) => line.length === this.width)) {
        console.error(
          'Invalid map file. Every row in the file must be the same size.'
        );
        process.exit(1);
      }
      //    console.log("Map size " + map.width + " by " + map.height);
    }

    // Locate special cells
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        const pos = this.getCellAt([x, y]);
        switch (this.getCharAt(x, y)) {
          case CELLTYPE.EXIT:
            this.exitPos = pos;
            // The exit counts as both a "special cell" and a navigable cell.
            this.navigableCells.push(pos);
            break;
          case CELLTYPE.GREEN_ALIEN:
          case CELLTYPE.ORANGE_ALIEN:
          case CELLTYPE.PURPLE_ALIEN:
            this.aliens.push(pos);
            break;
          case CELLTYPE.GREEN_HOUSE:
          case CELLTYPE.ORANGE_HOUSE:
          case CELLTYPE.PURPLE_HOUSE:
          case CELLTYPE.WILDCARD_HOUSE:
            this.houses.push(pos);
            break;
          case CELLTYPE.FRONT_CAR:
            this.startingPos = pos;
            this.navigableCells.push(pos);
            break;
          case CELLTYPE.OTHER_CARS:
            this.numberOfCars++;
            if (this.numberOfCars > 3) {
              console.error(
                'ERROR: Sorry, this program only supports up to three train cars.'
              );
              process.exit(1);
            }
            break;
          case CELLTYPE.WARP:
            this.warps.push(pos);
            if (this.warps.length > 2) {
              console.error(
                'ERROR: Sorry, this program only supports one pair of wormholes per map.'
              );
              process.exit(1);
            }
            break;
          case CELLTYPE.EMPTY:
            this.navigableCells.push(pos);
            break;
          case CELLTYPE.HINT_EAST_NORTH:
          case CELLTYPE.HINT_EAST_SOUTH:
          case CELLTYPE.HINT_EAST_WEST:
          case CELLTYPE.HINT_NORTH_SOUTH:
          case CELLTYPE.HINT_WEST_NORTH:
          case CELLTYPE.HINT_WEST_SOUTH:
            this.hintCells.push(pos);
            break;
        }
      }
    }

    this.cellcache.forEach((cell, key) => {
      if (cell.isNavigable()) {
        this.graph.addNode(key, {
          content: cell.getContent() || undefined,
          x: (cell.x - 0.1) * 10,
          y: cell.y * -10,
        });
        cell
          .getAdjacentNavigableCells()
          .forEach((adjCell) => this.graph.addLink(key, adjCell.toString()));
      }
    });

    // console.log(this.rawmap);
    // console.dir(
    //   this.graph.export().nodes.map((n) => `${n.key}: ${n.attributes?.content}`)
    // );
    // console.dir(this.graph.export().edges);

    // console.dir(dijkstra.singleSource(this.graph, '0,0;i'));
    // process.exit(1);
  }

  /**
   * Returns the character at the specified x/y coordinates in the map's
   * string representation.
   *
   * @param {number} x
   * @param {number} y
   * @returns {string}
   * @memberof GameMap
   */
  getCharAt(x: number, y: number): string {
    return this.rawmap.charAt(x + y * (this.width + 1));
  }

  getCellAt(pos: [number, number] | string): Cell {
    let x, y, posStr: string;
    if (Array.isArray(pos)) {
      [x, y] = pos;
      posStr = `${x},${y}`;
    } else {
      [x, y] = pos.split(',');
      x = parseInt(x);
      y = parseInt(y);
      posStr = pos;
    }

    if (this.cellcache.has(posStr)) {
      return this.cellcache.get(posStr)!;
    } else {
      const c = new Cell(this, x, y);
      this.cellcache.set(posStr, c);
      return c;
    }
  }
}
