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
    WILDCARD_HOUSE: 'x'
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
    startingPos: "0,0"
};

if (process.argv.length < 3) {
    console.error("specify the map file as the first argument");
    process.exit(1);
}

var mapfile = process.argv[2];
const rawmap = fs.readFileSync(mapfile, "UTF-8");

// Find out the size of the map
{
    let lines = rawmap.split("\n");
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
});
var box = blessed.box({
    content: rawmap
});
screen.append(box);
box.focus();
// Quit on Escape, q, or Control-C. 
screen.key(['escape', 'q', 'C-c'], function(ch, key) {
  return process.exit(0);
});
screen.render();
// Create a screen object. 
//sleep.sleep(5);

class Cell {
    constructor(pos) {
        var x, y;
        if (Array.isArray(pos)) {
            [x, y] = pos;
        } else if (arguments.length == 1) {
            [x, y] = pos.split(',');
            x = parseInt(x);
            y = parseInt(y);
        }

        this.x = x;
        this.y = y;

        if (Cell.cellcache.has(this.toStringObj())){
            return Cell.cellcache.get(this.toStringObj());
        }

        if (x < 0 || x >= map.width || y < 0 || y >= map.height ) {
            this.outOfBounds = true;
        } else {
            this.outOfBounds = false;
        }
        Cell.cellcache.set(this.toStringObj(), this);
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
        return new Cell(pos);
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
        return rawmap.charAt(this.x + (this.y * (map.width + 1)));
    }

    toString() {
        return `${this.x},${this.y}`;
    }

    toStringObj() {
        return new String(this.toString());
    }

    getNextCell(facing) {
        return Cell.at(
            [
                this.x + parseInt(facing[0]), 
                this.y + parseInt(facing[1])
            ]
        );
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

    isWin() {
        // TODO: aliens
        return this.cell.getContent() === CELLTYPE.EXIT;
    }

    undo() {
        var i = Step.filledCells.indexOf(this.cell.toString());
        Step.filledCells.splice(i, 1);
    }
}
// A list of filled cells in the latest step (represented as strings)
// This is a performance optimization, so I don't have to loop through
// all the steps
Step.filledCells = [];

// Locate cells that must be reached in a winning solution
{
    for (let x = 0; x < map.width; x++) {
        for (let y = 0; y < map.height; y++) {
            let pos = `${x},${y}`;
            switch( Cell.at(pos).getContent() ) {
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
            }
        }
    }
}

// Starting state
var steps = [
    // TODO: Maybe some smarter handling of the starting facing
    new Step(map.startingPos)
];

var route = new String(rawmap);
var curStep = steps[0];
var i = 0;
var lastRender = os.uptime();
function eachStep() {
//    console.log(`At cell ${curStep.cell.toString()}`);
    if (curStep.availableDirections.length > 0) {
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
        let stringIdx = curStep.cell.x + ((map.width + 1) * curStep.cell.y);
        route = route.slice(0, stringIdx) + arrow + route.slice(stringIdx + 1);
        curStep = nextStep;
    } else {
        // This one is a dead-end. Back up.
        steps.pop();
        curStep.undo();
        let stringIdx = curStep.cell.x + ((map.width + 1) * curStep.cell.y);
        route = route.slice(0, stringIdx) + curStep.cell.getContent() + route.slice(stringIdx + 1);
        if (steps.length == 0) {
            console.error("Error: no more steps available. Unsolveable level?");
            process.exit(2);
        }
        curStep = steps[steps.length-1];
//        console.log(`Dead end. Backing up to ${curStep.cell.toString()}`);
    }
    if (true || os.uptime() > lastRender) {
        lastRender = os.uptime();
        box.setContent(route.valueOf());
        screen.render();
    }

    if (!curStep.isWin()) {
        timers.setImmediate(eachStep, 1);
    } else {
        console.log(steps);
    }
}

timers.setImmediate(eachStep);
