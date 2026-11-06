# Keen

A lightweight Windows desktop app for tracking daily work, estimating time spent, and reviewing a weekly summary.

## Overview

Keen helps you:

- Add tasks for a specific day
- Tag tasks by project or category
- Track minutes spent per task
- Set task status to to do, doing, done, or blocked
- Search, filter, edit, and reorder daily tasks
- Review weekly completion and time totals
- Copy a shareable summary for status updates

The app stores data locally on the machine in the user data directory, so it runs without a backend or account system.

## Features

- Daily task log with quick add workflow
- Smart task entry with project suggestions and flexible time formats
- Task status controls, inline editing, and persistent drag-and-drop ordering
- Delete undo, recurring tasks, and carry-over from yesterday
- Optional project/tag metadata
- Time tracking in minutes
- Weekly overview with completion rate, daily progress, project totals, and task activity history
- Persistent task history for logging, completion, deletion, and restoration, including existing deleted tasks
- Copy or save weekly summaries as text files
- Keyboard shortcuts: `Ctrl+K` for navigation, `/` for search, `T` for today, and arrow keys to change dates
- Responsive layout with system-aware light and dark themes
- Local SQLite database for all saved data
- Desktop installer build for Windows using Electron

## Project structure

- `main.js` — Electron app startup, database setup, and one-time import of the old `tasks.json`
- `preload.js` — exposes safe renderer-to-main APIs
- `renderer/index.html` — accessible app shell and navigation
- `renderer/styles/` — design tokens, base styles, responsive layout, and components
- `renderer/app.js`, `state.js`, `views.js`, `utils.js` — renderer behavior and views
- `storage/` — SQLite schema and migrations (`db.js`), legacy JSON import (`migrate-json.js`), IPC handlers (`ipc.js`)
- `test/` — storage tests
- `package.json` — project metadata and build scripts
- `dist/` — generated Windows installer output after packaging

## Local data location

On Windows, the app stores data in:

`%APPDATA%\task-tracking-monitor\tracker.db`

This file contains all saved tasks and projects. To back it up, close the app and copy `tracker.db` (and any `tracker.db-wal` file beside it). Your old `tasks.json` is kept as `tasks.json.migrated` after the first launch.

## Development setup

### Prerequisites

- Node.js LTS
- npm

### Install dependencies

```bash
npm install
```

### Run the app in development mode

```bash
npm start
```

This launches the Electron desktop app without building an installer.

## Build the Windows installer

```bash
npm run dist
```

This packages the app as a Windows NSIS installer and places the output in the `dist` folder.

## Production notes

The current build is configured for Windows and produces an NSIS installer with desktop/start menu shortcuts enabled.

Windows may show an "Unknown publisher" warning when installing the app because the build is not code-signed. If prompted, select "More info" and then "Run anyway".

## Common workflow

1. Start the app with `npm start`
2. Add a task for the current day
3. Optionally add a project tag and estimated minutes
4. Choose a status, edit task details, or reorder tasks as work changes
5. Open Projects to organize work into colored folders, review project tasks, and archive or restore projects
6. Open the weekly view to review totals, copy a summary, or save it as a text file

## Troubleshooting

### App does not start

- Ensure Node.js is installed and `npm install` completed successfully
- Try restarting the terminal and running the app again
- Check whether any Electron or dependency installation errors appear in the console

### Data is missing

- Confirm the app is running under the same user account
- Check `%APPDATA%\task-tracking-monitor\` for the `tracker.db` file
- If needed, restore a backup copy of that file

## License

This project currently has no public license declared in `package.json`.

## Notes for contributors

If you plan to extend the app, the main areas to review are:

- database schema and migrations in `storage/db.js`
- UI logic and rendering flow in `renderer/index.html`
- packaging configuration in `package.json`

The app is intentionally simple and self-contained, which makes it easy to modify for personal productivity workflows.
