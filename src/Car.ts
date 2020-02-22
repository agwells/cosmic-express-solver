import { Alien } from './constants';

export class Car {
  occupant: Alien | null;
  slimed: boolean;

  constructor(prevState?: Car) {
    if (prevState) {
      this.occupant = prevState.occupant;
      this.slimed = prevState.slimed;
    } else {
      this.occupant = null;
      this.slimed = false;
    }
  }
}
