import { midiToFrequency } from '../utils/music.js';

export class Envelope {
  constructor({ attack = 0.01, decay = 0.1, sustain = 0.7, release = 0.2 } = {}) {
    this.attack = attack;
    this.decay = decay;
    this.sustain = sustain;
    this.release = release;
  }

  amplitude(time, duration) {
    if (time < this.attack) {
      return time / this.attack;
    }
    if (time < this.attack + this.decay) {
      const decayProgress = (time - this.attack) / this.decay;
      return 1 - decayProgress * (1 - this.sustain);
    }
    if (time < duration) {
      return this.sustain;
    }
    const releaseTime = time - duration;
    if (releaseTime > this.release) {
      return 0;
    }
    const releaseProgress = releaseTime / this.release;
    return this.sustain * (1 - releaseProgress);
  }
}

export class Voice {
  constructor({ sampleRate = 44100, envelope = new Envelope() } = {}) {
    this.sampleRate = sampleRate;
    this.envelope = envelope;
  }

  generate({ midi, duration, warmth = 0.5 }) {
    const frequency = midiToFrequency(midi);
    const totalSamples = Math.floor(duration * this.sampleRate);
    const samples = new Float32Array(totalSamples);
    const harmonics = [1, 0.5, 0.25];

    for (let i = 0; i < totalSamples; i += 1) {
      const time = i / this.sampleRate;
      let value = 0;
      harmonics.forEach((amp, index) => {
        const harmonicFreq = frequency * (index + 1);
        value += amp * Math.sin(2 * Math.PI * harmonicFreq * time);
      });
      const warmthFactor = 1 - warmth * 0.4;
      value *= warmthFactor;
      value += warmth * Math.tanh(value * 2);
      const env = this.envelope.amplitude(time, duration);
      samples[i] = value * env;
    }
    return samples;
  }
}
