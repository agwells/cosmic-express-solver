const { CELLTYPE, FACINGS } = require('./constants');
const Car = require('./Car');

class Step {
  constructor(gameMap, pos, prevStep, startDir) {
    this.gameMap = gameMap;
    this.cell = pos;
    this.prevStep = prevStep;
    this.startDir = startDir;
    if (!this.startDir) {
      this.startDir = FACINGS.SOUTH;
    }
    this.cars = [];
    if (prevStep) {
      this.route = new String(prevStep.route);
      this.aliens = prevStep.aliens.slice();
      this.emptyHouses = prevStep.emptyHouses.slice();
      for (let i = 0; i < gameMap.numberOfCars; i++) {
        this.cars[i] = new Car(prevStep.cars[i]);
      }

      // A list of filled cells in the latest step (represented as strings)
      // This is a performance optimization, so I don't have to loop through
      // all the steps
      this.filledCells = prevStep.filledCells.slice();
      this.filledCells.push(prevStep.cell);

      // A list of the steps we've taken since we last loaded or unloaded
      // an alien. We can use this to identify useless solution spaces.
      this.stepsSinceLastPassengerChange = this.prevStep.stepsSinceLastPassengerChange.slice();
      this.stepsSinceLastPassengerChange.push(this.prevStep);
    } else {
      this.route = new String(gameMap.rawmap);
      this.aliens = gameMap.aliens.slice();
      this.emptyHouses = gameMap.houses.slice();
      for (let i = 0; i < gameMap.numberOfCars; i++) {
        this.cars[i] = new Car();
      }
      this.filledCells = [];
      this.stepsSinceLastPassengerChange = [];
    }

    // Draw an X to represent our current location
    this.drawOnRoute(this.cell, 'X');
    this.availableDirections = [];

    // Determine which directions are available
    var facingsToTry = [];
    switch (this.startDir.toString()) {
      case FACINGS.NORTH.toString():
        facingsToTry = [
          FACINGS.NORTH,
          FACINGS.EAST,
          FACINGS.SOUTH,
          FACINGS.WEST,
        ];
        break;
      case FACINGS.EAST.toString():
        facingsToTry = [
          FACINGS.EAST,
          FACINGS.SOUTH,
          FACINGS.WEST,
          FACINGS.NORTH,
        ];
        break;
      case FACINGS.SOUTH.toString():
        facingsToTry = [
          FACINGS.SOUTH,
          FACINGS.WEST,
          FACINGS.NORTH,
          FACINGS.EAST,
        ];
        break;
      case FACINGS.WEST.toString():
        facingsToTry = [
          FACINGS.WEST,
          FACINGS.NORTH,
          FACINGS.EAST,
          FACINGS.SOUTH,
        ];
        break;
      default:
        facingsToTry = [
          FACINGS.WEST,
          FACINGS.NORTH,
          FACINGS.EAST,
          FACINGS.SOUTH,
        ];
    }
    for (let f = 0; f < facingsToTry.length; f++) {
      let facing = facingsToTry[f];
      var c = this.cell.getNextCell(facing);
      if (c.isNavigable() && !this.filledCells.includes(c)) {
        // // Random!
        // if (Math.random() > 0.5) {
        //     this.availableDirections.push(facing);
        // } else {
        this.availableDirections.push(facing);
        // }
      }
    }

    /**
     * Indicates whether one of the cars boarded or lost a passenger.
     * Used in short-circuiting redundant paths.
     */
    this.isPassengerChange = false;

    // Update car states
    for (let i = 0; i < gameMap.numberOfCars; i++) {
      let car = this.cars[i];
      let carPos;
      // TODO: general-purpose solution for more than three cars?
      switch (i) {
        case 0:
          carPos = this.cell;
          break;
        case 1:
          if (prevStep) {
            carPos = prevStep.cell;
          } else {
            // This car wasn't on the board yet.
            continue;
          }
          break;
        case 2:
          if (prevStep && prevStep.prevStep) {
            carPos = prevStep.prevStep.cell;
          } else {
            // This car wasn't on the board yet.
            continue;
          }
      }

      // See if any adjacent cells have a matching house
      if (car.occupant !== Car.EMPTY) {
        for (let j = 0; j < FACINGS.ALL.length; j++) {
          let c = carPos.getNextCell(FACINGS.ALL[j]);
          let idx = this.emptyHouses.indexOf(c);
          if (idx > -1) {
            if (
              c.getContent() === car.occupant.toLowerCase() ||
              c.getContent() === CELLTYPE.WILDCARD_HOUSE
            ) {
              this.isPassengerChange = true;
              car.occupant = Car.EMPTY;
              this.drawOnRoute(c, '@');
              this.emptyHouses.splice(idx, 1);
              // Only one alien per house.
              break;
            }
          }
        }
      }

      // See if any adjacent square has an alien that wants to hop on.
      // (Note that boarding happens after de-boarding, so that one
      // alien can leave a car, and another board the car, in the same
      // turn.)
      if (car.occupant === Car.EMPTY) {
        for (let j = 0; j < FACINGS.ALL.length; j++) {
          let c = carPos.getNextCell(FACINGS.ALL[j]);
          let idx = this.aliens.indexOf(c);
          if (idx > -1) {
            let boarded = false;
            switch (c.getContent()) {
              case CELLTYPE.GREEN_ALIEN:
                // Green alien always gets in; and slimes the car.
                car.slimed = true;
                boarded = true;
                break;
              case CELLTYPE.ORANGE_ALIEN:
              case CELLTYPE.PURPLE_ALIEN:
                // Will only get in to a non-slimed car.
                if (!car.slimed) {
                  boarded = true;
                }
                break;
            }
            if (boarded) {
              this.isPassengerChange = true;
              car.occupant = c.getContent();
              this.aliens.splice(idx, 1);
              this.drawOnRoute(c, '_');

              // Only one alien per car. So we can stop checking
              // additional squares.
              /**
               * @todo: Handle the situation where two aliens
               * on opposite sides of the tracke jump and collide
               * with each other in the air and neither one boards.
               */
              break;
            }
          }
        }
      }
    }

    if (this.isPassengerChange) {
      this.stepsSinceLastPassengerChange = [];
    }
  }

  drawOnRoute(cell, char) {
    var stringIdx = cell.x + (this.gameMap.width + 1) * cell.y;
    this.route =
      this.route.slice(0, stringIdx) + char + this.route.slice(stringIdx + 1);
  }

  isDeadEnd() {
    return (
      !this.isWin() &&
      (this.availableDirections.length === 0 ||
        this.isRedundantPath() ||
        !this.areAllVitalCellsReachable() ||
        this.cell.getContent() === CELLTYPE.EXIT)
    );
  }

  isWin() {
    return (
      this.cell.getContent() === CELLTYPE.EXIT &&
      this.aliens.length === 0 &&
      this.emptyHouses.length === 0
    );
  }

  undo() {
    // var i = Step.filledCells.indexOf(this.cell);
    // if (i > -1) {
    //     Step.filledCells.splice(i, 1);
    // } else {
    //     return false;
    // }
  }

  isRedundantPath() {
    // The path doubles back on itself without doing anything. No point
    // pursuing that further, because it's equivalent to another shorter
    // path we haven't pursued yet.
    let self = this;
    return this.stepsSinceLastPassengerChange.some((oldStep) => {
      return (
        oldStep !== self.prevStep &&
        self.cell.getAdjacentNavigableCells().includes(oldStep.cell)
      );
    });
  }

  areAllVitalCellsReachable() {
    // First turn, everything will be reachable.
    if (!this.prevStep) {
      return true;
    }

    // Make a list of every known contiguous region on the map (initially empty)
    var regions = [];
    // Scan every empty cell (and my location, and the exit cell) in the map
    this.gameMap.navigableCells.forEach((cell) => {
      // Exclude filled cells (except the currently occupied one)
      // TODO: to work with two cars, we need to check the progress one
      // turn back.
      if (this.prevStep.filledCells.includes(cell)) {
        return;
      }

      var adjCells = cell.getAdjacentNavigableCells();
      adjCells = adjCells.filter(
        (adjCell) => !this.prevStep.filledCells.includes(adjCell)
      );

      // Check whether this cell is adjacent to any cell in any of the
      // known contiguous regions
      var inTheseRegions = [];
      if (adjCells.length) {
        inTheseRegions = regions.filter((region) =>
          adjCells.some((adjCell) => region.includes(adjCell))
        );
      }
      switch (inTheseRegions.length) {
        case 0:
          // Not in any known region yet. Start a new one.
          let newRegion = [cell];
          regions.push(newRegion);
          break;
        case 1:
          // In one known region. Add it to that one.
          inTheseRegions[0].push(cell);
          break;
        default:
          // In more than one. Join them together.
          let mergeRegion = inTheseRegions[0];
          mergeRegion.push(cell);
          for (let i = 1; i < inTheseRegions.length; i++) {
            mergeRegion.splice(mergeRegion.length, 0, ...inTheseRegions[i]);
            let idx = regions.indexOf(inTheseRegions[i]);
            regions.splice(idx, 1);
          }
      }
    });

    var myRegion = regions.find((region) =>
      region.includes(this.prevStep.cell)
    );

    // Find which region contains the exit cell
    if (!myRegion.includes(this.gameMap.exitPos)) {
      return false;
    }

    // Check that all aliens & empty houses can still be reached as well
    // Note: to accomodate two cars, I'm checking whether the remaining
    // aliens and empty houses from THIS TURN would have been accessible
    // with the blockages from LAST TURN. This gives us a one-turn lag time
    // for the trailing car to catch up.
    // TODO: probably a better way to do that.
    var housesAndAliens = this.aliens.concat(this.emptyHouses);

    // For each house/alien...
    return housesAndAliens.every((cellToCheckReachable) => {
      return (
        cellToCheckReachable
          // ... check each cell next to it ...
          .getAdjacentNavigableCells()
          // ... and see if any of them ...
          .some((cellNextToHouse) => {
            // ... are present in the same contiguous region
            // as my position last turn.
            return myRegion.includes(cellNextToHouse);
          })
      );
    });
  }
}

module.exports = Step;
