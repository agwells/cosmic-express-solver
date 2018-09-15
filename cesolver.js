#! /usr/bin/env node

const blessed = require('blessed');
const os = require('os');
const timers = require('timers');

const { FACINGS } = require('./src/constants');
const GameMap = require('./src/GameMap');
const Step = require('./src/Step');

/**
 * Process command-line flags
 */
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
  console.error('Usage: cesolver.js [--non-interactive|-I] MAPFILE');
  process.exit(1);
}
const gameMap = new GameMap(mapfile);

// Starting state
var steps = [
  // TODO: Maybe some smarter handling of the starting facing?
  new Step(gameMap, gameMap.startingPos),
];

var curStep = steps[0];
var i = 0;
var lastRender = os.uptime();

/**
 * Set up terminal display
 */
var screen, mapDisplay, statusBox, instructionBox;
var isGamePaused = true;
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
  screen.key(['escape', 'q', 'C-c'], function(ch, key) {
    return process.exit(0);
  });

  screen.key(['p', 'space'], function(ch, key) {
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

  screen.key(['.'], function(ch, key) {
    if (isGamePaused) {
      screen.render();
      timers.setImmediate(mainProgramLoop);
    }
  });

  screen.key(['b'], function(ch, key) {
    if (isGamePaused) {
      // Manually backing out of a bad route
      steps.pop();
      curStep.undo();
      statusBox.setContent(
        `${i} : ${curStep.cell.toString()} : Manually backing up.`
      );
      if (steps.length == 0) {
        if (!interactiveMode) {
          statusBox.sinceLastPrint = statusBox.PRINT_INTERVAL;
        }
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
  };
  mapDisplay = {
    setContent: function(content) {
      this.content = content;
    },
    content: '',
  };
  statusBox = {
    PRINT_INTERVAL: 100000,
    sinceLastPrint: 100000,
    setContent: function(content) {
      if (this.sinceLastPrint === this.PRINT_INTERVAL) {
        console.log(content);
        this.sinceLastPrint = 0;
      }
      this.sinceLastPrint++;
    },
  };
  instructionBox = {
    setContent: function() {},
  };
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
function mainProgramLoop() {
  i++;
  if (curStep.isWin()) {
    instructionBox.setContent('Press q to exit.');
    statusBox.setContent('Solved!');
    screen.render();
    if (!interactiveMode) {
      console.log('Solved!');
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
        statusBox.sinceLastPrint = statusBox.PRINT_INTERVAL;
      }
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
  } else {
    // Step in the first direction.
    // Remove that direction from the list of available directions so we
    // don't have to try it again.
    let moveThisWay = curStep.availableDirections.shift();
    let nextPos = curStep.cell.getNextCell(moveThisWay);
    //        console.log(`Moving ${FACING_STRINGS.get(moveThisWay)} to ${nextPos}`);
    let nextStep = new Step(gameMap, nextPos, curStep, moveThisWay);
    steps.push(nextStep);

    // Update the curses map
    let arrow;
    switch (moveThisWay.toString()) {
      case FACINGS.NORTH.toString():
        arrow = '^';
        break;
      case FACINGS.EAST.toString():
        arrow = '>';
        break;
      case FACINGS.SOUTH.toString():
        arrow = 'v';
        break;
      case FACINGS.WEST.toString():
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
