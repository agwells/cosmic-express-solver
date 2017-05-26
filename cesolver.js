#! /usr/bin/env node

const fs = require('fs');
const blessed = require('blessed');
const os = require('os');
const timers = require('timers');

// Key to the map
const CELLTYPE = {
    EMPTY: '.',
    WALL: '#',
    CROSSING: '+',
    WARP: '*',
    EXIT: 'Z',
    FRONT_CAR: 'A',
    OTHER_CARS: 'a',
    GREEN_ALIEN: 'G',
    GREEN_HOUSE: 'g',
    ORANGE_ALIEN: 'O',
    ORANGE_HOUSE: 'o',
    PURPLE_ALIEN: 'P',
    PURPLE_HOUSE: 'p',
    WILDCARD_HOUSE: '?'
}

const NORTH = [0,-1];
const EAST = [1,0];
const SOUTH = [0,1];
const WEST = [-1,0];
const FACINGS = [
    NORTH,
    EAST,
    SOUTH,
    WEST
];
var FACING_STRINGS = new Map();
FACING_STRINGS.set(NORTH, "north");
FACING_STRINGS.set(EAST, "east");
FACING_STRINGS.set(SOUTH, "south");
FACING_STRINGS.set(WEST, "west");

var map = {
    height: 0,
    width: 0,
    numberOfCars: 1,
    navigableCells: [], 
    startingPos: undefined,
    exitPos: undefined,
    warps: [], // TODO: support for more than one pair of warps
                // ... wait, *are* there any levels with more than one pair
                // of warps?
    aliens: [],
    houses: [],
    rawmap: "",
    getCharAt: function(x, y) {
        return this.rawmap.charAt(x + (y * (this.width + 1)));
    },
};

var badArgs = false;
if (process.argv.length < 3) {
    badArgs = true;
}

var interactiveMode = true;
var mapfile;
if (process.argv[2] === '--non-interactive' || process.argv[2] === '-I') {
    interactiveMode = false;
    if (process.argv.length < 4) {
        badArgs = true;
    } else {
        mapfile = process.argv[3];
    }
} else {
    mapfile = process.argv[2];
}

if (badArgs) {
    console.error("Usage: cesolver.js [--non-interactive|-I] MAPFILE");
    process.exit(1);
}

map.rawmap = fs.readFileSync(mapfile, "UTF-8");
// Ignore that annoying dangling newline vi puts in
if (map.rawmap.slice(-1) === "\n") {
    map.rawmap = map.rawmap.slice(0, -1);
}

// Find out the size of the map
{
    let lines = map.rawmap.split("\n");
    map.height = lines.length;
    map.width = lines[0].length;
    // Validate that the map is properly rectangular
    if (!lines.every(line => (line.length === map.width))) {
        console.error("Invalid map file. Every row in the file must be the same size.");
        process.exit(1);
    }
//    console.log("Map size " + map.width + " by " + map.height);
}

var screen, mapDisplay, statusBox, instructionBox;
var isGamePaused = true;
if (interactiveMode) {
    screen = blessed.screen({
        fastCSR: true
    //    "autoPadding": true
    });
    mapDisplay = blessed.box({
        content: map.rawmap,
        height: map.height + 2,
        width: map.width + 2,
        border: {
            type: 'line'
        }
    });
    screen.append(mapDisplay);
    // A text box to put status messages in
    statusBox = blessed.text({
        top: mapDisplay.height,
        height: 1,
        content: "READY"
    });
    screen.append(statusBox);
    instructionBox = blessed.text({
        top: (+mapDisplay.height) + (+statusBox.height),
        content: "Press SPACE to start.\nPress . to step."
    });
    screen.append(instructionBox);

    // Quit on Escape, q, or Control-C.
    screen.key(['escape', 'q', 'C-c'], function(ch, key) {
    return process.exit(0);
    });

    screen.key(['p', 'space'], function(ch, key) {
        if (isGamePaused) {
            instructionBox.setContent(
                "Press SPACE to pause."
            );
            statusBox.setContent("Solving...");
            isGamePaused = false;
            timers.setImmediate(eachStep);
        } else {
            instructionBox.setContent(
                "Press SPACE to start.\nPress . to step."
            );
            statusBox.setContent("PAUSED");
            isGamePaused = true;
        }
    });

    screen.key(['.'], function(ch, key) {
        if (isGamePaused) {
            screen.render();
            timers.setImmediate(eachStep);
        }
    });

    screen.render();
} else {
    screen = {
        render: function(){}
    };
    mapDisplay = {
        setContent: function(content){
            this.content = content;
        },
        content: ""
    };
    statusBox = {
        PRINT_INTERVAL: 100000,
        sinceLastPrint: 100000,
        setContent: function(content){
            if (this.sinceLastPrint === this.PRINT_INTERVAL) {
                console.log(content);
                this.sinceLastPrint = 0;
            }
            this.sinceLastPrint++;
        }
    };
    instructionBox = {
        setContent: function(){}
    }
}

class Cell {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        if (x < 0 || x >= map.width || y < 0 || y >= map.height ) {
            this.outOfBounds = true;
        } else {
            this.outOfBounds = false;
        }
        this.adjacentCellCache = new Map();
        this.adjacentNavCellCache = false;
    }

    /**
     * Get the cell at this position. 
     * 
     * @static
     * @param {any} pos 
     * @returns {Cell}
     * 
     * @memberof Cell
     */
    static at(pos) {
        var x, y, posStr;
        if (Array.isArray(pos)) {
            [x, y] = pos;
            posStr = `${x},${y}`;
        } else if (arguments.length == 1) {
            [x, y] = pos.split(',');
            x = parseInt(x);
            y = parseInt(y);
            posStr = pos;
        }

        if (Cell.cellcache.has(posStr)){
            return Cell.cellcache.get(posStr);
        } else {
            var c = new Cell(x, y);
            Cell.cellcache.set(posStr, c);
            return c;
        }
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
        return map.getCharAt(this.x, this.y);
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

        var nextCell = Cell.at(
            [
                this.x + parseInt(facing[0]), 
                this.y + parseInt(facing[1])
            ]
        );
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
                if (map.warps[0] === nextCell) {
                    destWarp = map.warps[1];
                } else {
                    destWarp = map.warps[0];
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
        FACINGS.forEach(
            facing => {
                var nextCell = this.getNextCell(facing);
                if (nextCell.isNavigable()) {
                    result.push(nextCell);
                }
            }
        );
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
Cell.cellcache = new Map();

class Car {
    constructor(prevState) {
        if (prevState) {
            this.occupant = prevState.occupant;
            this.slimed = prevState.slimed;
        } else {
            this.occupant = Car.EMPTY;
            this.slimed = false;
        }
    }
}
Car.EMPTY = 0;
Car.GREEN_ALIEN = CELLTYPE.GREEN_ALIEN;
Car.ORANGE_ALIEN = CELLTYPE.ORANGE_ALIEN;
Car.PURPLE_ALIEN = CELLTYPE.PURPLE_ALIEN;

class Step {
    constructor(pos, prevStep) {
        this.cell = pos;
        this.prevStep = prevStep;
        this.cars = [];
        if (prevStep) {
            this.route = new String(prevStep.route);
            this.aliens = prevStep.aliens.slice();
            this.emptyHouses = prevStep.emptyHouses.slice();;
            for (let i = 0; i < map.numberOfCars; i++) {
                this.cars[i] = new Car(prevStep.cars[i]);
            }
            this.filledCells = prevStep.filledCells.slice();
            this.filledCells.push(prevStep.cell);
        } else {
            this.route = new String(map.rawmap);
            this.aliens = map.aliens.slice();
            this.emptyHouses = map.houses.slice();
            for (let i = 0; i < map.numberOfCars; i++) {
                this.cars[i] = new Car();
            }
            this.filledCells = [];
        }
        
        // Draw an X to represent our current location
        this.drawOnRoute(this.cell, "X");
        this.availableDirections = [];

        // Determine which directions are available
        FACINGS.forEach(
            facing => {
                var c = this.cell.getNextCell(facing);
                if (c.isNavigable() && !this.filledCells.includes(c)) {
                    this.availableDirections.push(facing);
                }
            }
        );

        // Update car states
        for (let i = 0; i < map.numberOfCars; i++) {
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
                for (let j = 0; j < FACINGS.length; j++) {
                    let c = carPos.getNextCell(FACINGS[j]);
                    let idx = this.emptyHouses.indexOf(c);
                    if (idx > -1) {
                        if (
                            c.getContent() === car.occupant.toLowerCase()
                            || c.getContent() === CELLTYPE.WILDCARD_HOUSE
                        ) {
                            car.occupant = Car.EMPTY;
                            this.drawOnRoute(c, "@");
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
                for (let j = 0; j < FACINGS.length; j++) {
                    let c = carPos.getNextCell(FACINGS[j]);
                    let idx = this.aliens.indexOf(c);
                    if (idx > -1) {
                        let boarded = false;
                        switch(c.getContent()) {
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
                            car.occupant = c.getContent();
                            this.aliens.splice(idx, 1);
                            this.drawOnRoute(c, "_");

                            // Only one alien per car. So we can stop checking
                            // additional squares.
                            // TODO: handling the situation where two aliens
                            // on opposite sides of the track jump and collide
                            // with each other in the air.
                            break;
                        }
                    }
                }
            }
        }
    }

    drawOnRoute(cell, char) {
        var stringIdx = cell.x + ((map.width + 1) * cell.y);
        this.route = 
            this.route.slice(0, stringIdx)
            + char
            + this.route.slice(stringIdx + 1);
    }


    isDeadEnd() {
        return (
            !this.isWin()
            && (
                this.availableDirections.length === 0
                || !this.areAllVitalCellsReachable()
                || this.cell.getContent() === CELLTYPE.EXIT
            )
        );
    }

    isWin() {
        return (
            this.cell.getContent() === CELLTYPE.EXIT
            && this.aliens.length === 0
            && this.emptyHouses.length === 0
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

    areAllVitalCellsReachable() {
        // First turn, everything will be reachable.
        if (!this.prevStep) {
            return true;
        }

        // Make a list of every known contiguous region on the map (initially empty)
        var regions = [];
        // Scan every empty cell (and my location, and the exit cell) in the map
        map.navigableCells.forEach(
            cell => {
                // Exclude filled cells (except the currently occupied one)
                // TODO: to work with two cars, we need to check the progress one
                // turn back.
                if (this.prevStep.filledCells.includes(cell)) {
                    return;
                }

                var adjCells = cell.getAdjacentNavigableCells();
                adjCells = adjCells.filter(adjCell => (!this.prevStep.filledCells.includes(adjCell)));

                // Check whether this cell is adjacent to any cell in any of the
                // known contiguous regions
                var inTheseRegions = [];
                if (adjCells.length) {
                    inTheseRegions = regions.filter(
                        region => adjCells.some(
                            adjCell => region.includes(adjCell)
                        )
                   );
                }
                switch(inTheseRegions.length) {
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
            }
        );
        
        var myRegion = regions.find(region => region.includes(this.prevStep.cell));

        // Find which region contains the exit cell
        if (!myRegion.includes(map.exitPos)) {
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
        return housesAndAliens.every(
            cellToCheckReachable => {
                return cellToCheckReachable
                    // ... check each cell next to it ...
                    .getAdjacentNavigableCells()
                    // ... and see if any of them ...
                    .some(
                        cellNextToHouse => {
                            // ... are present in the same contiguous region
                            // as my position last turn.
                            return myRegion.includes(cellNextToHouse);
                        }
                    );
            }
        );
    }
}
// A list of filled cells in the latest step (represented as strings)
// This is a performance optimization, so I don't have to loop through
// all the steps

// Locate special cells
{
    for (let x = 0; x < map.width; x++) {
        for (let y = 0; y < map.height; y++) {
            let pos = Cell.at([x,y]);
            switch( map.getCharAt(x, y) ) {
                case CELLTYPE.EXIT:
                    map.exitPos = pos;
                    // The exit counts as both a "special cell" and a navigable cell.
                    map.navigableCells.push(pos);
                    break;
                case CELLTYPE.GREEN_ALIEN:
                case CELLTYPE.ORANGE_ALIEN:
                case CELLTYPE.PURPLE_ALIEN:
                    map.aliens.push(pos);
                    break;
                case CELLTYPE.GREEN_HOUSE:
                case CELLTYPE.ORANGE_HOUSE:
                case CELLTYPE.PURPLE_HOUSE:
                case CELLTYPE.WILDCARD_HOUSE:
                    map.houses.push(pos);
                    break;
                case CELLTYPE.FRONT_CAR:
                    map.startingPos = pos;
                    map.navigableCells.push(pos);
                    break;
                case CELLTYPE.OTHER_CARS:
                    map.numberOfCars++;
                    if (map.numberOfCars > 3) {
                        console.error("ERROR: Sorry, this program only supports up to three train cars.");
                        process.exit(1);
                    }
                    break;
                case CELLTYPE.WARP:
                    map.warps.push(pos);
                    if (map.warps.length > 2) {
                        console.error("ERROR: Sorry, this program only supports one pair of wormholes per map.");
                        process.exit(1);
                    }
                    break;
                case CELLTYPE.EMPTY:
                    map.navigableCells.push(pos);
                    break;
            }
        }
    }
}

// Starting state
var steps = [
    // TODO: Maybe some smarter handling of the starting facing
    new Step(map.startingPos)
];

var curStep = steps[0];
var i = 0;
var lastRender = os.uptime();

// The main solver event loop. We execute this function as a timed event,
// so that it will share the event loop with blessed.
function eachStep() {
    i++;
    if (curStep.isWin()) {
        instructionBox.setContent("Press q to exit.");
        statusBox.setContent("Solved!");
        screen.render();
        if (!interactiveMode) {
            console.log("Solved!");
            console.log(mapDisplay.content);
        }
        return;
    }

    if (curStep.isDeadEnd()) {
        // This one is a dead-end. Back up.
        steps.pop();
        curStep.undo();
        statusBox.setContent(`${i} : ${curStep.cell.toString()} : Dead end! Backing up.`);
        if (steps.length == 0) {
            if (!interactiveMode) {
                statusBox.sinceLastPrint = statusBox.PRINT_INTERVAL;
            }
            statusBox.setContent(`ERROR: After ${i} iterations, no more steps available.`);
            screen.render();
            // console.error("Console Error: no more steps available. Unsolveable level?");
            return;
        }
        curStep = steps[steps.length-1];
        mapDisplay.setContent(curStep.route);
//        console.log(`Dead end. Backing up to ${curStep.cell.toString()}`);
    } else {
        // Step in the first direction.
        // Remove that direction from the list of available directions so we
        // don't have to try it again.
        let moveThisWay = curStep.availableDirections.shift();
        let nextPos = curStep.cell.getNextCell(moveThisWay);
//        console.log(`Moving ${FACING_STRINGS.get(moveThisWay)} to ${nextPos}`);
        let nextStep = new Step(nextPos, curStep);
        steps.push(nextStep);

        // Update the curses map
        let arrow;
        switch(moveThisWay.toString()) {
            case NORTH.toString():
                arrow = '^';
                break;
            case EAST.toString():
                arrow = '>';
                break;
            case SOUTH.toString():
                arrow = 'v';
                break;
            case WEST.toString():
                arrow = '<';
                break;
            default:
                arrow = '?';
        }
        nextStep.drawOnRoute(curStep.cell, arrow);
        statusBox.setContent(`${i} : ${curStep.cell.toString()}`);
        curStep = nextStep;
    }
    mapDisplay.setContent(curStep.route);

    // Tell the screen to render once a second
    if (true || os.uptime() > lastRender) {
        lastRender = os.uptime();
        screen.render();
    }

    if (isGamePaused) {
        // Wait for user input to continue
        return;
    } else {
        // continue immediately
        timers.setImmediate(eachStep);
    }
}

if (!interactiveMode) {
    isGamePaused = false;
    timers.setImmediate(eachStep);
}
