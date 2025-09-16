# Repository Guidelines

## Project Structure & Module Organization
`src/main.js` boots the terminal editor by wiring UI, audio, and persistence layers. UI widgets live in `src/ui/`, sequencing and playback utilities in `src/audio/`, and domain models plus validation in `src/data/`; share reusable helpers through `src/utils/`. Runtime defaults stay in `config/defaults.json`, saved measures populate `measures/`, and autosaves land in `sessions/` for recovery. Product context and workflow rules are documented in `specs/spec.md`—review it before changing navigation or parameter handling.

## Build, Test, and Development Commands
Install dependencies once with `npm install`. Run the stable CLI via `npm run start`, or use `npm run dev` to launch with `nodemon` watching `src/` for restarts. Direct calls like `node src/main.js` help when debugging arguments; after `npm link`, the binary is also available as `measure-editor` for integration testing.

## Coding Style & Naming Conventions
Stick to modern ES modules (Node >=16). Use two-space indentation, semicolons, and trailing commas in multi-line literals to match the current codebase. Keep files `kebab-case`, classes `PascalCase`, and functions or instances `camelCase`. Group related helpers into focused modules and export names explicitly rather than relying on default exports. Prefer template literals over string concatenation for user-facing messages.

## Testing Guidelines
There is no automated test harness yet, so exercise interactive flows manually. Run `npm run dev`, tweak parameters, toggle playback, save, reload, and confirm UI feedback as described in `specs/spec.md`. When persistence changes, inspect the new file under `measures/` and reopen it to verify serialization; for session changes, confirm timestamps and reasons in the latest `sessions/*.json`. Capture notes from this manual pass in your pull request so reviewers can replay it quickly.

## Commit & Pull Request Guidelines
Follow the conventional commit format used in history (`type(scope): summary`), e.g. `fix(audio): smooth buffer refill`. Keep commits narrowly scoped and include only related assets. Pull requests should outline the user-facing impact, reference any linked issue, and attach screenshots or terminal recordings when UI behavior moves. List the manual validation steps you covered and call out new configuration requirements to shorten reviewer setup time.

## Configuration & Session Tips
Adjust defaults strictly through `config/defaults.json` so deployments stay reproducible. Clean stale autosaves only after verifying they are not needed for regression triage. If audio glitches appear, confirm local speaker permissions and sample-rate support before refactoring engine code.
