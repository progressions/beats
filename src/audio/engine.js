import EventEmitter from 'events';
import Speaker from 'speaker';
import { Readable } from 'stream';
import { AudioClock } from './timing.js';
import { SwingController } from './swing.js';
import { WarmthFilter } from './effects.js';
import { Voice } from './synthesis.js';
import { beatsToSeconds } from '../utils/timing.js';

export class AudioEngine extends EventEmitter {
  constructor({ sampleRate = 44100, channels = 1 } = {}) {
    super();
    this.sampleRate = sampleRate;
    this.channels = channels;
    this.measure = null;
    this.clock = new AudioClock({ tempo: 120, sampleRate });
    this.swing = new SwingController();
    this.voice = new Voice({ sampleRate });
    this.filter = new WarmthFilter({ sampleRate });
    this.speaker = null;
    this.loopBuffer = null;
    this.loopStream = null;
    this.loopChunkFrames = 2048;
    this._stopRequested = false;
    this.clock.on('beat', (data) => this.emit('beat', data));
  }

  setMeasure(measure) {
    this.measure = measure;
    this.clock.updateTempo(measure.tempo);
    this.swing.setAmount(measure.swing);
    this.filter.setWarmth(measure.warmth);
    this.loopBuffer = this.renderLoopBuffer();
    this.emit('measureChanged', this.measure);
    if (this.speaker) {
      this._restartLoopStream();
    }
  }

  setTempo(tempo) {
    this.clock.updateTempo(tempo);
    if (this.measure) {
      this.measure.tempo = tempo;
      this.loopBuffer = this.renderLoopBuffer();
      if (this.speaker) {
        this._restartLoopStream();
      }
    }
  }

  setSwing(amount) {
    this.swing.setAmount(amount);
    if (this.measure) {
      this.measure.swing = amount;
      this.loopBuffer = this.renderLoopBuffer();
      if (this.speaker) {
        this._restartLoopStream();
      }
    }
  }

  setWarmth(amount) {
    this.filter.setWarmth(amount);
    if (this.measure) {
      this.measure.warmth = amount;
      this.loopBuffer = this.renderLoopBuffer();
      if (this.speaker) {
        this._restartLoopStream();
      }
    }
  }

  start() {
    if (!this.measure || this.speaker) {
      return;
    }
    this.speaker = new Speaker({
      channels: this.channels,
      sampleRate: this.sampleRate,
      bitDepth: 16,
      signed: true,
      float: false
    });
    this.clock.start();
    this._startLoopStream();
    this.emit('start');
  }

  stop() {
    this._stopLoopStream();
    if (this.speaker) {
      this.speaker.end();
      this.speaker.close(false);
      this.speaker = null;
    }
    this.clock.stop();
    this.emit('stop');
  }

  toggle() {
    if (this.speaker) {
      this.stop();
    } else {
      this.start();
    }
  }

  renderLoopBuffer() {
    if (!this.measure) {
      return null;
    }
    const stepDurationBeats = 0.25;
    const totalBeats = this.measure.loopLength * stepDurationBeats;
    const loopDurationSeconds = beatsToSeconds(totalBeats, this.measure.tempo);
    const totalSamples = Math.max(1, Math.floor(loopDurationSeconds * this.sampleRate));
    const buffer = new Float32Array(totalSamples * this.channels);

    this.measure.notes.forEach((note) => {
      const durationBeats = note.durationBeats || 1;
      const durationSeconds = beatsToSeconds(durationBeats, this.measure.tempo);
      const startBeats = note.step * stepDurationBeats + this.swing.getOffset(note.step);
      const startSeconds = beatsToSeconds(startBeats, this.measure.tempo);
      const startSampleIndex = Math.floor(startSeconds * this.sampleRate) * this.channels;
      const samples = this.voice.generate({ midi: note.midi, duration: durationSeconds, warmth: this.measure.warmth });
      for (let i = 0; i < samples.length; i += 1) {
        const bufferIndex = startSampleIndex + i * this.channels;
        if (bufferIndex < buffer.length) {
          for (let ch = 0; ch < this.channels; ch += 1) {
            buffer[bufferIndex + ch] += samples[i] * note.velocity;
          }
        }
      }
    });

    this.filter.reset();
    for (let i = 0; i < buffer.length; i += 1) {
      buffer[i] = this.filter.process(buffer[i]);
    }

    const output = Buffer.alloc(buffer.length * 2);
    for (let i = 0; i < buffer.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, buffer[i]));
      output.writeInt16LE(sample * 0x7fff, i * 2);
    }
    return output;
  }

  _startLoopStream() {
    if (!this.loopBuffer || !this.speaker) {
      return;
    }
    this._stopLoopStream();
    this._stopRequested = false;
    const buffer = this.loopBuffer;
    const chunkBytes = Math.max(1, Math.min(buffer.length, this.loopChunkFrames * this.channels * 2));
    let offset = 0;
    const context = this;
    this.loopStream = new Readable({
      read() {
        if (!context.speaker || context._stopRequested) {
          this.push(null);
          return;
        }
        if (buffer.length === 0) {
          this.push(null);
          return;
        }
        const end = Math.min(offset + chunkBytes, buffer.length);
        const chunk = buffer.slice(offset, end);
        offset = end;
        if (offset >= buffer.length) {
          offset = 0;
        }
        this.push(Buffer.from(chunk));
      }
    });
    this.loopStream.on('error', (error) => this.emit('error', error));
    this.loopStream.pipe(this.speaker);
  }

  _stopLoopStream() {
    this._stopRequested = true;
    if (this.loopStream) {
      if (this.speaker) {
        this.loopStream.unpipe(this.speaker);
      }
      this.loopStream.destroy();
      this.loopStream = null;
    }
  }

  _restartLoopStream() {
    if (!this.speaker) {
      return;
    }
    this._startLoopStream();
  }
}
