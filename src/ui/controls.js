import EventEmitter from 'events';

const LOOP_OPTIONS = [16, 32, 64, 128, 256];
const DURATION_ORDER = ['1/16', '1/8', '1/8.', '1/4', '1/4.', '1/2', '1/2.', '1/1', '1/1.'];

export class ControlHandler extends EventEmitter {
  constructor(screen) {
    super();
    this.screen = screen;
    this.durationIndex = 2;
    this.quantizationIndex = 0;
    this.loopIndex = Math.max(0, LOOP_OPTIONS.indexOf(16));
    this._registerEvents();
  }

  _registerEvents() {
    this.screen.key(['q', 'C-c'], () => this.emit('exit'));
    this.screen.key(['space'], () => this.emit('togglePlayback'));
    this.screen.key(['left'], () => this.emit('moveCursor', -1));
    this.screen.key(['right'], () => this.emit('moveCursor', 1));
    this.screen.key(['up'], () => this.emit('changeChannel', -1));
    this.screen.key(['down'], () => this.emit('changeChannel', 1));
    this.screen.key(['+', '='], () => this.emit('adjustPitch', 1));
    this.screen.key(['-', '_'], () => this.emit('adjustPitch', -1));

    this.screen.key(['p', 'P'], () => this.emit('addNote'));
    this.screen.key(['delete', 'backspace'], () => this.emit('deleteNote'));
    this.screen.key(['u', 'U'], () => this.emit('deleteNote'));
    this.screen.key(['h'], () => this.emit('toggleHelp'));
    this.screen.key([']'], () => this.emit('helpNext'));
    this.screen.key(['['], () => this.emit('helpPrev'));
    this.screen.key(['C-h'], () => this.emit('toggleHistory'));
    this.screen.key(['C-s', 'C-S-s', 'f5'], () => this.emit('saveMeasure'));
    this.screen.key(['C-o', 'C-l', 'f6'], () => this.emit('loadMeasure'));
    this.screen.key(['C-n'], () => this.emit('newMeasure'));
    this.screen.key(['c', 'C'], () => this.emit('toggleCopyMode'));
    this.screen.key(['enter'], () => this.emit('confirmCopySelection'));
    this.screen.key(['escape'], () => this.emit('cancelCopySelection'));
    this.screen.key(['C-v'], () => this.emit('pasteClipboard'));
    this.screen.key(['C-z'], () => this.emit('undo'));
    this.screen.key(['C-y'], () => this.emit('redo'));
    this.screen.key(['a', 'b', 'c', 'd', 'e', 'f', 'g'], (ch) => {
      this.emit('selectNoteLetter', ch);
    });
    this.screen.key(['i', 'I'], () => this.emit('tieNote'));

    this.screen.key(['t'], () => this.emit('tempoChange', 5));
    this.screen.key(['T', 'S-t', 'shift-t'], () => this.emit('tempoChange', -5));

    this.screen.key(['w'], () => this.emit('toggleSwing'));

    this.screen.key(['k'], () => this.emit('cycleKey', 1));
    this.screen.key(['K', 'S-k', 'shift-k'], () => this.emit('cycleKey', -1));

    this.screen.key(['s'], () => this.emit('cycleScale', 1));
    this.screen.key(['S', 'S-s', 'shift-s'], () => this.emit('cycleScale', -1));

    this.screen.key(['r'], () => this.emit('adjustWarmth', 0.1));
    this.screen.key(['R', 'S-r', 'shift-r'], () => this.emit('adjustWarmth', -0.1));
    this.screen.key(['m', 'M'], () => this.emit('toggleMute'));

    this.screen.key(['l'], () => {
      this.loopIndex = (this.loopIndex + 1) % LOOP_OPTIONS.length;
      this.emit('changeLoop', LOOP_OPTIONS[this.loopIndex]);
    });

    this.screen.key(['d'], () => {
      this.durationIndex = (this.durationIndex + 1) % DURATION_ORDER.length;
      this.emit('changeDuration', DURATION_ORDER[this.durationIndex]);
    });

    this.screen.key(['D', 'S-d', 'shift-d'], () => {
      this.durationIndex = (this.durationIndex - 1 + DURATION_ORDER.length) % DURATION_ORDER.length;
      this.emit('changeDuration', DURATION_ORDER[this.durationIndex]);
    });

    this.screen.key(['q'], () => {
      this.quantizationIndex = (this.quantizationIndex + 1) % DURATION_ORDER.length;
      this.emit('changeQuantization', DURATION_ORDER[this.quantizationIndex]);
    });

    this.screen.key(['Q', 'S-q', 'shift-q'], () => {
      this.quantizationIndex = (this.quantizationIndex - 1 + DURATION_ORDER.length) % DURATION_ORDER.length;
      this.emit('changeQuantization', DURATION_ORDER[this.quantizationIndex]);
    });

    this.screen.key(['3'], () => this.emit('changeTimeSignature', { beats: 3, division: 4 }));
    this.screen.key(['4'], () => this.emit('changeTimeSignature', { beats: 4, division: 4 }));
  }
}
