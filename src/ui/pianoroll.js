import blessed from 'blessed';
import chalk from 'chalk';
import { createPastelGradient } from './gradient.js';
import { colors, colorize } from './colors.js';
import { noteNameFromMidi } from '../utils/music.js';

const LABEL_WIDTH = 12;

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

  render(
    measure,
    {
      cursorStep = 0,
      playheadStep = 0,
      playheadOffset = 0,
      isPlaying = false,
      gradientPhase = 0,
      currentChannel = 0,
      mutedChannels = new Set()
    } = {}
  ) {
    if (!measure) {
      this.box.setContent('Load or create a measure to begin.');
      return;
    }
    const palette = colors();
    const width = Math.max(10, (this.box.width || this.screen.width) - 4);
    const gradient = createPastelGradient(width, measure.warmth, gradientPhase);
    const stepWidth = Math.max(1, Math.floor(width / measure.loopLength));
    const timeline = new Array(width).fill('─');
    const beatSpan = measure.loopLength;
    for (let beat = 0; beat <= beatSpan; beat += 4) {
      const column = Math.min(width - 1, Math.floor(beat * stepWidth));
      timeline[column] = '┊';
    }

    const channelLines = measure.channels.map(() => new Array(width).fill(' '));

    measure.listNotes().forEach((note) => {
      const startColumn = Math.min(width - 1, Math.floor(note.step * stepWidth));
      const char = '█';
      const durationBeats = note.durationBeats || 0.25;
      const lengthSteps = Math.max(1, Math.round(durationBeats / 0.25));
      const span = Math.max(1, Math.round(lengthSteps * stepWidth));
      const channelIndex = clampChannel(note.channel, channelLines.length);
      for (let offset = 0; offset < span && startColumn + offset < width; offset += 1) {
        const columnIndex = startColumn + offset;
        channelLines[channelIndex][columnIndex] = gradient(columnIndex, char);
      }
    });

    const cursorColumn = Math.min(width - 1, Math.floor(cursorStep * stepWidth));
    const cursorChar = cursorStep % 4 === 0 ? '◆' : '◇';
    if (channelLines[currentChannel]) {
      channelLines[currentChannel][cursorColumn] = gradient(cursorColumn, cursorChar);
    }
    timeline[cursorColumn] = gradient(cursorColumn, cursorChar);

    if (isPlaying) {
      const playPosition = (playheadStep + playheadOffset) * stepWidth;
      const playColumn = Math.min(width - 1, Math.round(playPosition));
      timeline[playColumn] = colorize('│', 'cursor');
      channelLines.forEach((line) => {
        if (line[playColumn] === ' ') {
          line[playColumn] = colorize('│', 'cursor');
        }
      });
    }

    const beatMarkers = buildBeatMarkers(measure.loopLength, stepWidth, width);
    const lines = [];
    lines.push(`${padLabel('Beat')}│ ${beatMarkers}`);
    lines.push(`${padLabel('Timeline')}│ ${timeline.join('')}`);
    measure.channels.forEach((channel, index) => {
      const baseName = channel.name || `Ch${index + 1}`;
      const isMuted = mutedChannels && mutedChannels.has(index);
      const nameWithIndicator = isMuted ? `${baseName} ✕` : baseName;
      const fitted = fitLabel(nameWithIndicator, LABEL_WIDTH);
      let label;
      if (isMuted) {
        const baseColor = index === currentChannel ? palette.accent : palette.text;
        label = chalk.hex(baseColor).dim(fitted);
      } else if (index === currentChannel) {
        label = colorize(fitted, 'accent');
      } else {
        label = fitted;
      }
      lines.push(`${label}│ ${channelLines[index].join('')}`);
    });

    const statusLabel = isPlaying ? colorize('Playing', 'success') : colorize('Stopped', 'warning');
    const noteList = measure.listNotes().filter((note) => {
      const channelIndex = clampChannel(note.channel, measure.channelCount());
      return channelIndex === currentChannel;
    });
    lines.push('');
    lines.push(`Status: ${statusLabel} │ Cursor step: ${cursorStep}`);
    if (noteList.length === 0) {
      lines.push('Cue List: (no notes)');
    } else {
      lines.push(`Cue List: Channel ${currentChannel + 1}`);
      const cues = noteList.map((note) => {
        const name = noteNameFromMidi(note.midi);
        return `• step ${note.step} → ${name} (${note.duration})`;
      });
      const maxVisible = 64;
      const visibleCues = cues.slice(0, maxVisible);
      const columnTarget = 8;
      const columnCount = Math.min(columnTarget, visibleCues.length);
      if (columnCount <= 1) {
        visibleCues.forEach((cue) => {
          lines.push(`  ${cue}`);
        });
      } else {
        const rows = Math.ceil(visibleCues.length / columnCount);
        const columns = Array.from({ length: columnCount }, (_, columnIndex) => {
          const columnEntries = [];
          for (let row = 0; row < rows; row += 1) {
            const index = columnIndex * rows + row;
            if (index < visibleCues.length) {
              columnEntries.push(visibleCues[index]);
            }
          }
          return columnEntries;
        });
        const columnWidths = columns.map((entries) => {
          return entries.reduce((width, text) => Math.max(width, text.length), 0);
        });
        for (let row = 0; row < rows; row += 1) {
          const cells = [];
          for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
            const value = columns[columnIndex][row];
            if (value) {
              cells.push(value.padEnd(columnWidths[columnIndex], ' '));
            }
          }
          if (cells.length > 0) {
            lines.push(`  ${cells.join('  ')}`);
          }
        }
      }
      if (noteList.length > visibleCues.length) {
        lines.push(`  … ${noteList.length - visibleCues.length} more`);
      }
    }

    this.box.setContent(lines.join('\n'));
  }
}

function padLabel(text) {
  return fitLabel(text, LABEL_WIDTH);
}

function fitLabel(text, width) {
  const base = (text || '').trim();
  if (base.length >= width) {
    return `${base.slice(0, Math.max(0, width - 1))}…`;
  }
  return base.padEnd(width, ' ');
}

function clampChannel(channel, count) {
  if (typeof channel !== 'number' || Number.isNaN(channel)) {
    return 0;
  }
  return Math.min(Math.max(channel, 0), Math.max(0, count - 1));
}

function buildBeatMarkers(loopLength, stepWidth, width) {
  const markers = new Array(width).fill(' ');
  const stepToBeat = 0.25;
  for (let step = 0; step < loopLength; step += 1) {
    const beatPosition = step * stepToBeat + 1;
    if (Math.abs((beatPosition * 2) % 1) > 0.01) {
      continue;
    }
    const column = Math.min(width - 1, Math.floor(step * stepWidth));
    const label = beatPosition.toFixed(1);
    placeLabel(markers, column, label);
  }
  return markers.join('');
}

function placeLabel(array, startIndex, text) {
  const chars = text.split('');
  chars.forEach((char, offset) => {
    const index = startIndex + offset;
    if (index < array.length) {
      array[index] = char;
    }
  });
}
