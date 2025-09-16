import { computeSwingOffset } from '../utils/timing.js';

export class SwingController {
  constructor(amount = 0) {
    this.amount = amount;
  }

  setAmount(amount) {
    this.amount = Math.max(0, Math.min(1, amount));
  }

  getOffset(step) {
    return computeSwingOffset(step, this.amount);
  }
}
