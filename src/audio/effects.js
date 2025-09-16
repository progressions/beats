export class WarmthFilter {
  constructor({ warmth = 0.5, sampleRate = 44100 } = {}) {
    this.warmth = warmth;
    this.sampleRate = sampleRate;
    this.previous = 0;
    this.coefficient = this._computeCoefficient();
  }

  setWarmth(warmth) {
    this.warmth = Math.max(0, Math.min(1, warmth));
    this.coefficient = this._computeCoefficient();
  }

  process(sample) {
    const filtered = this.coefficient * sample + (1 - this.coefficient) * this.previous;
    this.previous = filtered;
    return filtered;
  }

  reset() {
    this.previous = 0;
  }

  _computeCoefficient() {
    const minCutoff = 400;
    const maxCutoff = 8000;
    const cutoff = minCutoff + (maxCutoff - minCutoff) * this.warmth;
    const rc = 1 / (2 * Math.PI * cutoff);
    const dt = 1 / this.sampleRate;
    return dt / (rc + dt);
  }
}
