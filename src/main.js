#!/usr/bin/env node
import fs from 'fs-extra';
import path from 'path';
import { Measure } from './data/measure.js';
import { Interface } from './ui/interface.js';
import { AudioEngine } from './audio/engine.js';
import { ensureDirectories, saveMeasure, loadMeasure, listMeasures, saveSession, measureSummary } from './data/persistence.js';
import { validateMeasure } from './data/validation.js';

async function loadDefaults() {
  const defaultsPath = path.resolve(process.cwd(), 'config', 'defaults.json');
  return fs.readJson(defaultsPath);
}

async function run() {
  await ensureDirectories();
  const defaults = await loadDefaults();
  let currentMeasure = new Measure({
    name: 'Untitled',
    tempo: defaults.tempo,
    timeSignature: defaults.timeSignature,
    loopLength: defaults.loopLength,
    swing: defaults.swing,
    warmth: defaults.warmth,
    key: defaults.key,
    scale: defaults.scale
  });
  let parameterHistory = [...currentMeasure.history];
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

  ui.on('togglePlayback', () => {
    audioEngine.toggle();
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
      ui.showMessage(`Saved to ${path.basename(filePath)}`);
      logHistory({ parameter: 'save', value: path.basename(filePath), timestamp: new Date().toISOString() });
      scheduleAutoSave('save');
    } catch (error) {
      ui.showMessage(`Save failed: ${error.message}`);
    }
  });

  ui.on('loadMeasure', async () => {
    const files = await listMeasures();
    if (files.length === 0) {
      ui.showMessage('No measures saved yet.');
      return;
    }
    const summaries = await Promise.all(
      files.map(async (file) => ({
        file,
        summary: await measureSummary(file)
      }))
    );
    const choice = await ui.promptList({
      title: 'Load Measure',
      items: summaries.map(({ summary, file }) => {
        if (summary.error) {
          return `${path.basename(file)} (error)`;
        }
        const { name, tempo, key, scale, loopLength, timeSignature } = summary;
        const signature = timeSignature ? `${timeSignature.beats}/${timeSignature.division}` : '—';
        const tempoLabel = tempo ? `${tempo}` : '—';
        const keyLabel = key || '—';
        const scaleLabel = scale || '—';
        const stepsLabel = loopLength || '—';
        return `${name} • ${tempoLabel} BPM • ${keyLabel} ${scaleLabel} • ${stepsLabel} steps • ${signature}`;
      })
    });
    if (!choice) {
      ui.showMessage('Load cancelled.');
      return;
    }
    const selected = summaries[choice.index];
    const selectedPath = selected.file;
    try {
      currentMeasure = await loadMeasure(selectedPath);
      audioEngine.setMeasure(currentMeasure);
      ui.setMeasure(currentMeasure);
      parameterHistory = [...currentMeasure.history];
      ui.updateHistory(parameterHistory);
      logHistory({ parameter: 'load', value: path.basename(selectedPath), timestamp: new Date().toISOString() });
      scheduleAutoSave('load');
      ui.showMessage(`Loaded ${currentMeasure.name || path.basename(selectedPath)}`);
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

  audioEngine.on('start', () => {
    ui.setPlaying(true);
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
