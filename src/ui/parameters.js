import blessed from 'blessed';
import { colors, colorize } from './colors.js';
import { formatTempo, formatSwing } from '../utils/timing.js';

export class ParameterPanel {
  constructor({ screen, top = '50%', height = '25%' }) {
    this.screen = screen;
    const palette = colors();
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
        fg: palette.parameter,
        border: { fg: palette.accent },
        bg: palette.background
      }
    });
  }

  update(measure, { currentDuration = '1/4', currentPitch } = {}) {
    if (!measure) {
      this.box.setContent('Parameters unavailable. Load a measure.');
      return;
    }
    const durationLabel = colorize(currentDuration, 'accent');
    const lines = [
      `Tempo: ${formatTempo(measure.tempo)}`,
      `Time Signature: ${measure.timeSignature.beats}/${measure.timeSignature.division}`,
      `Swing: ${formatSwing(measure.swing)}`,
      `Loop Length: ${measure.loopLength} steps`,
      `Key / Scale: ${measure.key} ${measure.scale}`,
      `Warmth: ${(measure.warmth * 100).toFixed(0)}%`,
      `Duration: ${durationLabel}`
    ];
    if (currentPitch !== undefined) {
      lines.push(`Cursor Pitch: ${currentPitch}`);
    }
    this.box.setContent(lines.join('\n'));
  }
}
