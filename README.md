# Interactive Measure Editor

Terminal-based sequencer for sketching four-on-the-floor ideas without leaving the shell. The app renders a full-width piano roll, streams a warm synthesized loop, and lets you tweak tempo, swing, key, and note data from the keyboard in real time.

## Features
- **Instant feedback:** Sample-accurate playback with a continuously rendered loop buffer.
- **Complete note control:** Add, delete, tie, or inline-edit notes at any step resolution.
- **Parameter dashboard:** Tempo, swing, loop length, key/scale, duration, and channel status all surface in the parameter panel.
- **History + undo:** Every edit is logged; `Ctrl+Z / Ctrl+Y` hop backwards or forwards through the stack.
- **Persistence:** Save measures to `measures/`, recover autosaves from `sessions/`, or relaunch with `npm run dev` to keep iterating.

## Requirements
- Node.js ≥ 16
- Audio output the `speaker` package can access (macOS users may need to grant terminal audio permissions)
- A terminal that supports 256 colors for the piano-roll gradient

## Installation
```bash
git clone <repo-url>
cd beats
npm install
```

Optional: symlink the CLI so you can launch the editor with `measure-editor` from any directory.

```bash
npm link
```

## Running the Editor
- `npm run start` – run the stable build (no file watching)
- `npm run dev` – run with `nodemon`, ideal while editing the source
- `node src/main.js` – invoke directly; accepts future CLI flags
- `measure-editor` – if you ran `npm link`

Measures save to `measures/`; recovery snapshots land in `sessions/` with timestamps so you can roll back if the terminal dies.

## Keyboard Reference

### Transport & App
- `Space` – Toggle playback
- `Ctrl+S`, `Ctrl+Shift+S`, or `F5` – Save current measure
- `Ctrl+O`, `Ctrl+L`, or `F6` – Load a measure
- `Ctrl+N` – Start a fresh measure
- `Ctrl+Z` / `Ctrl+Y` – Undo / Redo
- `Ctrl+V` – Paste clipboard block
- `Ctrl+H` – Toggle history overlay
- `H` – Toggle the inline help pages
- `Q` or `Ctrl+C` – Quit

### Navigation & Selection
- `← / →` – Move the play cursor by the current grid size
- `↑ / ↓` – Switch channels
- `[` / `]` – Jump to loop start / loop end (when not reading help)
- `Enter` – Toggle inline edit mode on the note at the cursor
- `Esc` – Cancel copy selection or close edit mode from copy workflows

### Notes & Editing
- `P` – Place a note (replaces existing note at the step)
- `Delete`, `Backspace`, or `U` – Remove the note at the cursor
- `A–G` – Snap the note at the cursor to a scale degree
- `+ / -` – Adjust pitch; when edit mode is active the highlighted note moves, otherwise the “Next Note” preview shifts
- `D` / `Shift+D` – Cycle note duration up / down (affects edit-mode note if active)
- `I` – Tie the note at the cursor to the next matching pitch
- `C` – Toggle copy mode (mark start with `Enter`, move, press `Enter` again to capture)

### Parameters
- `T` / `Shift+T` – Tempo ±5 BPM
- `W` – Toggle swing
- `L` – Cycle loop length (16/32/64/128/256 steps)
- `R` / `Shift+R` – Warmth ±10%
- `K` / `Shift+K` – Cycle key forward / backward
- `S` / `Shift+S` – Cycle scale forward / backward
- `D` / `Shift+D` – Duration grid (also doubles for note edit)
- `Z` / `Shift+Z` – Cycle quantization grid
- `M` – Toggle mute for the current channel

## Data Layout
- `config/defaults.json` – Runtime defaults (tempo, loop length, key, etc.)
- `measures/` – Saved arrangements (`.json`)
- `sessions/` – Autosave snapshots keyed by ISO timestamp

## Contributing Notes
- Use two-space indentation, ES modules, and explicit exports.
- Keep runtime defaults in `config/defaults.json`; avoid hardcoding in the UI.
- Manual validation is the norm—exercise the flows listed above after modifying audio, persistence, or input logic.

For deeper architectural context, browse `specs/spec.md`, which outlines the intended audio pipeline, UI contracts, and domain model in more detail.

