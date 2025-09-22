# Building a Terminal-Based Music Sequencer: Development Journey of the Interactive Measure Editor

The Interactive Measure Editor represents an unconventional approach to music creation—a terminal-based sequencer designed for rapid sketching of four-on-the-floor ideas without leaving the command line. After 24 commits over the past three months, this alpha-stage application has evolved from a basic concept into a sophisticated tool with real-time audio synthesis, comprehensive note editing, and professional workflow features.

## The Core Vision

I set out to create something that I'd like to use: a music sequencer that runs entirely in the terminal. While DAWs require heavy GUI frameworks and audio software often demands complex installations, this application runs with nothing more than Node.js and a terminal that supports 256 colors. The goal was to capture musical ideas as quickly as writing code—with keyboard shortcuts, immediate feedback, and no mouse dependency.

The specific motivation was creating themes for my game Shadow Kingdom. I needed a tool for composing simple, looping NES-style music reminiscent of classic Zelda soundtracks—melodic themes that could seamlessly integrate into game environments. Traditional DAWs felt heavyweight for this focused task, and I wanted something that matched my development workflow: fast, keyboard-driven, and terminal-based.

## Architecture Decisions

### Modular ES6 Structure

The codebase follows a clean separation of concerns across 19 modules:

```
src/
├── audio/          # Real-time synthesis and timing
├── data/           # State management and persistence
├── ui/             # Terminal rendering and interaction
├── utils/          # Shared utilities
└── main.js         # Application entry point
```

I chose ES modules (`"type": "module"` in package.json) for clean imports and modern JavaScript practices. Each module has explicit exports, making the dependency graph transparent and testable.

### Real-Time Audio Pipeline

The audio system (`src/audio/engine.js`) streams continuously generated samples using the `speaker` package. Rather than loading audio files, the application synthesizes everything in real-time:

```javascript
// Simplified synthesis core
const generateSample = (frequency, time, warmth) => {
  const wave = Math.sin(2 * Math.PI * frequency * time);
  const harmonics = warmth * Math.sin(4 * Math.PI * frequency * time);
  return wave + (harmonics * 0.3);
};
```

This approach keeps the application lightweight—no audio assets, just mathematical wave generation with customizable warmth parameters.

### Terminal-First UI Design

The piano roll (`src/ui/pianoroll.js`) renders using Unicode characters and 256-color ANSI codes. Each semitone gets a unique hue, creating an intuitive pitch-to-color mapping:

```javascript
// Pitch-based coloring system
const getPitchColor = (midiNote) => {
  const semitone = midiNote % 12;
  const hue = (semitone * 30) % 360; // 30-degree intervals
  return chalk.hsl(hue, 70, 60);
};
```

The interface updates in real-time as you edit, providing immediate visual feedback without any rendering lag.

## Key Development Milestones

### Phase 1: Foundation (Initial Commits)
The early commits established the basic architecture—audio synthesis, measure data structures, and terminal rendering. I started with a simple grid-based approach where each step could hold one note per channel.

### Phase 2: Parameter Control (Mid-Development)
Around commit `89a8b66`, I added the parameter panel system. This was crucial—users needed to adjust tempo, swing, key, and scale without leaving the interface. The challenge was fitting all controls into limited terminal space while maintaining readability.

### Phase 3: Advanced Editing (Recent Features)
The latest development phase focused on professional editing workflows:

#### Inline Note Edit Mode (Commit `008619e`)
The most significant recent feature allows editing notes directly in the piano roll. Press Enter on any note to highlight it, then use the same pitch/duration controls to modify it in real-time:

```javascript
// Edit mode state management
if (interface.editMode.active) {
  const note = interface.editMode.note;
  note.pitch += pitchChange;
  note.duration = newDuration;
  // Update both audio and visual immediately
}
```

This eliminated the previous workflow where you had to delete and re-place notes for any modifications.

#### Comprehensive Undo/Redo System (Commit `770a05d`)
I implemented a 50-step history stack with Ctrl+Z/Ctrl+Y shortcuts. Each action creates a snapshot of the entire measure state:

```javascript
// History management
const saveToHistory = (measure, action) => {
  if (historyStack.length >= 50) {
    historyStack.shift(); // Remove oldest entry
  }
  historyStack.push({
    measure: JSON.parse(JSON.stringify(measure)),
    action,
    timestamp: Date.now()
  });
};
```

#### Advanced Copy/Paste Workflow (Commit `5f7ac22`)
The copy system allows selecting regions across multiple channels and steps. Press C to enter copy mode, mark boundaries with Enter, then paste with Ctrl+V. The implementation handles edge cases like pasting beyond measure boundaries and overlapping existing notes.

## Technical Challenges and Solutions

### Sample-Accurate Timing
Getting precise audio timing in Node.js required careful buffer management. The audio engine generates samples in chunks while maintaining phase continuity:

```javascript
// Continuous phase tracking
let globalPhase = 0;
const generateChunk = (samples) => {
  const chunk = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    chunk[i] = synthesizeAtPhase(globalPhase);
    globalPhase += phaseIncrement;
  }
  return chunk;
};
```

### Terminal Color Limitations
Supporting 256-color terminals while gracefully degrading for basic terminals required testing different color modes. I settled on HSL-based colors converted to the closest terminal color index.

### State Synchronization
Keeping audio, visual, and data states synchronized required careful event ordering. The interface updates immediately for visual feedback, then triggers audio recalculation, then persists changes—in that exact sequence to avoid race conditions.

## User Experience Improvements

### Keyboard-Driven Workflow
Every function has a keyboard shortcut. The design philosophy prioritizes speed over discoverability—once learned, users can edit music as fast as they can think.

### Visual Feedback Systems
Multiple visual indicators provide context:
- **Pitch colors**: Immediate pitch recognition
- **Beat markers**: Visual rhythm grid every 4 steps
- **Edit highlights**: Clear indication of selected notes
- **Playhead tracking**: Real-time playback position

### Intelligent Defaults
The application starts with musically sensible defaults: 120 BPM, C major, 16-step loops, quarter-note duration. Users can be productive immediately without configuration.

## Code Quality Decisions

### No External Frameworks
I avoided music-specific frameworks and built synthesis from scratch. This keeps dependencies minimal (only 7 packages) and ensures the application can run in any Node.js environment.

### Configuration-Driven Defaults
Rather than hardcoding values, defaults live in `config/defaults.json`:

```json
{
  "tempo": 120,
  "loopLength": 16,
  "key": "C",
  "scale": "major",
  "quantization": 4
}
```

This makes the application customizable without code changes.

### Comprehensive Persistence
The dual persistence system saves work automatically (`sessions/`) and allows manual saves (`measures/`). Every edit triggers an autosave, preventing data loss from terminal crashes.

## Current State and Future Plans

The application is currently in alpha but fully functional for its intended use case. Recent features like inline editing and undo/redo have made it feel like a professional tool rather than a prototype.

### Immediate Improvements
- **Performance optimization**: Large measures (256 steps) can cause render lag
- **Error handling**: Better recovery from audio system failures
- **Documentation**: More comprehensive help system

### Future Features
- **MIDI export**: Save compositions to standard MIDI files for use in Shadow Kingdom
- **Multiple measures**: Chain sequences for complete songs and longer game themes
- **Sample support**: Load and trigger audio samples alongside synthesis
- **Game integration**: Direct export to game-ready audio formats
- **Network sync**: Collaborative editing over websockets

## Lessons Learned

### Terminal Applications Can Be Sophisticated
This project proved that command-line interfaces don't have to be primitive. With careful design, terminal applications can provide rich, interactive experiences that rival GUI applications.

### Real-Time Audio in Node.js Is Viable
While Node.js isn't known for audio applications, the `speaker` package and careful buffer management made real-time synthesis surprisingly stable.

### Keyboard Shortcuts Need Consistency
The shortcut system evolved organically, leading to some inconsistencies. For example, the initial implementation had a conflict where Q was mapped to both Quit and Quantization control—a serious usability issue. I resolved this by moving quantization to Z/Shift+Z (representing "Zoom" or grid level), which maintains the paired increment/decrement pattern while avoiding conflicts. Future versions will establish clearer conventions for key mappings.

## Technical Specifications

- **Node.js**: ≥16.0.0 required
- **Dependencies**: 7 packages, all lightweight utilities
- **Audio latency**: ~50ms on macOS (hardware dependent)
- **Memory usage**: <50MB for typical sessions
- **File formats**: JSON for measures, auto-generated timestamps for sessions

The Interactive Measure Editor demonstrates that music software doesn't need complex interfaces or heavyweight frameworks. By embracing terminal-native design and keyboard-driven workflows, it offers a unique creative environment optimized for rapid musical sketching. The application has already proven useful for composing NES-style themes for Shadow Kingdom, generating the kind of simple, looping melodies that work well in game environments. While still in alpha, the foundation is solid enough to support serious musical work, and the modular architecture makes future enhancements straightforward.

For developers interested in audio programming or terminal UI design, the codebase offers practical examples of real-time synthesis, event-driven architecture, and responsive terminal interfaces. The project proves that with careful design decisions and attention to user experience, even unconventional platforms can support sophisticated creative tools.
