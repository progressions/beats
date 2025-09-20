import blessed from 'blessed';
import { colors, colorize } from './colors.js';
import { formatTempo } from '../utils/timing.js';

const DURATION_DISPLAY = {
  '1/16': '♬ 16th',
  '1/8': '♫ 8th',
  '1/4': '♩ Quarter',
  '1/2': '♪ Half',
  '1/1': '𝅝 Whole'
};

function capitalize(value = '') {
  if (!value) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export class ParameterPanel {
  constructor({ screen, top = '50%', height = '25%' }) {
    this.screen = screen;
    this.palette = colors();
    this.recentChanges = new Map();
    this.box = blessed.box({
      parent: screen,
      top,
      left: 0,
      width: '100%',
      height,
      label: ' Parameters ',
      tags: true,
      border: { type: 'line' },
      style: {
        fg: this.palette.parameter,
        border: { fg: this.palette.accent },
        bg: this.palette.background
      }
    });
  }

  markChanged(parameter) {
    if (!parameter) {
      return;
    }
    this.recentChanges.set(parameter, Date.now());
  }

  _pruneExpiredChanges(windowMs = 3000) {
    const cutoff = Date.now() - windowMs;
    for (const [name, timestamp] of this.recentChanges.entries()) {
      if (timestamp < cutoff) {
        this.recentChanges.delete(name);
      }
    }
  }

  _formatField(
    parameter,
    label,
    value,
    { positive = false, boolean = false, displayValue } = {}
  ) {
    const changed = this.recentChanges.has(parameter);
    let colorKey = 'accent';
    if (boolean) {
      colorKey = value ? 'success' : 'warning';
    } else if (positive) {
      colorKey = 'success';
    }
    if (changed) {
      colorKey = 'warning';
    }
    const rendered = displayValue !== undefined ? displayValue : value;
    return `${label}: ${colorize(String(rendered), colorKey)}`;
  }

  update(
    measure,
    {
      currentDuration = '1/4',
      currentPitch,
      currentChannel = 0,
      cursorStep = 0,
      stepResolutionBeats = 0.25,
      isPlaying = false,
      isCurrentChannelMuted = false,
      copyMeta = {}
    } = {}
  ) {
    if (!measure) {
      this.box.setContent('Parameters unavailable. Load a measure.');
      return;
    }
    this._pruneExpiredChanges();

    const loopBeats = measure.loopLength * stepResolutionBeats;
    const beatLabel = Number.isInteger(loopBeats) ? `${loopBeats}` : loopBeats.toFixed(2);
    const loopLabel = `${beatLabel} beats (${measure.loopLength} steps)`;
    const swingLabel = measure.swing > 0 ? 'ON' : 'OFF';
    const scaleName = capitalize(measure.scale);
    const positionBeats = cursorStep * stepResolutionBeats;
    const channelInfo = measure.channelInfo(currentChannel);
    const durationLabel = DURATION_DISPLAY[currentDuration] || currentDuration;

    const rowOne = [
      this._formatField('key', 'Key', `${measure.key.toUpperCase()}`),
      this._formatField('scale', 'Scale', scaleName),
      this._formatField('tempo', 'Tempo', formatTempo(measure.tempo)),
      this._formatField(
        'timeSignature',
        'Time',
        `${measure.timeSignature.beats}/${measure.timeSignature.division}`
      ),
      this._formatField('swing', 'Swing', measure.swing > 0, {
        boolean: true,
        displayValue: swingLabel
      }),
      this._formatField('loopLength', 'Loop', loopLabel)
    ].join(' │ ');

    const channelLabel = channelInfo.name
      ? `Ch${currentChannel + 1} ${channelInfo.name}`
      : `Ch${currentChannel + 1}`;
    const rowTwo = [
      this._formatField('warmth', 'Warmth', `${(measure.warmth * 100).toFixed(0)}%`),
      this._formatField('duration', 'Duration', durationLabel),
      this._formatField(
        'channel',
        'Channel',
        channelLabel
      ),
      this._formatField('mute', 'Mute', isCurrentChannelMuted, {
        boolean: true,
        displayValue: isCurrentChannelMuted ? 'Muted' : 'Live'
      }),
      this._formatField('position', 'Position', positionBeats.toFixed(1)),
      this._formatField('playing', 'Playing', isPlaying, {
        boolean: true,
        displayValue: isPlaying ? 'Yes' : 'No'
      })
    ].join(' │ ');

    const copyStatus = copyMeta.status || 'Idle';
    const copyActive = Boolean(copyMeta.active);
    const copyReady = Boolean(copyMeta.hasClipboard);
    const rowThree = this._formatField('copy', 'Copy', copyActive || copyReady, {
      positive: copyActive || copyReady,
      displayValue: copyStatus
    });

    const lines = [rowOne, rowTwo, rowThree];
    if (currentPitch) {
      lines.push(`Next Note: ${colorize(currentPitch, 'accent')}`);
    }

    this.box.setContent(lines.join('\n'));
  }
}
