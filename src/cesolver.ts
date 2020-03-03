#! /usr/bin/env node

import blessed from 'blessed';
import os from 'os';
import timers from 'timers';

import { FACINGS, CELLTYPE } from './constants';
import { GameMap } from './GameMap';
import { Step } from './Step';

/**
 * Process command-line flags
 */
let badArgs = false;
if (process.argv.length < 3) {
  badArgs = true;
}

let interactiveMode = true;
let mapfile = '';
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

if (badArgs || !mapfile) {
  console.error('Usage: cesolver.js [--non-interactive|-I] MAPFILE');
  process.exit(1);
}
const gameMap = new GameMap(mapfile);

// Starting state
const steps = [
  // TODO: Maybe some smarter handling of the starting facing?
  new Step(gameMap, gameMap.startingPos),
];

let curStep = steps[0];
let i = 0;
let lastRender = os.uptime();

/**
 * Set up terminal display
 */
let screen: blessed.Widgets.Screen;
let mapDisplay: blessed.Widgets.BoxElement;
let instructionBox: blessed.Widgets.TextElement;
let isGamePaused = true;
let statusBox: blessed.Widgets.TextElement;
let sinceLastStatusPrint = 0;
const STATUS_PRINT_INTERVAL = 100 * 1000;
if (interactiveMode) {
  screen = blessed.screen({
    fastCSR: true,
    //    "autoPadding": true
  });
  mapDisplay = blessed.box({
    content: gameMap.rawmap,
    height: gameMap.height + 2,
    width: gameMap.width + 2,
    border: {
      type: 'line',
    },
  });
  screen.append(mapDisplay);
  // A text box to put status messages in
  statusBox = blessed.text({
    top: mapDisplay.height,
    height: 1,
    content: 'READY',
  });
  screen.append(statusBox);
  instructionBox = blessed.text({
    top: +mapDisplay.height + +statusBox.height,
    content: 'Press SPACE to start.\nPress . to step.',
  });
  screen.append(instructionBox);

  // Quit on Escape, q, or Control-C.
  screen.key(['escape', 'q', 'C-c'], function() {
    return process.exit(0);
  });

  screen.key(['p', 'space'], function() {
    if (isGamePaused) {
      instructionBox.setContent('Press SPACE to pause.');
      statusBox.setContent('Solving...');
      isGamePaused = false;
      timers.setImmediate(mainProgramLoop);
    } else {
      instructionBox.setContent('Press SPACE to start.\nPress . to step.');
      statusBox.setContent('PAUSED');
      isGamePaused = true;
    }
  });

  screen.key(['.'], function() {
    if (isGamePaused) {
      screen.render();
      timers.setImmediate(mainProgramLoop);
    }
  });

  screen.key(['b'], function() {
    if (isGamePaused) {
      // Manually backing out of a bad route
      steps.pop();
      curStep.undo();
      statusBox.setContent(
        `${i} : ${curStep.cell.toString()} : Manually backing up.`
      );
      if (steps.length == 0) {
        statusBox.setContent(
          `ERROR: After ${i} iterations, no more steps available.`
        );
        screen.render();
        // console.error("Console Error: no more steps available. Unsolveable level?");
        return;
      }
      curStep = steps[steps.length - 1];
      mapDisplay.setContent(curStep.route);
      //        console.log(`Dead end. Backing up to ${curStep.cell.toString()}`);
      timers.setImmediate(mainProgramLoop);
    }
  });

  screen.render();
} else {
  screen = {
    render: function() {},
  } as any;
  mapDisplay = {
    setContent: function(content: string) {
      this.content = content;
    },
    content: '',
  } as any;
  statusBox = {
    setContent: function(content: string) {
      if (i % STATUS_PRINT_INTERVAL === 0) {
        console.log(content);
        console.log(mapDisplay.content);
        console.log('');
        // sinceLastStatusPrint = 0;
      }
      // sinceLastStatusPrint++;
    },
  } as any;
  instructionBox = {
    setContent: function() {},
  } as any;
}

/**
 * Launch the solver!
 */
if (!interactiveMode) {
  isGamePaused = false;
  timers.setImmediate(mainProgramLoop);
}

/**
 * The main event loop of the solver program.
 *
 * We execute this repeatedly, using setImmediate(), so that it will share
 * the JS event loop with the "blessed" library that updates the screen and
 * monitors user input for us.
 *
 * @returns {void}
 */
function mainProgramLoop(): void {
  i++;
  if (curStep.isWin()) {
    instructionBox.setContent('Press q to exit.');
    statusBox.setContent(`Solved in ${i} iterations`);
    screen.render();
    if (!interactiveMode) {
      console.log(`Solved in ${i} iterations`);
      console.log(mapDisplay.content);
    }
    return;
  }

  if (curStep.isDeadEnd()) {
    // This one is a dead-end. Back up.
    steps.pop();
    curStep.undo();
    statusBox.setContent(
      `${i} : ${curStep.cell.toString()} : Dead end! Backing up.`
    );
    if (steps.length == 0) {
      if (!interactiveMode) {
        sinceLastStatusPrint = STATUS_PRINT_INTERVAL;
      }
      statusBox.setContent(
        `ERROR: After ${i} iterations, no more steps available.`
      );
      screen.render();
      console.error(
        'Console Error: no more steps available. Unsolveable level?'
      );
      return;
    }
    curStep = steps[steps.length - 1];
    //        console.log(`Dead end. Backing up to ${curStep.cell.toString()}`);
  } else {
    // Step in the first direction.
    // Remove that direction from the list of available directions so we
    // don't have to try it again.
    const moveThisWay = curStep.availableDirections.shift()!;
    const nextPos = curStep.cell.getNextCell(moveThisWay);
    //        console.log(`Moving ${FACING_STRINGS.get(moveThisWay)} to ${nextPos}`);
    const nextStep = new Step(gameMap, nextPos, curStep, moveThisWay);
    steps.push(nextStep);

    // Update the curses map
    let arrow: CELLTYPE;
    switch (moveThisWay) {
      case FACINGS.NORTH:
        arrow = CELLTYPE.ROUTE_NORTH;
        break;
      case FACINGS.EAST:
        arrow = CELLTYPE.ROUTE_EAST;
        break;
      case FACINGS.SOUTH:
        arrow = CELLTYPE.ROUTE_SOUTH;
        break;
      default:
      case FACINGS.WEST:
        arrow = CELLTYPE.ROUTE_WEST;
        break;
    }
    nextStep.drawOnRoute(curStep.cell, arrow);
    statusBox.setContent(`${i} : ${curStep.cell.toString()}`);
    curStep = nextStep;
  }
  mapDisplay.setContent(curStep.route);

  //  Tell the screen to render once a second
  if (os.uptime() > lastRender) {
    lastRender = os.uptime();
    screen.render();
  }

  if (isGamePaused) {
    // Wait for user input to continue
    return;
  } else {
    // continue immediately
    timers.setImmediate(mainProgramLoop);
  }
}
