import { v4 as uuid } from 'uuid';
import { NOTE_DURATIONS, totalBeats } from '../utils/timing.js';
import { noteToMidi } from '../utils/music.js';

export class NoteEvent {
  constructor({ id = uuid(), step = 0, duration = '1/4', velocity = 0.8, pitch = 60, octave = 4 }) {
    this.id = id;
    this.step = step;
    this.duration = duration;
    this.velocity = velocity;
    this.pitch = pitch;
    this.octave = octave;
  }

  clone(overrides = {}) {
    return new NoteEvent({
      id: uuid(),
      step: this.step,
      duration: this.duration,
      velocity: this.velocity,
      pitch: this.pitch,
      octave: this.octave,
      ...overrides
    });
  }

  get durationBeats() {
    if (NOTE_DURATIONS[this.duration]) {
      return NOTE_DURATIONS[this.duration];
    }
    return 1;
  }

  get midi() {
    return typeof this.pitch === 'number' ? this.pitch : noteToMidi(this.pitch, this.octave);
  }
}

export class Measure {
  constructor({
    id = uuid(),
    name = 'Untitled Measure',
    notes = [],
    tempo = 120,
    timeSignature = { beats: 4, division: 4 },
    loopLength = 16,
    swing = 0,
    warmth = 0.5,
    key = 'C',
    scale = 'major',
    history = []
  } = {}) {
    this.id = id;
    this.name = name;
    this.notes = notes.map((note) => new NoteEvent(note));
    this.tempo = tempo;
    this.timeSignature = timeSignature;
    this.loopLength = loopLength;
    this.swing = swing;
    this.warmth = warmth;
    this.key = key;
    this.scale = scale;
    this.history = history;
    this.lastModified = new Date().toISOString();
  }

  clone(overrides = {}) {
    return new Measure({
      ...this.serialize(),
      id: uuid(),
      ...overrides
    });
  }

  addNote(note) {
    const noteEvent = note instanceof NoteEvent ? note : new NoteEvent(note);
    this.notes.push(noteEvent);
    this.touch();
    return noteEvent;
  }

  removeNote(noteId) {
    const index = this.notes.findIndex((note) => note.id === noteId);
    if (index >= 0) {
      this.notes.splice(index, 1);
      this.touch();
      return true;
    }
    return false;
  }

  updateNote(noteId, updates) {
    const note = this.notes.find((n) => n.id === noteId);
    if (!note) {
      return null;
    }
    Object.assign(note, updates);
    this.touch();
    return note;
  }

  listNotes() {
    return [...this.notes].sort((a, b) => a.step - b.step);
  }

  notesAtStep(step) {
    return this.notes.filter((note) => note.step === step);
  }

  totalBeats() {
    return totalBeats(this.loopLength, this.timeSignature);
  }

  serialize() {
    return {
      id: this.id,
      name: this.name,
      notes: this.notes.map((note) => ({ ...note })),
      tempo: this.tempo,
      timeSignature: this.timeSignature,
      loopLength: this.loopLength,
      swing: this.swing,
      warmth: this.warmth,
      key: this.key,
      scale: this.scale,
      history: [...this.history],
      lastModified: this.lastModified
    };
  }

  touch() {
    this.lastModified = new Date().toISOString();
  }

  recordHistory({ parameter, value, timestamp = new Date().toISOString() }) {
    this.history.push({ parameter, value, timestamp });
    if (this.history.length > 200) {
      this.history.shift();
    }
  }
}
