import EventEmitter from 'events';
import blessed from 'blessed';
import { createScreen } from '../utils/terminal.js';
import { PianoRollView } from './pianoroll.js';
import { ParameterPanel } from './parameters.js';
import { ControlHandler } from './controls.js';
import { colors, colorize } from './colors.js';
import { nextInArray, getAvailableKeys, getAvailableScales, getScaleDefinition, noteToMidi, noteNameFromMidi } from '../utils/music.js';
import { clamp, durationToBeats, secondsToBeats } from '../utils/timing.js';

export class Interface extends EventEmitter {
  constructor({ measure, audioEngine, defaults }) {
    super();
    this.measure = measure;
    this.audioEngine = audioEngine;
    this.defaults = defaults;
    this.cursorStep = 0;
    this.currentPitch = defaults.baseMidi || 60;
    this.currentDuration = defaults.duration || '1/4';
    this.stepResolutionBeats = 0.25;
    this.isPlaying = false;
    this.playheadStep = 0;
    this.playheadOffset = 0;
    this.playheadInterval = null;
    this.playStartTime = null;
    this.gradientPhase = 0;
    this.currentPitch = this._nearestScaleMidi(this.currentPitch);
    this.screen = createScreen();
    this.palette = colors();
    this.pianoRoll = new PianoRollView({ screen: this.screen, top: 0, height: '55%' });
    this.parameters = new ParameterPanel({ screen: this.screen, top: '55%', height: '20%' });
    this.status = blessed.box({
      parent: this.screen,
      top: '75%',
      left: 0,
      width: '100%',
      height: '25%',
      label: ' Status ',
      tags: true,
      border: { type: 'line' },
      style: {
        fg: this.palette.text,
        border: { fg: this.palette.accent },
        bg: this.palette.background
      },
      content: this._statusContent('Ready.')
    });
    this.helpOverlay = blessed.box({
      parent: this.screen,
      width: '70%',
      height: '60%',
      top: 'center',
      left: 'center',
      hidden: true,
      tags: true,
      border: { type: 'line' },
      label: ' Help ',
      style: {
        fg: this.palette.parameter,
        border: { fg: this.palette.accent },
        bg: this.palette.background
      },
      content: this._helpDetails()
    });
    this.helpVisible = false;
    this.controls = new ControlHandler(this.screen);
    this._registerControlEvents();
    this.refresh();
  }

  _buildHelpText() {
    return [
      '{bold}Space{/bold} Play/Pause  {bold}P{/bold} Add note  {bold}U{/bold} Remove  {bold}← →{/bold} Move cursor',
      '{bold}↑ ↓{/bold} Pitch ±  {bold}T{/bold} Tempo ±5  {bold}W{/bold} Swing  {bold}L{/bold} Loop  {bold}D{/bold} Duration',
      '{bold}K{/bold} Key  {bold}S{/bold} Scale  {bold}R{/bold} Warmth ±  {bold}3/4{/bold} Time Sig  {bold}Ctrl+S{/bold} Save  {bold}Ctrl+O{/bold} Load  {bold}Ctrl+N{/bold} New  {bold}H{/bold} Help'
    ].join('\n');
  }

  _helpDetails() {
    return [
      '{bold}Interactive Measure Editor{/bold}',
      '',
      '• Use arrow keys to position the cursor within the loop.',
      '• Press P to insert a note at the cursor using the active duration.',
      '• Press U to remove the note at the cursor.',
      '• Adjust the current note pitch with ↑ / ↓ while hovering a note.',
      '• Tempo (T/Shift+T), swing (W), key (K/Shift+K), scale (S/Shift+S),',
      '  loop length (L), warmth (R/Shift+R), and time signatures (3 or 4)',
      '  take effect immediately in the audio engine.',
      '• Press Space to start/stop playback. Ctrl+S saves, Ctrl+O loads, Ctrl+N creates a new measure.',
      '• Q quits the editor safely.',
      '',
      'All changes apply instantly. Use persistence commands to save or load.',
      'Press H again to dismiss this help.'
    ].join('\n');
  }

  _registerControlEvents() {
    this.controls.on('exit', () => {
      this.emit('exit');
    });
    this.controls.on('togglePlayback', () => this.emit('togglePlayback'));
    this.controls.on('moveCursor', (delta) => {
      const stepIncrement = this._cursorStepIncrement();
      const maxStep = this._maximumCursorStep();
      let target = this.cursorStep + delta * stepIncrement;
      target = clamp(target, 0, maxStep);
      this.cursorStep = this._snapToStepGrid(target, stepIncrement);
      this.refresh();
    });
    this.controls.on('adjustPitch', (delta) => {
      this.currentPitch = this._shiftPitch(this.currentPitch, delta);
      if (this.measure) {
        const notes = this.measure.notesAtStep(this.cursorStep);
        notes.forEach((note) => {
          note.pitch = this._shiftPitch(note.pitch, delta);
        });
        if (notes.length > 0) {
          this.measure.recordHistory({
            parameter: 'note',
            value: `adjust pitch @${this.cursorStep}`
          });
          this.measure.touch();
          this.audioEngine.loopBuffer = this.audioEngine.renderLoopBuffer();
          this.emit('noteChange', { type: 'update', step: this.cursorStep });
        }
      }
      this.showMessage(`Cursor pitch → ${noteNameFromMidi(this.currentPitch)}`);
      this.refresh();
    });
    this.controls.on('addNote', () => {
      if (!this.measure) {
        return;
      }
      const existing = this.measure.notesAtStep(this.cursorStep);
      const pitch = this._nearestScaleMidi(this.currentPitch);
      const payload = {
        step: this.cursorStep,
        duration: this.currentDuration,
        pitch,
        velocity: 0.8
      };
      if (existing.length === 0) {
        this.measure.addNote(payload);
        this.measure.recordHistory({
          parameter: 'note',
          value: `add ${noteNameFromMidi(pitch)} @${this.cursorStep}`
        });
        this.audioEngine.loopBuffer = this.audioEngine.renderLoopBuffer();
        this.showMessage(`Added ${noteNameFromMidi(pitch)} at step ${this.cursorStep}.`);
        this.emit('noteChange', { type: 'add', step: this.cursorStep, pitch });
      } else {
        Object.assign(existing[0], payload);
        this.measure.touch();
        this.measure.recordHistory({
          parameter: 'note',
          value: `replace @${this.cursorStep} → ${noteNameFromMidi(pitch)}`
        });
        this.audioEngine.loopBuffer = this.audioEngine.renderLoopBuffer();
        this.showMessage(`Replaced note at step ${this.cursorStep} → ${noteNameFromMidi(pitch)}.`);
        this.emit('noteChange', { type: 'replace', step: this.cursorStep, pitch });
      }
      this.refresh();
    });
    this.controls.on('deleteNote', () => {
      if (!this.measure) {
        return;
      }
      const [note] = this.measure.notesAtStep(this.cursorStep);
      if (note) {
        this.measure.removeNote(note.id);
        this.measure.recordHistory({
          parameter: 'note',
          value: `delete @${this.cursorStep}`
        });
        this.audioEngine.loopBuffer = this.audioEngine.renderLoopBuffer();
        this.showMessage(`Removed note from step ${this.cursorStep}.`);
        this.emit('noteChange', { type: 'delete', step: this.cursorStep });
      }
      this.refresh();
    });
    this.controls.on('tempoChange', (delta) => {
      if (!this.measure) {
        return;
      }
      this.measure.tempo = clamp(this.measure.tempo + delta, 40, 260);
      this.audioEngine.setTempo(this.measure.tempo);
      this.measure.touch();
      this._recordParameterChange('tempo', this.measure.tempo);
      this.showMessage(`Tempo → ${this.measure.tempo} BPM.`);
      this._restartPlayheadTimer();
      this.refresh();
    });
    this.controls.on('toggleSwing', () => {
      if (!this.measure) {
        return;
      }
      const newSwing = this.measure.swing === 0 ? 0.2 : 0;
      this.measure.swing = newSwing;
      this.audioEngine.setSwing(newSwing);
      this.measure.touch();
      this._recordParameterChange('swing', newSwing);
      this.showMessage(`Swing ${newSwing === 0 ? 'off' : 'on'}.`);
      this._restartPlayheadTimer();
      this.refresh();
    });
    this.controls.on('cycleKey', (direction) => {
      if (!this.measure) {
        return;
      }
      const previousKey = this.measure.key;
      const nextKey = nextInArray(getAvailableKeys(), this.measure.key, direction);
      this.measure.key = nextKey;
      const changed = this._transposeNotesBetweenKeys(previousKey, nextKey);
      this.measure.touch();
      this._recordParameterChange('key', this.measure.key);
      if (changed) {
        this.audioEngine.loopBuffer = this.audioEngine.renderLoopBuffer();
      }
      this.showMessage(`Key → ${this.measure.key}`);
      this.refresh();
    });
    this.controls.on('cycleScale', (direction) => {
      if (!this.measure) {
        return;
      }
      this.measure.scale = nextInArray(getAvailableScales(), this.measure.scale, direction);
      const changed = this._remapNotesToScale({ force: true });
      this.measure.touch();
      this._recordParameterChange('scale', this.measure.scale);
      if (changed) {
        this.audioEngine.loopBuffer = this.audioEngine.renderLoopBuffer();
      }
      this.showMessage(`Scale → ${this.measure.scale}`);
      this.refresh();
    });
    this.controls.on('adjustWarmth', (delta) => {
      if (!this.measure) {
        return;
      }
      this.measure.warmth = clamp(this.measure.warmth + delta, 0, 1);
      this.audioEngine.setWarmth(this.measure.warmth);
      this.measure.touch();
      this._recordParameterChange('warmth', this.measure.warmth);
      this.showMessage(`Warmth ${(this.measure.warmth * 100).toFixed(0)}%`);
      this.refresh();
    });
    this.controls.on('changeLoop', (steps) => {
      if (!this.measure) {
        return;
      }
      this.measure.loopLength = steps;
      this.cursorStep = clamp(this.cursorStep, 0, steps - 1);
      this.measure.touch();
      this._recordParameterChange('loopLength', steps);
      this.audioEngine.loopBuffer = this.audioEngine.renderLoopBuffer();
      this.showMessage(`Loop length → ${steps} steps.`);
      this._restartPlayheadTimer();
      this.refresh();
    });
    this.controls.on('changeDuration', (duration) => {
      this.currentDuration = duration;
      this.cursorStep = this._snapToStepGrid(this.cursorStep, this._cursorStepIncrement());
      this.showMessage(`Duration set to ${duration}`);
      this.refresh();
    });
    this.controls.on('changeTimeSignature', (signature) => {
      if (!this.measure) {
        return;
      }
      this.measure.timeSignature = signature;
      this.measure.touch();
      this._recordParameterChange('timeSignature', `${signature.beats}/${signature.division}`);
      this.showMessage(`Time signature → ${signature.beats}/${signature.division}`);
      this._restartPlayheadTimer();
      this.refresh();
    });
    this.controls.on('toggleHelp', () => {
      this.helpVisible = !this.helpVisible;
      this.helpOverlay.hidden = !this.helpVisible;
      this.screen.render();
    });
    this.controls.on('saveMeasure', () => this.emit('saveMeasure'));
    this.controls.on('loadMeasure', () => this.emit('loadMeasure'));
    this.controls.on('newMeasure', () => this.emit('newMeasure'));
    this.controls.on('selectNoteLetter', (letter) => {
      const newPitch = this._pitchForLetter(letter);
      this.currentPitch = newPitch;
      if (this.measure) {
        const notes = this.measure.notesAtStep(this.cursorStep);
        if (notes.length > 0) {
          notes.forEach((note) => {
            note.pitch = newPitch;
          });
          this.measure.touch();
          this.measure.recordHistory({
            parameter: 'note',
            value: `select ${noteNameFromMidi(newPitch)} @${this.cursorStep}`
          });
          this.audioEngine.loopBuffer = this.audioEngine.renderLoopBuffer();
          this.emit('noteChange', { type: 'update', step: this.cursorStep });
        }
      }
      this.showMessage(`Selected pitch ${noteNameFromMidi(this.currentPitch)} from scale.`);
      this.refresh();
    });
  }

  refresh() {
    this.pianoRoll.render(this.measure, {
      cursorStep: this.cursorStep,
      playheadStep: this.playheadStep,
      playheadOffset: this.playheadOffset,
      isPlaying: this.isPlaying,
      gradientPhase: this.gradientPhase
    });
    const pitchLabel = noteNameFromMidi(this.currentPitch);
    this.parameters.update(this.measure, {
      currentDuration: this.currentDuration,
      currentPitch: pitchLabel
    });
    this.screen.render();
  }

  setMeasure(measure) {
    this.measure = measure;
    this.cursorStep = 0;
    this.currentPitch = this._nearestScaleMidi(this.currentPitch);
    this.playheadStep = 0;
    this.playheadOffset = 0;
    this.gradientPhase = 0;
    this._restartPlayheadTimer();
    this.refresh();
  }

  promptList({ title, items }) {
    return new Promise((resolve) => {
      const list = blessed.list({
        parent: this.screen,
        label: ` ${title} `,
        keys: true,
        mouse: true,
        top: 'center',
        left: 'center',
        width: '60%',
        height: '50%',
        border: { type: 'line' },
        style: {
          fg: this.palette.text,
          selected: { bg: this.palette.accent, fg: this.palette.background },
          border: { fg: this.palette.accent },
          bg: this.palette.background
        },
        items
      });
      const cleanup = (result) => {
        list.destroy();
        this.screen.render();
        resolve(result);
      };
      list.focus();
      list.key(['escape'], () => cleanup(null));
      list.on('cancel', () => cleanup(null));
      list.on('select', (item, index) => cleanup({ item, index }));
      this.screen.render();
    });
  }

  promptText({ title, initial = '' }) {
    return new Promise((resolve) => {
      const input = blessed.textbox({
        parent: this.screen,
        label: ` ${title} `,
        keys: true,
        mouse: true,
        top: 'center',
        left: 'center',
        width: '60%',
        height: 5,
        border: { type: 'line' },
        style: {
          fg: this.palette.text,
          border: { fg: this.palette.accent },
          bg: this.palette.background
        },
        inputOnFocus: true,
        value: initial
      });

      const cleanup = (result) => {
        input.destroy();
        this.screen.render();
        resolve(result);
      };

      input.focus();
      this.screen.render();
      input.readInput((err, value) => {
        if (err) {
          cleanup(null);
        } else {
          cleanup((value || '').trim());
        }
      });

      input.key(['escape'], () => cleanup(null));
    });
  }

  _recordParameterChange(parameter, value) {
    if (!this.measure) {
      return;
    }
    this.measure.recordHistory({ parameter, value });
    this.emit('parameterChange', {
      parameter,
      value,
      timestamp: new Date().toISOString()
    });
  }

  _cursorStepIncrement() {
    const beats = durationToBeats(this.currentDuration);
    const steps = Math.max(1, Math.round(beats / this.stepResolutionBeats));
    return steps;
  }

  _maximumCursorStep() {
    if (!this.measure) {
      return 0;
    }
    const increment = this._cursorStepIncrement();
    return Math.max(0, this.measure.loopLength - increment);
  }

  _snapToStepGrid(value, increment) {
    if (!this.measure) {
      return 0;
    }
    const maxStep = this._maximumCursorStep();
    const snapped = Math.round(value / increment) * increment;
    return clamp(snapped, 0, maxStep);
  }

  _stepDurationForStep(step) {
    const base = this.stepResolutionBeats;
    if (!this.measure) {
      return base;
    }
    const swing = this.measure.swing || 0;
    if (swing === 0) {
      return base;
    }
    const offset = base * swing * 0.5;
    return step % 2 === 0 ? Math.max(0.01, base - offset) : base + offset;
  }

  _loopTotalBeats() {
    if (!this.measure) {
      return 0;
    }
    let total = 0;
    for (let i = 0; i < this.measure.loopLength; i += 1) {
      total += this._stepDurationForStep(i);
    }
    return total;
  }

  _stopPlayheadTimer() {
    if (this.playheadInterval) {
      clearInterval(this.playheadInterval);
      this.playheadInterval = null;
    }
    this.playStartTime = null;
  }

  _startPlayheadTimer() {
    this._stopPlayheadTimer();
    this.playheadStep = 0;
    this.playheadOffset = 0;
    this.gradientPhase = 0;
    this.playStartTime = process.hrtime.bigint();
    this.playheadInterval = setInterval(() => this._updatePlayhead(), 30);
    this._updatePlayhead();
  }

  _updatePlayhead() {
    if (!this.isPlaying || !this.measure || !this.playStartTime) {
      return;
    }
    const now = process.hrtime.bigint();
    const elapsedSeconds = Number(now - this.playStartTime) / 1e9;
    const elapsedBeats = secondsToBeats(elapsedSeconds, this.measure.tempo);
    const loopBeats = this._loopTotalBeats() || this.measure.loopLength * this.stepResolutionBeats;
    const positionBeats = loopBeats === 0 ? 0 : ((elapsedBeats % loopBeats) + loopBeats) % loopBeats;

    let accumulated = 0;
    let step = 0;
    while (step < this.measure.loopLength) {
      const duration = this._stepDurationForStep(step);
      if (positionBeats < accumulated + duration) {
        break;
      }
      accumulated += duration;
      step += 1;
    }
    if (step >= this.measure.loopLength) {
      step = 0;
      accumulated = 0;
    }
    const stepDuration = this._stepDurationForStep(step);
    const remainder = Math.max(0, positionBeats - accumulated);
    this.playheadStep = step;
    this.playheadOffset = stepDuration > 0 ? remainder / stepDuration : 0;
    this.gradientPhase = loopBeats > 0 ? positionBeats / loopBeats : 0;
    this.refresh();
  }

  _restartPlayheadTimer() {
    if (this.isPlaying) {
      this._startPlayheadTimer();
    } else {
      this.gradientPhase = 0;
      this.playheadOffset = 0;
    }
  }

  _scalePitchClasses() {
    if (!this.measure) {
      return [];
    }
    const rootClass = noteToMidi(this.measure.key, 0) % 12;
    const intervals = getScaleDefinition(this.measure.scale).intervals;
    return intervals.map((interval) => (rootClass + interval) % 12);
  }

  _scaleMidiSequence(min = 24, max = 96) {
    const classes = this._scalePitchClasses();
    if (classes.length === 0) {
      return [];
    }
    const sequence = [];
    for (let midi = min; midi <= max; midi += 1) {
      if (classes.includes(midi % 12)) {
        sequence.push(midi);
      }
    }
    return sequence;
  }

  _nearestPitchFromSequence(sequence, target) {
    if (sequence.length === 0) {
      return clamp(target, 24, 96);
    }
    let nearest = sequence[0];
    let bestDiff = Math.abs(sequence[0] - target);
    sequence.forEach((value) => {
      const diff = Math.abs(value - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        nearest = value;
      }
    });
    return nearest;
  }

  _nearestScaleMidi(target) {
    const sequence = this._scaleMidiSequence();
    return this._nearestPitchFromSequence(sequence, target);
  }

  _shiftPitch(pitch, delta) {
    const sequence = this._scaleMidiSequence();
    if (sequence.length === 0) {
      return clamp(pitch + delta, 24, 96);
    }
    const normalized = this._nearestPitchFromSequence(sequence, pitch);
    let index = sequence.indexOf(normalized);
    if (index === -1) {
      index = 0;
    }
    index = clamp(index + delta, 0, sequence.length - 1);
    return sequence[index];
  }

  _pitchForLetter(letter) {
    const sequence = this._scaleMidiSequence();
    if (sequence.length === 0) {
      return clamp(this.currentPitch, 24, 96);
    }
    const upper = (letter || '').toUpperCase();
    const matches = sequence.filter((midi) => noteNameFromMidi(midi).startsWith(upper));
    if (matches.length === 0) {
      return this._nearestScaleMidi(this.currentPitch);
    }
    const nearest = this._nearestPitchFromSequence(matches, this.currentPitch);
    return nearest;
  }

  _transposeNotesBetweenKeys(oldKey, newKey) {
    if (!this.measure) {
      return;
    }
    const oldClass = noteToMidi(oldKey, 0) % 12;
    const newClass = noteToMidi(newKey, 0) % 12;
    let delta = newClass - oldClass;
    if (delta > 6) {
      delta -= 12;
    }
    if (delta < -6) {
      delta += 12;
    }
    let changed = false;
    this.measure.notes.forEach((note) => {
      const updated = clamp(note.pitch + delta, 24, 96);
      if (updated !== note.pitch) {
        note.pitch = updated;
        changed = true;
      }
    });
    const remapped = this._remapNotesToScale({ force: changed });
    return changed || remapped;
  }

  _remapNotesToScale({ force = false } = {}) {
    if (!this.measure) {
      return false;
    }
    const sequence = this._scaleMidiSequence();
    if (sequence.length === 0) {
      return false;
    }
    let changed = false;
    this.measure.notes.forEach((note) => {
      const mapped = this._nearestPitchFromSequence(sequence, note.pitch);
      if (mapped !== note.pitch) {
        note.pitch = mapped;
        changed = true;
      }
    });
    const normalized = this._nearestPitchFromSequence(sequence, this.currentPitch);
    if (normalized !== this.currentPitch) {
      this.currentPitch = normalized;
    }
    return changed || force;
  }

  _statusContent(message) {
    return `${this._buildHelpText()}\n\n${colorize(message, 'accent')}`;
  }

  showMessage(message) {
    const timestamp = new Date().toLocaleTimeString();
    this.status.setContent(this._statusContent(`[${timestamp}] ${message}`));
  }

  setPlaying(isPlaying) {
    this.isPlaying = isPlaying;
    if (isPlaying) {
      this._startPlayheadTimer();
    } else {
      this._stopPlayheadTimer();
      this.playheadStep = 0;
      this.playheadOffset = 0;
      this.gradientPhase = 0;
      this.refresh();
    }
  }
}
