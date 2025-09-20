import { v4 as uuid } from 'uuid';
import { NOTE_DURATIONS, durationToBeats, totalBeats } from '../utils/timing.js';
import { noteToMidi } from '../utils/music.js';

export class NoteEvent {
  constructor({
    id = uuid(),
    step = 0,
    duration = '1/4',
    velocity = 0.8,
    pitch = 60,
    octave = 4,
    channel = 0
  }) {
    this.id = id;
    this.step = step;
    this.duration = duration;
    this.velocity = velocity;
    this.pitch = pitch;
    this.octave = octave;
    this.channel = channel;
  }

  clone(overrides = {}) {
    return new NoteEvent({
      id: uuid(),
      step: this.step,
      duration: this.duration,
      velocity: this.velocity,
      pitch: this.pitch,
      octave: this.octave,
      channel: this.channel,
      ...overrides
    });
  }

  get durationBeats() {
    if (NOTE_DURATIONS[this.duration]) {
      return NOTE_DURATIONS[this.duration];
    }
    return durationToBeats(this.duration);
  }

  get midi() {
    return typeof this.pitch === 'number' ? this.pitch : noteToMidi(this.pitch, this.octave);
  }
}

const DEFAULT_CHANNELS = [
  { id: 'ch1', name: 'Lead', color: '#ff6b9d' },
  { id: 'ch2', name: 'Harmony', color: '#8e44ad' },
  { id: 'ch3', name: 'Bass', color: '#0abde3' },
  { id: 'ch4', name: 'Percussion', color: '#fdcb6e' }
];

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
    history = [],
    channels = DEFAULT_CHANNELS
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
    this.channels = channels.length > 0 ? channels : DEFAULT_CHANNELS;
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
    return [...this.notes].sort((a, b) => {
      if (a.channel !== b.channel) {
        return a.channel - b.channel;
      }
      return a.step - b.step;
    });
  }

  notesAtStep(step, channel = null) {
    return this.notes.filter((note) => {
      if (note.step !== step) {
        return false;
      }
      if (channel === null || channel === undefined) {
        return true;
      }
      return note.channel === channel;
    });
  }

  totalBeats() {
    return totalBeats(this.loopLength, this.timeSignature);
  }

  channelCount() {
    return this.channels.length;
  }

  channelInfo(index) {
    return this.channels[index] || { id: `ch${index + 1}`, name: `Channel ${index + 1}` };
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
      channels: this.channels,
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
