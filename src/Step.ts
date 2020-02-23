import { CELLTYPE, FACINGS, Facing, Alien, ALL_FACINGS } from './constants';
import { Car } from './Car';
import { GameMap } from 'GameMap';
import { Cell } from 'Cell';

export class Step {
  gameMap: GameMap;
  readonly cell: Cell;
  readonly prevStep: Step | null;
  readonly startDir: Facing;
  cars: Car[];
  route: string;
  aliens: Cell[];
  emptyHouses: Cell[];
  filledCells: Cell[];
  stepsSinceLastPassengerChange: Step[];
  availableDirections: Facing[];
  isPassengerChange: boolean;

  constructor(
    gameMap: GameMap,
    pos: Cell,
    prevStep: Step | null = null,
    startDir: Facing = FACINGS.WEST
  ) {
    this.gameMap = gameMap;
    this.cell = pos;
    this.prevStep = prevStep;
    this.startDir = startDir;
    if (!this.startDir) {
      this.startDir = FACINGS.SOUTH;
    }
    this.cars = [];
    if (prevStep) {
      this.route = prevStep.route;
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
      this.stepsSinceLastPassengerChange = prevStep.stepsSinceLastPassengerChange.slice();
      this.stepsSinceLastPassengerChange.push(prevStep);
    } else {
      this.route = gameMap.rawmap;
      this.aliens = gameMap.aliens.slice();
      this.emptyHouses = gameMap.houses.slice();
      for (let i = 0; i < gameMap.numberOfCars; i++) {
        this.cars[i] = new Car();
      }
      this.filledCells = [];
      this.stepsSinceLastPassengerChange = [];
    }

    // Draw an X to represent our current location
    this.drawOnRoute(this.cell, CELLTYPE.CURRENT_LOCATION);
    this.availableDirections = [];

    // Determine which directions are available
    let facingsToTry: Facing[] = [];
    switch (this.startDir) {
      case FACINGS.NORTH:
        facingsToTry = [
          FACINGS.NORTH,
          FACINGS.EAST,
          FACINGS.SOUTH,
          FACINGS.WEST,
        ];
        break;
      case FACINGS.EAST:
        facingsToTry = [
          FACINGS.EAST,
          FACINGS.SOUTH,
          FACINGS.WEST,
          FACINGS.NORTH,
        ];
        break;
      case FACINGS.SOUTH:
        facingsToTry = [
          FACINGS.SOUTH,
          FACINGS.WEST,
          FACINGS.NORTH,
          FACINGS.EAST,
        ];
        break;
      case FACINGS.WEST:
        facingsToTry = [
          FACINGS.WEST,
          FACINGS.NORTH,
          FACINGS.EAST,
          FACINGS.SOUTH,
        ];
        break;
    }
    for (let f = 0; f < facingsToTry.length; f++) {
      const facing = facingsToTry[f];
      const c = this.cell.getNextCell(facing);
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
      const car = this.cars[i];
      let carPos: Cell;
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
        default:
          if (prevStep && prevStep.prevStep) {
            carPos = prevStep.prevStep.cell;
          } else {
            // This car wasn't on the board yet.
            continue;
          }
      }

      // See if any adjacent cells have a matching house
      if (car.occupant) {
        for (let j = 0; j < 4; j++) {
          const c = carPos.getNextCell(ALL_FACINGS[j]);
          const idx = this.emptyHouses.indexOf(c);
          if (idx > -1) {
            if (
              c.getContent() === car.occupant.toLowerCase() ||
              c.getContent() === CELLTYPE.WILDCARD_HOUSE
            ) {
              this.isPassengerChange = true;
              car.occupant = null;
              this.drawOnRoute(c, CELLTYPE.FILLED_HOUSE);
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
      if (!car.occupant) {
        for (let j = 0; j < 4; j++) {
          const c = carPos.getNextCell(ALL_FACINGS[j]);
          const idx = this.aliens.indexOf(c);
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
              car.occupant = c.getContent() as Alien;
              this.aliens.splice(idx, 1);
              this.drawOnRoute(c, CELLTYPE.MOVED_ALIEN);

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

  drawOnRoute(cell: Cell, char: CELLTYPE): void {
    const stringIdx = cell.x + (this.gameMap.width + 1) * cell.y;
    this.route =
      this.route.slice(0, stringIdx) + char + this.route.slice(stringIdx + 1);
  }

  isDeadEnd(): boolean {
    return (
      this.availableDirections.length === 0 ||
      this.isRedundantPath() ||
      !this.areAllVitalCellsReachable() ||
      this.cell.getContent() === CELLTYPE.EXIT
    );
  }

  isWin(): boolean {
    return (
      this.cell.getContent() === CELLTYPE.EXIT &&
      this.aliens.length === 0 &&
      this.emptyHouses.length === 0
    );
  }

  undo(): void {
    // var i = Step.filledCells.indexOf(this.cell);
    // if (i > -1) {
    //     Step.filledCells.splice(i, 1);
    // } else {
    //     return false;
    // }
  }

  isRedundantPath(): boolean {
    // The path doubles back on itself without doing anything. No point
    // pursuing that further, because it's equivalent to another shorter
    // path we haven't pursued yet.
    return this.stepsSinceLastPassengerChange.some(
      (oldStep) =>
        oldStep !== this.prevStep &&
        this.cell.getAdjacentNavigableCells().includes(oldStep.cell)
    );
  }

  areAllVitalCellsReachable(): boolean {
    // First turn, everything will be reachable.
    const prevStep = this.prevStep;

    if (!prevStep) {
      return true;
    }

    // Make a list of every known contiguous region on the map (initially empty)
    const regions: Cell[][] = [];
    // Scan every empty cell (and my location, and the exit cell) in the map
    this.gameMap.navigableCells.forEach((cell) => {
      // Exclude filled cells (except the currently occupied one)
      // TODO: to work with two cars, we need to check the progress one
      // turn back.
      if (prevStep.filledCells.includes(cell)) {
        return;
      }

      const adjCells = cell
        .getAdjacentNavigableCells()
        .filter((adjCell) => !prevStep.filledCells.includes(adjCell));

      // Check whether this cell is adjacent to any cell in any of the
      // known contiguous regions
      const inTheseRegions = regions.filter((region) =>
        adjCells.some((adjCell) => region.includes(adjCell))
      );
      switch (inTheseRegions.length) {
        case 0:
          {
            // Not in any known region yet. Start a new one.
            regions.push([cell]);
          }
          break;
        case 1:
          // In one known region. Add it to that one.
          inTheseRegions[0].push(cell);
          break;
        default: // In more than one. Join them together.
        {
          const mergeRegion = inTheseRegions[0];
          mergeRegion.push(cell);
          for (let i = 1; i < inTheseRegions.length; i++) {
            mergeRegion.splice(mergeRegion.length, 0, ...inTheseRegions[i]);
            regions.splice(regions.indexOf(inTheseRegions[i]), 1);
          }
        }
      }
    });

    const myRegion = regions.find((region) => region.includes(prevStep.cell))!;

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
    const housesAndAliens = this.aliens.concat(this.emptyHouses);

    // For each house/alien...
    return housesAndAliens.every((cellToCheckReachable) => {
      // ... look at all the cells it's reachable from...
      return (
        cellToCheckReachable
          .getAdjacentNavigableCells()
          // ... and see if any of them ...
          .some((nc) => {
            // ... are present in the same contiguous region
            // as my position last turn,
            if (!myRegion.includes(nc)) {
              return false;
            }
            // ... and has enough space so you don't have to dead end to reach it
            if (
              nc
                .getAdjacentNavigableCells()
                .filter((ncc) => myRegion.includes(ncc)).length < 2
            ) {
              return false;
            }
            return true;
          })
      );
    });
  }
}
