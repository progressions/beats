import fs from 'fs-extra';
import path from 'path';

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

let scaleConfig;

function loadScales() {
  if (!scaleConfig) {
    const configPath = path.resolve(process.cwd(), 'config', 'scales.json');
    scaleConfig = fs.readJsonSync(configPath);
  }
  return scaleConfig;
}

export function getAvailableKeys() {
  return NOTES;
}

export function getAvailableScales() {
  return Object.keys(loadScales());
}

export function getScaleDefinition(scale) {
  const scales = loadScales();
  return scales[scale] || scales.major;
}

export function transpose(note, semitones) {
  const index = NOTES.indexOf(note);
  if (index === -1) {
    return note;
  }
  const newIndex = (index + semitones + NOTES.length) % NOTES.length;
  return NOTES[newIndex];
}

export function noteToMidi(note, octave = 4) {
  const baseIndex = NOTES.indexOf(note);
  if (baseIndex === -1) {
    return 60;
  }
  return 12 * (octave + 1) + baseIndex;
}

export function midiToFrequency(midiNumber) {
  return 440 * Math.pow(2, (midiNumber - 69) / 12);
}

export function pitchFromScale(step, key = 'C', scale = 'major') {
  const scaleDef = getScaleDefinition(scale);
  const intervals = scaleDef.intervals;
  const octave = Math.floor(step / intervals.length);
  const intervalIndex = step % intervals.length;
  const semitoneOffset = intervals[intervalIndex];
  const keyIndex = NOTES.indexOf(key);
  const midiValue = 12 * (4 + octave) + ((keyIndex + semitoneOffset) % 12);
  return midiToFrequency(midiValue);
}

export function nextInArray(array, current, direction = 1) {
  const index = array.indexOf(current);
  if (index === -1) {
    return array[0];
  }
  const newIndex = (index + direction + array.length) % array.length;
  return array[newIndex];
}

export function durationOptions() {
  return ['1/16', '1/8', '1/4', '1/2', '1/1'];
}

export function noteNameFromMidi(midi) {
  const octave = Math.floor(midi / 12) - 1;
  const pitch = midi % 12;
  return `${NOTES[pitch]}${octave}`;
}

export function midiFromNoteName(noteName) {
  const match = noteName.match(/^([A-G]#?)(-?\d+)$/);
  if (!match) {
    return 60;
  }
  const [, pitch, octaveStr] = match;
  const octave = parseInt(octaveStr, 10);
  return (octave + 1) * 12 + NOTES.indexOf(pitch);
}
