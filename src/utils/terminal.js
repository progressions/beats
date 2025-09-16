import blessed from 'blessed';

export function detectTerminalSize() {
  const { columns, rows } = process.stdout;
  return { columns, rows };
}

export function createScreen() {
  return blessed.screen({
    smartCSR: true,
    title: 'Interactive Measure Editor',
    fullUnicode: true
  });
}
