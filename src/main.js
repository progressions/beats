#!/usr/bin/env node
import fs from 'fs-extra';
import path from 'path';
import { Measure } from './data/measure.js';
import { Interface } from './ui/interface.js';
import { AudioEngine } from './audio/engine.js';
import {
  ensureDirectories,
  saveMeasure,
  loadMeasure,
  listMeasures,
  listSessions,
  saveSession,
  measureSummary,
  sessionSummary,
  loadSessionMeasure
} from './data/persistence.js';
import { validateMeasure } from './data/validation.js';

async function loadDefaults() {
  const defaultsPath = path.resolve(process.cwd(), 'config', 'defaults.json');
  return fs.readJson(defaultsPath);
}

async function findMostRecentFile() {
  try {
    const [measureFiles, sessionFiles] = await Promise.all([listMeasures(), listSessions()]);

    if (measureFiles.length === 0 && sessionFiles.length === 0) {
      return null;
    }

    let mostRecentFile = null;
    let mostRecentTime = 0;
    let mostRecentType = null;

    // Check measure files
    for (const file of measureFiles) {
      try {
        const stats = await fs.stat(file);
        if (stats.mtime.getTime() > mostRecentTime) {
          mostRecentTime = stats.mtime.getTime();
          mostRecentFile = file;
          mostRecentType = 'measure';
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }

    // Check session files (already sorted by timestamp, so check first few)
    for (const file of sessionFiles.slice(0, 5)) {
      try {
        const stats = await fs.stat(file);
        if (stats.mtime.getTime() > mostRecentTime) {
          mostRecentTime = stats.mtime.getTime();
          mostRecentFile = file;
          mostRecentType = 'session';
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }

    return mostRecentFile ? { file: mostRecentFile, type: mostRecentType, mtime: mostRecentTime } : null;
  } catch (error) {
    return null;
  }
}

async function run() {
  await ensureDirectories();
  const defaults = await loadDefaults();

  // Try to load the most recent file
  let currentMeasure;
  let parameterHistory = [];
  let loadedFromFile = false;

  const recentFile = await findMostRecentFile();
  if (recentFile) {
    try {
      if (recentFile.type === 'session') {
        const { measure, history } = await loadSessionMeasure(recentFile.file);
        currentMeasure = measure;
        parameterHistory = Array.isArray(history) ? [...history] : [...measure.history];
        loadedFromFile = true;
      } else {
        currentMeasure = await loadMeasure(recentFile.file);
        parameterHistory = [...currentMeasure.history];
        loadedFromFile = true;
      }
    } catch (error) {
      // Fall back to default measure if loading fails
      loadedFromFile = false;
    }
  }

  // Create default measure if no recent file or loading failed
  if (!loadedFromFile) {
    currentMeasure = new Measure({
      name: 'Untitled',
      tempo: defaults.tempo,
      timeSignature: defaults.timeSignature,
      loopLength: defaults.loopLength,
      swing: defaults.swing,
      warmth: defaults.warmth,
      key: defaults.key,
      scale: defaults.scale
    });
    parameterHistory = [...currentMeasure.history];
  }
  let autoSaveTimer = null;
  let pendingAutoSaveReason = 'init';
  const AUTO_SAVE_DELAY = 3000;

  const audioEngine = new AudioEngine({
    sampleRate: defaults.sampleRate,
    channels: defaults.channels
  });
  audioEngine.setMeasure(currentMeasure);

  const ui = new Interface({ measure: currentMeasure, audioEngine, defaults });
  ui.updateHistory(parameterHistory);

  // Show startup message
  if (loadedFromFile && recentFile) {
    const fileName = path.basename(recentFile.file);
    const fileType = recentFile.type === 'session' ? 'session' : 'measure';
    const measureName = currentMeasure.name || 'Untitled';
    ui.showMessage(`Loaded recent ${fileType}: ${measureName} (${fileName})`);
  } else {
    ui.showMessage('Started with new measure.');
  }

  const scheduleAutoSave = (reason = 'parameter') => {
    pendingAutoSaveReason = reason;
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
    }
    autoSaveTimer = setTimeout(async () => {
      if (!currentMeasure) {
        return;
      }
      const sessionState = {
        timestamp: new Date().toISOString(),
        reason: pendingAutoSaveReason,
        measure: currentMeasure.serialize(),
        history: [...parameterHistory]
      };
      try {
        const filePath = await saveSession(sessionState);
        ui.showMessage(`Session auto-saved → ${path.basename(filePath)}`);
      } catch (error) {
        ui.showMessage(`Auto-save failed: ${error.message}`);
      }
    }, AUTO_SAVE_DELAY);
  };

  const logHistory = (entry) => {
    parameterHistory.push(entry);
    if (parameterHistory.length > 500) {
      parameterHistory.shift();
    }
    ui.updateHistory(parameterHistory);
  };

  ui.on('exit', () => {
    audioEngine.stop();
    ui.showMessage('Goodbye!');
    ui.setPlaying(false);
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
    }
    setTimeout(() => {
      ui.screen.destroy();
      process.exit(0);
    }, 100);
  });

  ui.on('togglePlayback', ({ cursorStep = 0, stepResolutionBeats = 0.25 } = {}) => {
    audioEngine.toggle({ startStep: cursorStep, stepResolutionBeats });
  });

  ui.on('saveMeasure', async () => {
    if (!currentMeasure) {
      return;
    }
    const nameInput = await ui.promptText({ title: 'Measure Name', initial: currentMeasure.name });
    if (nameInput === null) {
      ui.showMessage('Save cancelled.');
      return;
    }
    if (nameInput.length > 0 && nameInput !== currentMeasure.name) {
      currentMeasure.name = nameInput;
      currentMeasure.touch();
      currentMeasure.recordHistory({ parameter: 'name', value: nameInput });
      logHistory({ parameter: 'name', value: nameInput, timestamp: new Date().toISOString() });
    }
    const errors = validateMeasure(currentMeasure);
    if (errors.length > 0) {
      ui.showMessage(`Cannot save: ${errors.join(' ')}`);
      return;
    }
    try {
      const filePath = await saveMeasure(currentMeasure);
      const savedName = path.basename(filePath);
      ui.showMessage(`Saved "${currentMeasure.name}" → measures/${savedName}`);
      logHistory({ parameter: 'save', value: savedName, timestamp: new Date().toISOString() });
      scheduleAutoSave('save');
    } catch (error) {
      ui.showMessage(`Save failed: ${error.message}`);
    }
  });

  ui.on('loadMeasure', async () => {
    const [measureFiles, sessionFiles] = await Promise.all([listMeasures(), listSessions()]);
    if (measureFiles.length === 0 && sessionFiles.length === 0) {
      ui.showMessage('No measures or sessions saved yet.');
      return;
    }

    const entries = [];

    const measureSummaries = await Promise.all(
      measureFiles.map(async (file) => ({
        type: 'measure',
        file,
        summary: await measureSummary(file)
      }))
    );
    entries.push(...measureSummaries);

    const sessionSummaries = await Promise.all(
      sessionFiles.map(async (file) => ({
        type: 'session',
        file,
        summary: await sessionSummary(file)
      }))
    );
    entries.push(...sessionSummaries);

    const formatTimestamp = (iso) => {
      if (!iso) {
        return '—';
      }
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) {
        return '—';
      }
      return date.toLocaleString();
    };

    const choice = await ui.promptList({
      title: 'Load Measure or Session',
      items: entries.map((entry) => {
        const fileName = path.basename(entry.file);
        const { summary } = entry;
        if (summary.error) {
          const label = entry.type === 'session' ? 'Session' : 'Measure';
          return `${label}: ${fileName} (error)`;
        }
        const signature = summary.timeSignature ? `${summary.timeSignature.beats}/${summary.timeSignature.division}` : '—';
        const tempoLabel = summary.tempo ? `${summary.tempo}` : '—';
        const keyLabel = summary.key || '—';
        const scaleLabel = summary.scale || '—';
        const stepsLabel = summary.loopLength || '—';
        if (entry.type === 'session') {
          const reasonLabel = summary.reason ? summary.reason : 'session';
          const timeLabel = formatTimestamp(summary.timestamp);
          return `Session • ${timeLabel} • ${reasonLabel} • ${summary.name} (${keyLabel} ${scaleLabel}, ${tempoLabel} BPM, ${stepsLabel} steps, ${signature})`;
        }
        return `Measure • ${summary.name} (${keyLabel} ${scaleLabel}, ${tempoLabel} BPM, ${stepsLabel} steps, ${signature})`;
      })
    });
    if (!choice) {
      ui.showMessage('Load cancelled.');
      return;
    }
    const selected = entries[choice.index];
    const selectedPath = selected.file;
    try {
      if (selected.type === 'session') {
        const { measure, history, metadata } = await loadSessionMeasure(selectedPath);
        currentMeasure = measure;
        audioEngine.setMeasure(currentMeasure);
        ui.setMeasure(currentMeasure);
        parameterHistory = Array.isArray(history) ? [...history] : [...currentMeasure.history];
        currentMeasure.history = [...parameterHistory];
        ui.updateHistory(parameterHistory);
        logHistory({
          parameter: 'session-load',
          value: path.basename(selectedPath),
          timestamp: new Date().toISOString()
        });
        scheduleAutoSave('session-load');
        const reasonLabel = metadata.reason ? ` (${metadata.reason})` : '';
        const timeLabel = metadata.timestamp ? ` @ ${formatTimestamp(metadata.timestamp)}` : '';
        ui.showMessage(`Recovered session → ${currentMeasure.name || path.basename(selectedPath)}${reasonLabel}${timeLabel}`);
      } else {
        currentMeasure = await loadMeasure(selectedPath);
        audioEngine.setMeasure(currentMeasure);
        ui.setMeasure(currentMeasure);
        parameterHistory = [...currentMeasure.history];
        ui.updateHistory(parameterHistory);
        logHistory({ parameter: 'load', value: path.basename(selectedPath), timestamp: new Date().toISOString() });
        scheduleAutoSave('load');
        ui.showMessage(`Loaded ${currentMeasure.name || path.basename(selectedPath)}`);
      }
    } catch (error) {
      ui.showMessage(`Load failed: ${error.message}`);
    }
  });

  ui.on('newMeasure', async () => {
    currentMeasure = new Measure({
      name: 'Untitled',
      tempo: defaults.tempo,
      timeSignature: defaults.timeSignature,
      loopLength: defaults.loopLength,
      swing: defaults.swing,
      warmth: defaults.warmth,
      key: defaults.key,
      scale: defaults.scale
    });
    audioEngine.setMeasure(currentMeasure);
    ui.setMeasure(currentMeasure);
    parameterHistory = [...currentMeasure.history];
    ui.updateHistory(parameterHistory);
    logHistory({ parameter: 'new', value: currentMeasure.id, timestamp: new Date().toISOString() });
    scheduleAutoSave('new');
    ui.showMessage('New measure ready.');
  });

  ui.on('parameterChange', (entry) => {
    logHistory(entry);
    scheduleAutoSave('parameter');
  });

  ui.on('noteChange', (change) => {
    logHistory({ parameter: `note:${change.type}`, value: change.step, timestamp: new Date().toISOString() });
    scheduleAutoSave('note');
  });

  audioEngine.on('start', (payload = {}) => {
    ui.setPlaying(true, payload);
    ui.showMessage('Playback started.');
  });
  audioEngine.on('stop', () => {
    ui.setPlaying(false);
    ui.showMessage('Playback stopped.');
  });

}

run().catch((error) => {
  console.error('Failed to start Interactive Measure Editor:', error);
  process.exit(1);
});
