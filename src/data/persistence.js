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
  const rawName = typeof data.name === 'string' ? data.name.trim() : '';
  const sanitized = rawName
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'measure';
  const filename = path.join(MEASURES_DIR, `${sanitized}_${data.id}.json`);
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

export async function listSessions() {
  await ensureDirectories();
  const files = await fs.readdir(SESSIONS_DIR);
  return files
    .filter((file) => file.endsWith('.json'))
    .map((file) => path.join(SESSIONS_DIR, file))
    .sort((a, b) => {
      const aTime = Number(path.basename(a).replace(/\D+/g, ''));
      const bTime = Number(path.basename(b).replace(/\D+/g, ''));
      return bTime - aTime;
    });
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

export async function sessionSummary(filePath) {
  try {
    const payload = await loadSession(filePath);
    const measure = payload.measure || {};
    const timestamp = payload.timestamp ? new Date(payload.timestamp).toISOString() : null;
    return {
      name: measure.name || path.basename(filePath),
      reason: payload.reason || 'session',
      timestamp,
      tempo: measure.tempo,
      key: measure.key,
      scale: measure.scale,
      loopLength: measure.loopLength,
      timeSignature: measure.timeSignature
    };
  } catch (error) {
    return {
      name: path.basename(filePath),
      error: error.message
    };
  }
}

export async function loadSessionMeasure(filePath) {
  const payload = await loadSession(filePath);
  const measure = new Measure(payload.measure || {});
  if (Array.isArray(payload.history)) {
    measure.history = [...payload.history];
  }
  return {
    measure,
    history: Array.isArray(payload.history) ? payload.history : [...measure.history],
    metadata: {
      reason: payload.reason,
      timestamp: payload.timestamp
    }
  };
}
