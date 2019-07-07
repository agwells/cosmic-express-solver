/**
 * Glyphs on the map.
 */
export const CELLTYPE = {
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
  WILDCARD_HOUSE: '?',
  // Tracks laid down on the map to represent suspected constraints of
  // the solution.
  HINT_EAST_WEST: '-',
  HINT_EAST_NORTH: 'L',
  HINT_EAST_SOUTH: 'r',
  HINT_NORTH_SOUTH: '|',
  HINT_WEST_NORTH: 'J',
  HINT_WEST_SOUTH: '7',
};

export const FACINGS = {
  NORTH: [0, -1],
  EAST: [1, 0],
  SOUTH: [0, 1],
  WEST: [-1, 0],
  ALL: [],
};

FACINGS.ALL = [FACINGS.NORTH, FACINGS.EAST, FACINGS.SOUTH, FACINGS.WEST];

export const FACING_STRINGS = new Map();
FACING_STRINGS.set(FACINGS.NORTH, 'north');
FACING_STRINGS.set(FACINGS.EAST, 'east');
FACING_STRINGS.set(FACINGS.SOUTH, 'south');
FACING_STRINGS.set(FACINGS.WEST, 'west');
