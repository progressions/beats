import { durationOptions } from '../utils/music.js';
import { NOTE_DURATIONS, quantizeToGrid } from '../utils/timing.js';

export class NoteGrid {
  constructor({ totalSteps = 16, resolution = '1/4' } = {}) {
    this.totalSteps = totalSteps;
    this.resolution = resolution;
    this.gridSize = NOTE_DURATIONS[resolution] || 1;
  }

  setResolution(resolution) {
    if (!NOTE_DURATIONS[resolution]) {
      return;
    }
    this.resolution = resolution;
    this.gridSize = NOTE_DURATIONS[resolution];
  }

  quantize(step) {
    return quantizeToGrid(step, this.gridSize);
  }

  validDurations() {
    return durationOptions();
  }
}

export function groupNotesByStep(notes) {
  return notes.reduce((acc, note) => {
    if (!acc.has(note.step)) {
      acc.set(note.step, []);
    }
    acc.get(note.step).push(note);
    return acc;
  }, new Map());
}

export function normalizeNotes(notes, totalSteps) {
  return notes
    .map((note) => ({ ...note }))
    .filter((note) => note.step >= 0 && note.step < totalSteps);
}
