import { CELLTYPE } from './constants';

export class Car {
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
