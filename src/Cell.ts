import { CELLTYPE, FACINGS, Facing } from './constants';
import { GameMap } from 'GameMap';

export class Cell {
  gameMap: GameMap;
  x: number;
  y: number;
  outOfBounds: boolean;
  adjacentCellCache: Map<Facing, Cell>;
  adjacentNavCellCache: false | Cell[];

  constructor(gameMap: GameMap, x: number, y: number) {
    this.gameMap = gameMap;
    this.x = x;
    this.y = y;
    if (x < 0 || x >= this.gameMap.width || y < 0 || y >= this.gameMap.height) {
      this.outOfBounds = true;
    } else {
      this.outOfBounds = false;
    }
    this.adjacentCellCache = new Map();
    this.adjacentNavCellCache = false;
  }

  /**
   * Get the content of this cell.
   *
   * @returns
   *
   * @memberof Cell
   */
  getContent(): CELLTYPE | false {
    if (this.outOfBounds) {
      return false;
    }
    return this.gameMap.getCharAt(this.x, this.y) as CELLTYPE;
  }

  toString(): string {
    return `${this.x},${this.y}`;
  }

  getNextCell(facing: Facing): Cell {
    const cachedCell = this.adjacentCellCache.get(facing);
    if (cachedCell) {
      return cachedCell;
    }

    const nextCell = this.gameMap.getCellAt([
      this.x + facing[0],
      this.y + facing[1],
    ]);
    let result: Cell;
    switch (nextCell.getContent()) {
      case CELLTYPE.CROSSING:
        // If it's a crossing, we basically skip it over and look
        // at the next cell past it
        result = nextCell.getNextCell(facing);
        break;
      case CELLTYPE.WARP:
        // If it's a warp, we look at the cell next to the other warp.
        // So find the other warp in map.warps.
        // @todo: support for more than one pair of warps
        {
          let destWarp;
          if (this.gameMap.warps[0] === nextCell) {
            destWarp = this.gameMap.warps[1];
          } else {
            destWarp = this.gameMap.warps[0];
          }
          result = destWarp.getNextCell(facing);
        }
        break;
      default:
        result = nextCell;
        break;
    }
    this.adjacentCellCache.set(facing, result);
    return result;
  }

  getAdjacentNavigableCells(): Cell[] {
    if (!this.adjacentNavCellCache) {
      this.adjacentNavCellCache = Object.values(FACINGS).reduce(
        (acc: Cell[], facing) => {
          const nextCell = this.getNextCell(facing);
          if (nextCell.isNavigable()) {
            return acc.concat(nextCell);
          } else {
            return acc;
          }
        },
        []
      );
    }
    return this.adjacentNavCellCache;
  }

  isOutOfBounds(): boolean {
    return this.outOfBounds;
  }

  isNavigable(): boolean {
    if (this.outOfBounds) {
      return false;
    }
    switch (this.getContent()) {
      // case CELLTYPE.CROSSING:
      case CELLTYPE.WARP:
      case CELLTYPE.EMPTY:
      case CELLTYPE.EXIT:
      case CELLTYPE.FRONT_CAR:
        return true;
      default:
    }
    return false;
  }
}
