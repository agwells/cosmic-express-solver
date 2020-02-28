import { CELLTYPE, FACINGS, Facing, Alien, ALL_FACINGS } from './constants';
import { Car } from './Car';
import { GameMap } from 'GameMap';
import { Cell } from 'Cell';
import dijkstra from 'graphology-shortest-path/dijkstra';
// @ts-ignore
//import fs from 'fs';

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
      this.filledCells = prevStep.filledCells.concat(prevStep.cell);

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

  isDeadEnd(turn: number): boolean {
    return (
      this.availableDirections.length === 0 ||
      this.cell.getContent() === CELLTYPE.EXIT ||
      this.isRedundantPath() ||
      (turn % 10 === 0 && !this.areAllVitalCellsReachableSlow()) ||
      !this.areAllVitalCellsReachableFast()
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

  areAllVitalCellsReachableFast(): boolean {
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

  areAllVitalCellsReachableSlow(): boolean {
    // First turn, everything will be reachable.
    const prevStep = this.prevStep;

    if (!prevStep) {
      return true;
    }

    const currentGraph = this.gameMap.graph.copy();
    // Remove edges that pass through the places we've lain our tracks
    this.filledCells.forEach((cell) =>
      currentGraph
        .extremities(cell.toString())
        .forEach((node) => currentGraph.dropNode(node))
    );

    // See if there's a path from the front car to the exit
    // if (
    //   !dijkstra.bidirectional(
    //     currentGraph,
    //     currentGraph.target(this.cell.toString()),
    //     currentGraph.source(this.gameMap.exitPos.toString())
    //   )
    // ) {
    //   // console.log(this.route);
    //   // console.log('No path from front car to exit');
    //   return false;
    // }

    const vitalCells = this.aliens.concat(this.emptyHouses);
    return vitalCells.every((vitalCell) =>
      vitalCell.getAdjacentNavigableCells().some((adjCell) => {
        if (this.filledCells.includes(adjCell)) {
          return false;
        }
        // Use Suurballe's algorithm to see if there is a path from the front
        // car to the vital cell to the exit.
        const g = currentGraph.copy();
        const dest = g.source(adjCell.toString());

        // Add an "origin" node that connects to the front car and the exit.
        g.addNode('origin', { x: -10, y: 0 });
        g.addDirectedEdge('origin', g.source(this.cell.toString()), {
          weight: 1,
        });
        g.addDirectedEdge('origin', g.source(this.gameMap.exitPos.toString()), {
          weight: 1,
        });

        // Try to find two disjoint paths between the origin node and the vital cell
        // 1. Find the shortest path tree rooted at node s
        const shortestPathTree = dijkstra.singleSource(g, 'origin');
        // Let P1 be the shortest cost path from s (origin) to t (destination)
        const p1 = shortestPathTree[dest];
        if (!p1) {
          //          console.log(`no path to ${dest}`);
          return false;
        }
        //        console.log(p1);

        // 2. Modify the cost of each edge in the graph by replacing the cost
        // w(u,v) of every edge (u,v) to w'(u,v) = w(u,v) - d(s,v) + d(s,u)
        // (where d() means the distance from the origin node)
        g.forEachEdge((e) => {
          const [source, target] = g.extremities(e);
          const u = shortestPathTree[source];
          const v = shortestPathTree[target];
          if (!u || !v) {
            return;
          }
          const weight = g.getEdgeAttribute(e, 'weight');
          const newWeight = weight - v.length + u.length;
          g.setEdgeAttribute(e, 'weight', newWeight);
        });

        // 3. Create a residual graph G1 by...
        for (let i = 0; i < p1.length - 1; i++) {
          const source = p1[i];
          const target = p1[i + 1];
          // ... removing the edges of G on the shortest path P1 that are
          // directed towards s
          if (g.hasEdge(target, source)) {
            g.dropEdge(target, source);
          }

          // ... and reverse the direction of the zero-length edges along path P1
          const e = g.edge(source, target)!;
          const attributes = g.getEdgeAttributes(e);
          if (attributes.weight === 0) {
            g.dropEdge(e);
            g.addDirectedEdgeWithKey(e, target, source, {
              ...attributes,
              reversed: true,
            });
          }
        }

        // 4. Find the shortest path P2 in the residual graph
        const p2 = dijkstra.bidirectional(g, 'origin', dest, 'weight');
        if (!p2) {
          return false;
        }

        return true;
      })
    );
  }
}
