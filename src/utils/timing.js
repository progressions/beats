import { create, all } from 'mathjs';

const math = create(all, {});

export const NOTE_DURATIONS = {
  '1/16': 0.25,
  '1/8': 0.5,
  '1/8.': 0.75,
  '1/4': 1,
  '1/4.': 1.5,
  '1/2': 2,
  '1/2.': 3,
  '1/1': 4,
  '1/1.': 6
};

export function beatsToSeconds(beats, tempo) {
  return (60 / tempo) * beats;
}

export function secondsToBeats(seconds, tempo) {
  return seconds * (tempo / 60);
}

function greatestCommonDivisor(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);

  while (y !== 0) {
    const remainder = x % y;
    x = y;
    y = remainder;
  }

  return x || 1;
}

export function durationToBeats(duration) {
  if (typeof duration === 'number') {
    return duration;
  }
  const numeric = Number(duration);
  if (!Number.isNaN(numeric)) {
    return numeric;
  }
  const mapped = NOTE_DURATIONS[duration];
  if (mapped) {
    return mapped;
  }
  const parts = duration.split('/');
  if (parts.length === 2) {
    const [numPart, denomPart] = parts;
    const num = math.number(numPart);
    const denom = math.number(denomPart);
    if (Number.isFinite(num) && Number.isFinite(denom) && denom !== 0) {
      return (num / denom) * 4;
    }
  }
  return 1;
}

export function quantizeToGrid(value, grid) {
  const ratio = value / grid;
  return Math.round(ratio) * grid;
}

export function computeSwingOffset(step, swingAmount = 0) {
  if (swingAmount === 0) {
    return 0;
  }
  const isOddStep = step % 2 === 1;
  const direction = isOddStep ? 1 : -1;
  return direction * swingAmount * 0.5;
}

export function beatsPerMeasure(timeSignature) {
  const { beats, division } = timeSignature;
  return beats * (4 / division);
}

export function totalBeats(loopLength, timeSignature) {
  return Math.max(loopLength, beatsPerMeasure(timeSignature));
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function formatTempo(tempo) {
  return `${Math.round(tempo)} BPM`;
}

export function formatSwing(swing) {
  return `${Math.round(swing * 100)}%`;
}

export function beatsToDuration(beats) {
  // Find exact match in NOTE_DURATIONS first
  for (const [duration, value] of Object.entries(NOTE_DURATIONS)) {
    if (Math.abs(value - beats) < 0.001) {
      return duration;
    }
  }

  const stepResolution = 0.25; // Sixteenth note resolution expressed in beats
  const tolerance = 0.001;
  const steps = Math.round(beats / stepResolution);
  const approxBeats = steps * stepResolution;

  if (steps > 0 && Math.abs(approxBeats - beats) < tolerance) {
    const wholeNoteSteps = Math.round(4 / stepResolution);
    const divisor = greatestCommonDivisor(steps, wholeNoteSteps);
    const numerator = steps / divisor;
    const denominator = wholeNoteSteps / divisor;
    return `${numerator}/${denominator}`;
  }

  // Fall back to a decimal representation when no neat fraction fits
  return parseFloat(beats.toFixed(3)).toString();
}
