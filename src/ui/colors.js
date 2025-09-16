import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

let colorConfig;

function loadColors() {
  if (!colorConfig) {
    const filePath = path.resolve(process.cwd(), 'config', 'colors.json');
    colorConfig = fs.readJsonSync(filePath);
  }
  return colorConfig;
}

export function colors() {
  return loadColors();
}

export function colorize(text, colorName) {
  const palette = loadColors();
  const color = palette[colorName] || palette.text;
  return chalk.hex(color)(text);
}
