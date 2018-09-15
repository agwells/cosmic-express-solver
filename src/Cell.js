const { CELLTYPE, FACINGS } = require("./constants");
class Cell {
  constructor(gameMap, x, y) {
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
  getContent() {
    if (this.outOfBounds) {
      return false;
    }
    return this.gameMap.getCharAt(this.x, this.y);
  }

  toString() {
    return `${this.x},${this.y}`;
  }

  toStringObj() {
    return new String(this.toString());
  }

  getNextCell(facing) {
    var cachedCell = this.adjacentCellCache.get(facing);
    if (typeof cachedCell !== "undefined") {
      return cachedCell;
    }

    var nextCell = this.gameMap.getCellAt([
      this.x + parseInt(facing[0]),
      this.y + parseInt(facing[1])
    ]);
    var result;
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
        let destWarp;
        if (this.gameMap.warps[0] === nextCell) {
          destWarp = this.gameMap.warps[1];
        } else {
          destWarp = this.gameMap.warps[0];
        }
        result = destWarp.getNextCell(facing);
        break;
      default:
        result = nextCell;
        break;
    }
    this.adjacentCellCache.set(facing, result);
    return result;
  }

  getAdjacentNavigableCells() {
    if (this.adjacentNavCellCache !== false) {
      return this.adjacentNavCellCache;
    }

    var result = [];
    FACINGS.ALL.forEach(facing => {
      var nextCell = this.getNextCell(facing);
      if (nextCell.isNavigable()) {
        result.push(nextCell);
      }
    });
    // @ts-ignore
    this.adjacentNavCellCache = result;
    return result;
  }

  isOutOfBounds() {
    return this.outOfBounds;
  }

  isNavigable() {
    if (this.outOfBounds) {
      return false;
    }
    switch (this.getContent()) {
      case CELLTYPE.EMPTY:
      case CELLTYPE.CROSSING:
      case CELLTYPE.EXIT:
      case CELLTYPE.WARP:
      case CELLTYPE.FRONT_CAR:
        return true;
      default:
    }
    return false;
  }
}

module.exports = Cell;
