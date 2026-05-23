# Weekly Planner

A local-first futuristic planner for focused weekly work, recurring tasks, helper notes, and audible/visual reminders.

Built to stay clean: no bloated project-management noise, no account system, no cloud dependency.

## Features

- Today, week, and month planning views
- Click any week or month day to open the 08:00-17:00 day overview
- One-off tasks with time, helper, notes, and reminders
- Recurring tasks with custom frequency or natural language such as `every weekday at 9am`
- Visual reminder popup with Done and Snooze controls
- Audible reminder support once sound is enabled
- Local SQLite storage
- Docker hosting for always-on local use
- Optional Windows desktop installer via Electron

## Run With Docker

```powershell
docker compose up --build -d
```

Open:

```text
http://localhost:8787
```

Data is stored in:

```text
./data/planner.db
```

Stop the container:

```powershell
docker compose down
```

## Windows Desktop App

The desktop version wraps the same planner in Electron. It runs its own embedded local server and stores data in the Windows app data folder.

Install dependencies:

```powershell
npm install
```

Run the desktop app in development:

```powershell
npm run desktop
```

Build a Windows installer:

```powershell
npm run dist:win
```

The installer will be created in:

```text
dist/
```

## GitHub EXE Build

This repo includes a GitHub Actions workflow:

```text
.github/workflows/build-windows-exe.yml
```

After pushing to `main`, or manually running the workflow, GitHub will:

- install Node 24
- run the test suite
- build the Windows installer
- upload the `.exe` as a workflow artifact

Download it from:

```text
GitHub repo -> Actions -> Build Windows EXE -> Artifacts
```

## Publish To A Public GitHub Repo

```powershell
git init
git add .
git commit -m "Initial weekly planner app"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/weekly-planner.git
git push -u origin main
```

Create the repo on GitHub as **Public** before adding the remote.

## Local Development

This app uses Node 24 built-in HTTP, test runner, and SQLite.

```powershell
node server/index.js
```

## Tests

```powershell
node --test server/__tests__/*.test.js
node server/__tests__/build-check.js
```

## Reminder Notes

Reminder popups and sound work while the app is open.

Browsers usually require one user interaction before sound can play, so click **Enable sound** once after opening the app.
