import fs from 'fs-extra';
import path from 'path';
import { Measure } from './measure.js';

const MEASURES_DIR = path.resolve(process.cwd(), 'measures');
const SESSIONS_DIR = path.resolve(process.cwd(), 'sessions');

export async function ensureDirectories() {
  await fs.ensureDir(MEASURES_DIR);
  await fs.ensureDir(SESSIONS_DIR);
}

export async function saveMeasure(measure) {
  await ensureDirectories();
  const data = measure.serialize();
  const filename = path.join(MEASURES_DIR, `${data.name.replace(/\s+/g, '_').toLowerCase()}_${data.id}.json`);
  await fs.writeJson(filename, data, { spaces: 2 });
  return filename;
}

export async function loadMeasure(filePath) {
  const payload = await fs.readJson(filePath);
  return new Measure(payload);
}

export async function listMeasures() {
  await ensureDirectories();
  const files = await fs.readdir(MEASURES_DIR);
  return files
    .filter((file) => file.endsWith('.json'))
    .map((file) => path.join(MEASURES_DIR, file));
}

export async function saveSession(sessionState) {
  await ensureDirectories();
  const filename = path.join(SESSIONS_DIR, `session-${Date.now()}.json`);
  await fs.writeJson(filename, sessionState, { spaces: 2 });
  return filename;
}

export async function loadSession(filePath) {
  return fs.readJson(filePath);
}

export async function measureSummary(filePath) {
  try {
    const payload = await fs.readJson(filePath);
    return {
      name: payload.name || path.basename(filePath),
      tempo: payload.tempo,
      key: payload.key,
      scale: payload.scale,
      loopLength: payload.loopLength,
      swing: payload.swing,
      warmth: payload.warmth,
      timeSignature: payload.timeSignature
    };
  } catch (error) {
    return {
      name: path.basename(filePath),
      error: error.message
    };
  }
}
