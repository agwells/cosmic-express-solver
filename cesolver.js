#! /usr/bin/env node

const fs = require('fs');
const blessed = require('blessed');
const sleep = require('sleep');
const os = require('os');
const timers = require('timers');

// Key to the map
const CELLTYPE = {
    EMPTY: '.',
    WALL: '#',
    CROSSING: '+',
    WARP: '*',
    EXIT: 'Z',
    START: 'A',
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
    numberOfCars: 2, // TODO: if I want this to work on other maps, make this more flexible
    specialCells: [],
    startingPos: [0,0],
    warps: [], // TODO: support for more than one pair of warps
    rawmap: "",
    getCharAt: function(x, y) {
        return this.rawmap.charAt(x + (y * (this.width + 1)));
    },
};

if (process.argv.length < 3) {
    console.error("specify the map file as the first argument");
    process.exit(1);
}

var mapfile = process.argv[2];
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

var screen = blessed.screen({
//    "autoPadding": true
});
var mapDisplay = blessed.box({
    content: map.rawmap,
    height: map.height + 2,
    width: map.width + 2,
    border: {
        type: 'line'
    }
});
screen.append(mapDisplay);
var statusBox = blessed.text({
    top: mapDisplay.height,
    'content': "Press SPACE to start.\nPress . to step."
});
screen.append(statusBox);

// Quit on Escape, q, or Control-C. 
screen.key(['escape', 'q', 'C-c'], function(ch, key) {
  return process.exit(0);
});

var isGamePaused = true;
screen.key(['p', 'space'], function(ch, key) {
    if (isGamePaused) {
        statusBox.setContent(
            "Press SPACE to pause."
        );
        isGamePaused = false;
        timers.setImmediate(eachStep);
    } else {
        statusBox.setContent(
            "Press SPACE to start.\nPress . to step."
        );
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
// Create a screen object. 
//sleep.sleep(5);

class Cell {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        if (x < 0 || x >= map.width || y < 0 || y >= map.height ) {
            this.outOfBounds = true;
        } else {
            this.outOfBounds = false;
        }
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
            posStr = new String(`${x},${y}`);
        } else if (arguments.length == 1) {
            [x, y] = pos.split(',');
            x = parseInt(x);
            y = parseInt(y);
            posStr = new String(pos);
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
        var nextCell = Cell.at(
            [
                this.x + parseInt(facing[0]), 
                this.y + parseInt(facing[1])
            ]
        );
        switch (nextCell.getContent()) {
            case CELLTYPE.CROSSING:
                // If it's a crossing, we basically skip it over and look
                // at the next cell past it
                return nextCell.getNextCell(facing);
            case CELLTYPE.WARP:
                // If it's a warp, we look at the cell next to the other warp.
                // So find the other warp in map.warps.
                // @todo: support for more than one pair of warps
                let destWarp;
                if (map.warps[0] === this) {
                    destWarp = map.warps[1];
                } else {
                    destWarp = map.warps[0];
                }
                return destWarp.getNextCell(facing);
            default:
                return nextCell;
        }
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
                return true;
            default:
        }
        return false;
    }
}
Cell.cellcache = new WeakMap();

class Car {
    constructor() {
        this.occupant = Car.EMPTY;
        this.slimed = false;
    }
}
Car.EMPTY = 0;
Car.GREEN_ALIEN = 1;
Car.ORANGE_ALIEN = 2;
Car.PURPLE_ALIEN = 3;

class Step {
    constructor(pos) {
        this.pos = pos;
        this.cell = Cell.at(pos);
        Step.filledCells.push(this.cell.toString());
        this.availableDirections = [];
        // TODO: car & alien logic
        // this.cars = [];
        // for (let i = 0; i < map.numberOfCars; i++) {
        //     this.cars.push(new Car());
        // }

        // Determine which directions are available
        FACINGS.forEach(
            facing => {
                var c = this.cell.getNextCell(facing);
                if (c.isNavigable() && !Step.filledCells.includes(c.toString())) {
                    this.availableDirections.push(facing);
                }
            }
        );

        // Determine state of the cars
        // @todo
    }

    isDeadEnd() {
        return !(
            this.availableDirections.length > 0
            && this.areAllVitalCellsReachable()
        );
    }

    isWin() {
        // TODO: aliens
        return this.cell.getContent() === CELLTYPE.EXIT;
    }

    undo() {
        var i = Step.filledCells.indexOf(this.cell.toString());
        Step.filledCells.splice(i, 1);
    }

    areAllVitalCellsReachable() {
        // Make sure every special cell has at least one reachable cell
        return map.specialCells.every(pos => {
            var specialCell = Cell.at(pos);
            // Only one adjacent cell needs to be reachable
            return FACINGS.some(
                facing => {
                    var c = specialCell.getNextCell(facing);
                    // TODO: eliminate this duplicate code (from line 228)
                    return (
                        c.isNavigable() 
                        && (
                            (c.x == this.cell.x && c.y == this.cell.y)
                            || !Step.filledCells.includes(c.toString())
                        )
                    );
                }
            );
        });
    }
}
// A list of filled cells in the latest step (represented as strings)
// This is a performance optimization, so I don't have to loop through
// all the steps
Step.filledCells = [];

// Locate special cells
{
    for (let x = 0; x < map.width; x++) {
        for (let y = 0; y < map.height; y++) {
            let pos = [x,y];
            switch( map.getCharAt(x, y) ) {
                case CELLTYPE.EXIT:
                case CELLTYPE.GREEN_ALIEN:
                case CELLTYPE.ORANGE_ALIEN:
                case CELLTYPE.PURPLE_ALIEN:
                case CELLTYPE.GREEN_HOUSE:
                case CELLTYPE.ORANGE_HOUSE:
                case CELLTYPE.PURPLE_HOUSE:
                case CELLTYPE.WILDCARD_HOUSE:
                    map.specialCells.push(pos)
                    break;
                case CELLTYPE.START:
                    map.startingPos = pos;
                    break;
                case CELLTYPE.WARP:
                    map.warps.push(Cell.at(pos));
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

var route = new String(map.rawmap);
var curStep = steps[0];
var i = 0;
var lastRender = os.uptime();

// The main solver event loop. We execute this function as a timed event,
// so that it will share the event loop with blessed.
function eachStep() {
    if (curStep.isWin()) {
        statusBox.setContent("Solved!");
        screen.render();
        return;
    }

    if (curStep.isDeadEnd()) {
        // This one is a dead-end. Back up.
        steps.pop();
        curStep.undo();
        drawOnRoute(curStep.cell, curStep.cell.getContent());
        if (steps.length == 0) {
            statusBox.setContent("Error: no more steps available. Unsolveable level?");
            screen.render();
            // console.error("Console Error: no more steps available. Unsolveable level?");
            return;
        }
        curStep = steps[steps.length-1];
//        console.log(`Dead end. Backing up to ${curStep.cell.toString()}`);
    } else {
        // Step in the first direction.
        // Remove that direction from the list of available directions so we
        // don't have to try it again.
        let moveThisWay = curStep.availableDirections.shift();
        let nextPos = curStep.cell.getNextCell(moveThisWay).toString();
//        console.log(`Moving ${FACING_STRINGS.get(moveThisWay)} to ${nextPos}`);
        let nextStep = new Step(nextPos);
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
        drawOnRoute(curStep.cell, arrow);
        curStep = nextStep;
    }

    // Draw an X to represent our current location
    drawOnRoute(curStep.cell, "X");

    // Tell the screen to render once a second
    if (true || os.uptime() > lastRender) {
        lastRender = os.uptime();
        mapDisplay.setContent(route.valueOf());
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

function drawOnRoute(cell, char) {
    var stringIdx = cell.x + ((map.width + 1) * cell.y);
    route = route.slice(0, stringIdx) + char + route.slice(stringIdx + 1);
}

//timers.setImmediate(eachStep);
