import chalk from 'chalk';
import { colors } from './colors.js';

function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
  const bigint = parseInt(normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return { r, g, b };
}

function blendHex(colorA, colorB, amount) {
  const a = hexToRgb(colorA);
  const b = hexToRgb(colorB);
  const clampAmount = Math.max(0, Math.min(1, amount));
  const r = Math.round(a.r + (b.r - a.r) * clampAmount);
  const g = Math.round(a.g + (b.g - a.g) * clampAmount);
  const bChannel = Math.round(a.b + (b.b - a.b) * clampAmount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bChannel
    .toString(16)
    .padStart(2, '0')}`;
}

function gradientColorAt(start, mid, end, ratio) {
  if (ratio <= 0.5) {
    const local = ratio * 2;
    return blendHex(start, mid, local);
  }
  const local = (ratio - 0.5) * 2;
  return blendHex(mid, end, local);
}

export function createPastelGradient(width, warmth = 0.5) {
  const palette = colors();
  const warmAccent = blendHex(palette.accent, palette.warning, warmth);
  const warmGlow = blendHex(palette.success, palette.warning, warmth);
  return (index, text) => {
    const ratio = width <= 1 ? 0 : Math.min(1, index / (width - 1));
    const color = gradientColorAt(palette.note, warmAccent, warmGlow, ratio);
    return chalk.hex(color)(text);
  };
}

export function colorizeByPosition(text, position, width, warmth = 0.5) {
  const palette = colors();
  const warmAccent = blendHex(palette.accent, palette.warning, warmth);
  const warmGlow = blendHex(palette.success, palette.warning, warmth);
  const ratio = width <= 1 ? 0 : Math.min(1, position / (width - 1));
  const color = gradientColorAt(palette.note, warmAccent, warmGlow, ratio);
  return chalk.hex(color)(text);
}
