import { create, all } from 'mathjs';

const math = create(all, {});

export const NOTE_DURATIONS = {
  '1/16': 0.25,
  '1/8': 0.5,
  '1/4': 1,
  '1/2': 2,
  '1/1': 4
};

export function beatsToSeconds(beats, tempo) {
  return (60 / tempo) * beats;
}

export function secondsToBeats(seconds, tempo) {
  return seconds * (tempo / 60);
}

export function durationToBeats(duration) {
  if (typeof duration === 'number') {
    return duration;
  }
  const mapped = NOTE_DURATIONS[duration];
  if (mapped) {
    return mapped;
  }
  const [num, denom] = duration.split('/').map((part) => math.number(part));
  return num / denom * 4;
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
