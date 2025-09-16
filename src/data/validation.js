import { NOTE_DURATIONS } from '../utils/timing.js';
import { getAvailableKeys, getAvailableScales } from '../utils/music.js';

const VALID_TIME_SIGNATURES = [
  { beats: 3, division: 4 },
  { beats: 4, division: 4 },
  { beats: 5, division: 4 },
  { beats: 6, division: 8 }
];

export function validateTempo(tempo) {
  return tempo >= 40 && tempo <= 260;
}

export function validateDuration(duration) {
  return Object.prototype.hasOwnProperty.call(NOTE_DURATIONS, duration);
}

export function validateTimeSignature(signature) {
  return VALID_TIME_SIGNATURES.some(({ beats, division }) => signature.beats === beats && signature.division === division);
}

export function validateKey(key) {
  return getAvailableKeys().includes(key);
}

export function validateScale(scale) {
  return getAvailableScales().includes(scale);
}

export function validateWarmth(warmth) {
  return warmth >= 0 && warmth <= 1;
}

export function validateSwing(swing) {
  return swing >= 0 && swing <= 1;
}

export function validateMeasure(measure) {
  const errors = [];
  if (!validateTempo(measure.tempo)) {
    errors.push('Tempo must be between 40 and 260 BPM.');
  }
  if (!validateTimeSignature(measure.timeSignature)) {
    errors.push('Unsupported time signature.');
  }
  if (!validateKey(measure.key)) {
    errors.push('Invalid key.');
  }
  if (!validateScale(measure.scale)) {
    errors.push('Invalid scale.');
  }
  if (!validateWarmth(measure.warmth)) {
    errors.push('Warmth must be within 0.0 - 1.0.');
  }
  if (!validateSwing(measure.swing)) {
    errors.push('Swing must be within 0.0 - 1.0.');
  }
  measure.notes.forEach((note) => {
    if (!validateDuration(note.duration)) {
      errors.push(`Invalid note duration: ${note.duration}`);
    }
  });
  return errors;
}
