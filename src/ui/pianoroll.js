import blessed from 'blessed';
import { createPastelGradient } from './gradient.js';
import { colors, colorize } from './colors.js';
import { noteNameFromMidi } from '../utils/music.js';

export class PianoRollView {
  constructor({ screen, top = 0, left = 0, height = '50%' }) {
    this.screen = screen;
    const palette = colors();
    this.box = blessed.box({
      parent: screen,
      top,
      left,
      width: '100%',
      height,
      label: ' Piano Roll ',
      tags: true,
      border: { type: 'line' },
      style: {
        fg: palette.text,
        border: { fg: palette.accent },
        bg: palette.background
      }
    });
  }

  render(measure, { cursorStep = 0, playheadStep = 0, isPlaying = false } = {}) {
    if (!measure) {
      this.box.setContent('Load or create a measure to begin.');
      return;
    }
    const width = Math.max(10, (this.box.width || this.screen.width) - 4);
    const gradient = createPastelGradient(width, measure.warmth);
    const stepWidth = Math.max(1, Math.floor(width / measure.loopLength));
    const timeline = new Array(width).fill('─');
    const noteLine = new Array(width).fill(' ');

    for (let beat = 0; beat <= measure.loopLength; beat += 4) {
      const column = Math.min(width - 1, Math.floor(beat * stepWidth));
      timeline[column] = '┊';
    }

    measure.listNotes().forEach((note) => {
      const startColumn = Math.min(width - 1, Math.floor(note.step * stepWidth));
      const char = '█';
      const durationBeats = note.durationBeats || 0.25;
      const lengthSteps = Math.max(1, Math.round(durationBeats / 0.25));
      const span = Math.max(1, Math.round(lengthSteps * stepWidth));
      for (let offset = 0; offset < span && startColumn + offset < width; offset += 1) {
        const columnIndex = startColumn + offset;
        noteLine[columnIndex] = gradient(columnIndex, char);
      }
    });

    const cursorColumn = Math.min(width - 1, Math.floor(cursorStep * stepWidth));
    const cursorChar = cursorStep % 4 === 0 ? '◆' : '◇';
    noteLine[cursorColumn] = gradient(cursorColumn, cursorChar);

    if (isPlaying) {
      const playColumn = Math.min(width - 1, Math.floor(playheadStep * stepWidth));
      noteLine[playColumn] = colorize('│', 'cursor');
      timeline[playColumn] = colorize('│', 'cursor');
    }

    const lines = [];
    const statusLabel = isPlaying ? colorize('Playing', 'success') : colorize('Stopped', 'warning');
    lines.push(`Timeline │ ${timeline.join('')}  ${statusLabel}`);
    lines.push(`Notes    │ ${noteLine.join('')}`);
    lines.push('');
    lines.push('Cue List:');
    const noteList = measure.listNotes();
    if (noteList.length === 0) {
      lines.push('  (no notes)');
    } else {
      noteList.slice(0, 10).forEach((note) => {
        const name = noteNameFromMidi(note.midi);
        lines.push(`  • Step ${note.step} → ${name} (${note.duration})`);
      });
      if (noteList.length > 10) {
        lines.push(`  … ${noteList.length - 10} more`);
      }
    }

    lines.push('');
    lines.push(`Position: step ${playheadStep + 1} / ${measure.loopLength}`);
    lines.push('Durations: 1/16 ░  1/8 ▒  1/4 ▓  1/2 █  1/1 ▉');

    this.box.setContent(lines.join('\n'));
  }
}
