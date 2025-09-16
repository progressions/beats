import EventEmitter from 'events';

const LOOP_OPTIONS = [16, 32, 64];
const DURATION_ORDER = ['1/16', '1/8', '1/4', '1/2', '1/1'];

export class ControlHandler extends EventEmitter {
  constructor(screen) {
    super();
    this.screen = screen;
    this.durationIndex = 2;
    this.loopIndex = 0;
    this._registerEvents();
  }

  _registerEvents() {
    this.screen.key(['q', 'C-c'], () => this.emit('exit'));
    this.screen.key(['space'], () => this.emit('togglePlayback'));
    this.screen.key(['left'], () => this.emit('moveCursor', -1));
    this.screen.key(['right'], () => this.emit('moveCursor', 1));
    this.screen.key(['up'], () => this.emit('adjustPitch', 1));
    this.screen.key(['down'], () => this.emit('adjustPitch', -1));

    this.screen.key(['p', 'P'], () => this.emit('addNote'));
    this.screen.key(['u', 'U'], () => this.emit('deleteNote'));
    this.screen.key(['h'], () => this.emit('toggleHelp'));
    this.screen.key(['C-s'], () => this.emit('saveMeasure'));
    this.screen.key(['C-o'], () => this.emit('loadMeasure'));
    this.screen.key(['C-n'], () => this.emit('newMeasure'));
    this.screen.key(['a', 'b', 'c', 'd', 'e', 'f', 'g'], (ch) => {
      this.emit('selectNoteLetter', ch);
    });

    this.screen.key(['t'], (_, key) => {
      if (key.shift) {
        this.emit('tempoChange', -5);
      } else {
        this.emit('tempoChange', 5);
      }
    });

    this.screen.key(['w'], () => this.emit('toggleSwing'));

    this.screen.key(['k'], (_, key) => {
      const direction = key.shift ? -1 : 1;
      this.emit('cycleKey', direction);
    });

    this.screen.key(['s'], (_, key) => {
      const direction = key.shift ? -1 : 1;
      this.emit('cycleScale', direction);
    });

    this.screen.key(['r'], (_, key) => {
      const delta = key.shift ? -0.1 : 0.1;
      this.emit('adjustWarmth', delta);
    });

    this.screen.key(['l'], () => {
      this.loopIndex = (this.loopIndex + 1) % LOOP_OPTIONS.length;
      this.emit('changeLoop', LOOP_OPTIONS[this.loopIndex]);
    });

    this.screen.key(['d'], () => {
      this.durationIndex = (this.durationIndex + 1) % DURATION_ORDER.length;
      this.emit('changeDuration', DURATION_ORDER[this.durationIndex]);
    });

    this.screen.key(['3'], () => this.emit('changeTimeSignature', { beats: 3, division: 4 }));
    this.screen.key(['4'], () => this.emit('changeTimeSignature', { beats: 4, division: 4 }));
  }
}
