import EventEmitter from 'events';
import { beatsToSeconds, durationToBeats } from '../utils/timing.js';

export class AudioClock extends EventEmitter {
  constructor({ tempo = 120, sampleRate = 44100 }) {
    super();
    this.tempo = tempo;
    this.sampleRate = sampleRate;
    this.isRunning = false;
    this.lookAhead = 0.1; // seconds
    this.scheduleInterval = 25; // ms
    this.nextEventTime = 0;
    this.currentBeat = 0;
    this.timer = null;
  }

  start(offsetBeats = 0) {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;
    this.nextEventTime = process.hrtime.bigint();
    this.currentBeat = offsetBeats;
    this.timer = setInterval(() => this._tick(), this.scheduleInterval);
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  updateTempo(tempo) {
    this.tempo = tempo;
  }

  scheduleNote(note, swingOffset = 0) {
    const durationBeats = durationToBeats(note.duration);
    const eventTime = this._computeEventTime(note.step, swingOffset);
    this.emit('schedule', {
      note,
      startTime: eventTime,
      duration: beatsToSeconds(durationBeats, this.tempo)
    });
  }

  _computeEventTime(step, swingOffset = 0) {
    const beats = step + swingOffset;
    const seconds = beatsToSeconds(beats, this.tempo);
    const nanos = BigInt(Math.round(seconds * 1e9));
    return this.nextEventTime + nanos;
  }

  _tick() {
    if (!this.isRunning) {
      return;
    }
    const now = process.hrtime.bigint();
    const lookAheadNanos = BigInt(Math.round(this.lookAhead * 1e9));
    while (this.nextEventTime < now + lookAheadNanos) {
      this.emit('beat', {
        beat: this.currentBeat,
        time: this.nextEventTime
      });
      const beatDuration = beatsToSeconds(1, this.tempo);
      this.nextEventTime += BigInt(Math.round(beatDuration * 1e9));
      this.currentBeat += 1;
    }
  }
}
