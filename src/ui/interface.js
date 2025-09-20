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
    this.currentChannel = 0;
    this.currentPitch = this._nearestScaleMidi(this.currentPitch);
    this.playheadStartBeats = 0;
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
      content: ''
    });
    this.helpVisible = false;
    this.helpPages = this._buildHelpPages();
    this.helpPageIndex = 0;
    this._renderHelpOverlay();
    this.historyOverlay = blessed.box({
      parent: this.screen,
      width: '60%',
      height: '50%',
      top: 'center',
      left: 'center',
      hidden: true,
      tags: true,
      border: { type: 'line' },
      label: ' History ',
      style: {
        fg: this.palette.parameter,
        border: { fg: this.palette.accent },
        bg: this.palette.background
      },
      content: 'No history recorded yet.'
    });
    this.historyVisible = false;
    this.historyEntries = [];
    this.controls = new ControlHandler(this.screen);
    this._registerControlEvents();
    this.refresh();
  }

  _buildHelpText() {
    return [
      '{bold}Space{/bold} Play/Pause  {bold}P{/bold} Add note  {bold}Del{/bold} Remove  {bold}← →{/bold} Move cursor',
      '{bold}↑ ↓{/bold} Channel  {bold}+/-{/bold} Pitch ±  {bold}T{/bold} Tempo ±5  {bold}W{/bold} Swing  {bold}L{/bold} Loop  {bold}D{/bold} Duration',
      '{bold}K{/bold} Key  {bold}S{/bold} Scale  {bold}R{/bold} Warmth ±  {bold}3/4{/bold} Time Sig  {bold}Ctrl+S/F5{/bold} Save  {bold}Ctrl+O/Ctrl+L/F6{/bold} Load  {bold}Ctrl+N{/bold} New  {bold}Ctrl+H{/bold} History  {bold}[ ]{/bold} Help Pages  {bold}H{/bold} Help'
    ].join('\n');
  }

  _buildHelpPages() {
    return [
      {
        title: 'Quick Start',
        lines: [
          '{bold}Interactive Measure Editor{/bold}',
          '',
          '• Space toggles playback, P adds notes, Del removes notes.',
          '• Arrow keys move the cursor; ↑ / ↓ swap channels; use +/- for pitch nudges.',
          '• Duration (D) and Loop (L) cycle rhythmic context for cursor movement.'
        ]
      },
      {
        title: 'Parameters',
        lines: [
          'Tempo  T/Shift+T  •  Swing  W  •  Warmth  R/Shift+R',
          'Key    K/Shift+K  •  Scale  S/Shift+S',
          'Time signatures (3 or 4), loop lengths (L) update audio + visuals instantly.',
          'F5 or Ctrl+S saves; F6, Ctrl+O, or Ctrl+L load; Ctrl+N creates a fresh measure.'
        ]
      },
      {
        title: 'Editing Tips',
        lines: [
          '• Notes snap to the current duration grid and active scale.',
          '• Use A–G to target specific scale degrees at the cursor.',
          '• Warmth + swing apply to newly added notes in real time.',
          '• Pitch adjustments respect range (C1–C7) and scale membership.'
        ]
      },
      {
        title: 'Navigation & Help',
        lines: [
          '• [ and ] cycle these help pages while visible.',
          '• Ctrl+H opens the history log (saves, loads, parameter tweaks).',
          '• Q exits safely; status pane logs parameter + validation feedback.',
          '• Auto-saves capture every parameter change for later recovery.'
        ]
      }
    ];
  }

  _renderHelpOverlay() {
    if (!this.helpOverlay) {
      return;
    }
    const pages = this.helpPages || [];
    if (pages.length === 0) {
      this.helpOverlay.setContent('Help unavailable.');
      return;
    }
    const index = ((this.helpPageIndex % pages.length) + pages.length) % pages.length;
    this.helpPageIndex = index;
    const page = pages[index];
    const header = `{bold}${page.title}{/bold} (${index + 1}/${pages.length})`;
    const nav = '{dim}[ / ] navigate · H closes{/dim}';
    const body = page.lines.join('\n');
    this.helpOverlay.setContent(`${header}\n\n${body}\n\n${nav}`);
  }

  _cycleHelp(direction) {
    if (!this.helpVisible) {
      return;
    }
    const pages = this.helpPages || [];
    if (pages.length === 0) {
      return;
    }
    this.helpPageIndex = (this.helpPageIndex + direction + pages.length) % pages.length;
    this._renderHelpOverlay();
  }

  updateHistory(entries = []) {
    this.historyEntries = Array.isArray(entries) ? entries.slice(-200) : [];
    if (this.historyVisible) {
      this._renderHistoryOverlay();
      this.screen.render();
    }
  }

  _renderHistoryOverlay() {
    if (!this.historyOverlay) {
      return;
    }
    const entries = this.historyEntries || [];
    if (entries.length === 0) {
      this.historyOverlay.setContent('No history recorded yet.\n\n{dim}Ctrl+H closes{/dim}');
      return;
    }
    const latest = entries.slice(-15).reverse();
    const body = latest.map((entry) => this._formatHistoryEntry(entry)).join('\n');
    this.historyOverlay.setContent(`${body}\n\n{dim}Ctrl+H closes{/dim}`);
  }

  _formatHistoryEntry(entry) {
    if (!entry) {
      return '';
    }
    const timestamp = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '—';
    const label = entry.parameter || 'event';
    const rawValue = entry.value;
    let value;
    if (typeof rawValue === 'object' && rawValue !== null) {
      value = JSON.stringify(rawValue);
    } else if (rawValue === undefined) {
      value = '';
    } else {
      value = String(rawValue);
    }
    return `{bold}${timestamp}{/bold} ${label}${value ? ` → ${value}` : ''}`;
  }

  _registerControlEvents() {
    this.controls.on('exit', () => {
      this.emit('exit');
    });
    this.controls.on('togglePlayback', () => {
      this.emit('togglePlayback', {
        cursorStep: this.cursorStep,
        playheadStep: this.playheadStep,
        stepResolutionBeats: this.stepResolutionBeats
      });
    });
    this.controls.on('moveCursor', (delta) => {
      const stepIncrement = this._cursorStepIncrement();
      const maxStep = this._maximumCursorStep();
      let target = this.cursorStep + delta * stepIncrement;
      target = clamp(target, 0, maxStep);
      this.cursorStep = this._snapToStepGrid(target, stepIncrement);
      this.parameters.markChanged('position');
      this.refresh();
    });
    this.controls.on('adjustPitch', (delta) => {
      if (delta === 0) {
        return;
      }
      const nextPitch = this._shiftPitch(this.currentPitch, delta);
      let noteChanged = false;
      if (this.measure) {
        const notes = this.measure.notesAtStep(this.cursorStep, this.currentChannel);
        notes.forEach((note) => {
          const updated = this._shiftPitch(note.pitch, delta);
          if (updated !== note.pitch) {
            note.pitch = updated;
            noteChanged = true;
          }
        });
        if (noteChanged) {
          this.measure.recordHistory({
            parameter: 'note',
            value: `adjust pitch @${this.cursorStep}`
          });
          this.measure.touch();
          this.audioEngine.loopBuffer = this.audioEngine.renderLoopBuffer();
          this.emit('noteChange', { type: 'update', step: this.cursorStep });
        }
      }
      if (nextPitch === this.currentPitch && !noteChanged) {
        this.showMessage('Pitch limit reached for current scale.');
        return;
      }
      this.currentPitch = nextPitch;
      this.showMessage(`Cursor pitch → ${noteNameFromMidi(this.currentPitch)}`);
      this.refresh();
    });
    this.controls.on('addNote', () => {
      if (!this.measure) {
        return;
      }
      const existing = this.measure.notesAtStep(this.cursorStep, this.currentChannel);
      const pitch = this._nearestScaleMidi(this.currentPitch);
      const payload = {
        step: this.cursorStep,
        duration: this.currentDuration,
        pitch,
        velocity: 0.8,
        channel: this.currentChannel
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
      const [note] = this.measure.notesAtStep(this.cursorStep, this.currentChannel);
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
      const proposed = this.measure.tempo + delta;
      const clamped = clamp(proposed, 40, 260);
      if (clamped === this.measure.tempo && proposed !== this.measure.tempo) {
        this.showMessage('Tempo limit reached (40-260 BPM).');
        return;
      }
      this.measure.tempo = clamped;
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
      this.measure.key = nextInArray(getAvailableKeys(), this.measure.key, direction);
      const normalized = this._nearestScaleMidi(this.currentPitch);
      if (normalized !== this.currentPitch) {
        this.currentPitch = normalized;
      }
      this.measure.touch();
      this._recordParameterChange('key', this.measure.key);
      this.audioEngine.loopBuffer = this.audioEngine.renderLoopBuffer();
      this.showMessage(`Key → ${this.measure.key}`);
      this.refresh();
    });
    this.controls.on('cycleScale', (direction) => {
      if (!this.measure) {
        return;
      }
      this.measure.scale = nextInArray(getAvailableScales(), this.measure.scale, direction);
      const normalized = this._nearestScaleMidi(this.currentPitch);
      if (normalized !== this.currentPitch) {
        this.currentPitch = normalized;
      }
      this.measure.touch();
      this._recordParameterChange('scale', this.measure.scale);
      this.audioEngine.loopBuffer = this.audioEngine.renderLoopBuffer();
      this.showMessage(`Scale → ${this.measure.scale}`);
      this.refresh();
    });
    this.controls.on('adjustWarmth', (delta) => {
      if (!this.measure) {
        return;
      }
      const proposed = this.measure.warmth + delta;
      const clamped = clamp(proposed, 0, 1);
      if (clamped === this.measure.warmth && proposed !== this.measure.warmth) {
        this.showMessage('Warmth already at limit (0-100%).');
        return;
      }
      this.measure.warmth = clamped;
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
      const beats = (steps * this.stepResolutionBeats).toFixed(0);
      this.showMessage(`Loop length → ${beats} beats (${steps} steps).`);
      this._restartPlayheadTimer();
      this.refresh();
    });
    this.controls.on('changeDuration', (duration) => {
      this.currentDuration = duration;
      this.cursorStep = this._snapToStepGrid(this.cursorStep, this._cursorStepIncrement());
      this.showMessage(`Duration set to ${duration}`);
      this._recordParameterChange('duration', duration);
      this.parameters.markChanged('position');
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
      if (this.helpVisible) {
        if (this.historyVisible) {
          this.historyVisible = false;
          this.historyOverlay.hidden = true;
        }
        this.helpPageIndex = 0;
        this._renderHelpOverlay();
        this.showMessage('Help opened — use [ and ] to browse pages.');
      } else {
        this.showMessage('Help closed.');
      }
      this.screen.render();
    });
    this.controls.on('helpNext', () => this._cycleHelp(1));
    this.controls.on('helpPrev', () => this._cycleHelp(-1));
    this.controls.on('toggleHistory', () => {
      this.historyVisible = !this.historyVisible;
      this.historyOverlay.hidden = !this.historyVisible;
      if (this.historyVisible) {
        if (this.helpVisible) {
          this.helpVisible = false;
          this.helpOverlay.hidden = true;
        }
        this._renderHistoryOverlay();
        this.showMessage('History opened — latest events listed.');
      } else {
        this.showMessage('History closed.');
      }
      this.screen.render();
    });
    this.controls.on('saveMeasure', () => this.emit('saveMeasure'));
    this.controls.on('loadMeasure', () => this.emit('loadMeasure'));
    this.controls.on('newMeasure', () => this.emit('newMeasure'));
    this.controls.on('selectNoteLetter', (letter) => {
      const newPitch = this._pitchForLetter(letter);
      this.currentPitch = newPitch;
      if (this.measure) {
        const notes = this.measure.notesAtStep(this.cursorStep, this.currentChannel);
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
    this.controls.on('changeChannel', (direction) => {
      if (!this.measure) {
        return;
      }
      const maxIndex = Math.max(0, this.measure.channelCount() - 1);
      const next = clamp(this.currentChannel + direction, 0, maxIndex);
      if (next === this.currentChannel) {
        this.showMessage('No more channels in that direction.');
        return;
      }
      this.currentChannel = next;
      const channelInfo = this.measure.channelInfo(this.currentChannel);
      this._recordParameterChange('channel', channelInfo.name || `Ch${this.currentChannel + 1}`);
      this.showMessage(`Channel → ${channelInfo.name || `Ch${this.currentChannel + 1}`}`);
      this.refresh();
    });
    this.controls.on('toggleMute', () => {
      if (!this.measure) {
        return;
      }
      const channelIndex = this.currentChannel;
      const muted = this.audioEngine.toggleMute(channelIndex);
      const channelInfo = this.measure.channelInfo(channelIndex);
      const label = channelInfo.name || `Ch${channelIndex + 1}`;
      this.parameters.markChanged('mute');
      this.showMessage(`${muted ? 'Muted' : 'Unmuted'} ${label} for playback.`);
      this.refresh();
    });
  }

  refresh() {
    this.pianoRoll.render(this.measure, {
      cursorStep: this.cursorStep,
      playheadStep: this.playheadStep,
      playheadOffset: this.playheadOffset,
      isPlaying: this.isPlaying,
      gradientPhase: this.gradientPhase,
      currentChannel: this.currentChannel
    });
    const pitchLabel = noteNameFromMidi(this.currentPitch);
    this.parameters.update(this.measure, {
      currentDuration: this.currentDuration,
      currentPitch: pitchLabel,
      currentChannel: this.currentChannel,
      cursorStep: this.cursorStep,
      stepResolutionBeats: this.stepResolutionBeats,
      isPlaying: this.isPlaying,
      isCurrentChannelMuted: this.audioEngine ? this.audioEngine.isMuted(this.currentChannel) : false
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
    const maxChannelIndex = Math.max(0, this.measure.channelCount() - 1);
    this.currentChannel = clamp(this.currentChannel, 0, maxChannelIndex);
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
      const handleSubmit = (value) => cleanup((value || '').trim());
      const handleCancel = () => cleanup(null);

      input.once('submit', handleSubmit);
      input.once('cancel', handleCancel);
      input.key(['escape'], () => input.emit('cancel'));
      input.key(['enter'], () => input.emit('submit', input.getValue()));
    });
  }

  _recordParameterChange(parameter, value) {
    if (!this.measure) {
      return;
    }
    this.measure.recordHistory({ parameter, value });
    this.parameters.markChanged(parameter);
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

  _currentPlayheadBeats() {
    if (!this.measure) {
      return 0;
    }
    const loopLength = this.measure.loopLength;
    const step = clamp(this.playheadStep, 0, Math.max(0, loopLength - 1));
    let total = 0;
    for (let i = 0; i < step; i += 1) {
      total += this._stepDurationForStep(i);
    }
    if (loopLength > 0) {
      const duration = this._stepDurationForStep(step);
      total += duration * clamp(this.playheadOffset, 0, 1);
    }
    const loopBeats = this._loopTotalBeats() || loopLength * this.stepResolutionBeats;
    if (loopBeats > 0) {
      total = ((total % loopBeats) + loopBeats) % loopBeats;
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

  _startPlayheadTimer(startBeats = 0) {
    this._stopPlayheadTimer();
    const loopBeats = this._loopTotalBeats() || (this.measure ? this.measure.loopLength * this.stepResolutionBeats : 0);
    if (loopBeats > 0) {
      const normalized = ((startBeats % loopBeats) + loopBeats) % loopBeats;
      this.playheadStartBeats = normalized;
    } else {
      this.playheadStartBeats = 0;
    }
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
    const startBeats = loopBeats === 0 ? 0 : ((this.playheadStartBeats % loopBeats) + loopBeats) % loopBeats;
    const totalBeats = startBeats + elapsedBeats;
    const positionBeats = loopBeats === 0 ? 0 : ((totalBeats % loopBeats) + loopBeats) % loopBeats;

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
      const currentBeats = this._currentPlayheadBeats();
      this._startPlayheadTimer(currentBeats);
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

  _statusContent(message) {
    return `${this._buildHelpText()}\n\n${colorize(message, 'accent')}`;
  }

  showMessage(message) {
    const timestamp = new Date().toLocaleTimeString();
    this.status.setContent(this._statusContent(`[${timestamp}] ${message}`));
  }

  setPlaying(isPlaying, { offsetBeats = 0, offsetStep = 0 } = {}) {
    this.isPlaying = isPlaying;
    this.parameters.markChanged('playing');
    if (isPlaying) {
      this.playheadStartBeats = offsetBeats;
      this.playheadStep = offsetStep;
      this._startPlayheadTimer(this.playheadStartBeats);
    } else {
      this._stopPlayheadTimer();
      this.playheadStep = 0;
      this.playheadOffset = 0;
      this.gradientPhase = 0;
      this.playheadStartBeats = 0;
      this.refresh();
    }
  }
}
