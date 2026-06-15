# GoldScope Windows EXE Packaging Guide

This document is a complete, beginner-friendly guide to package this project into:

1. a Windows app file (`GoldScope.exe`)
2. a Windows installer (`GoldScope-Setup-1.0.0.exe`)

The guide uses simple language and gives exact file references and commands.

---

## 0) Quick Goal and Output

After you finish all steps, you should have:

1. `frontend/dist/` (frontend build output)
2. `dist/GoldScope.exe` (main app file)
3. `dist/better_sqlite3.node` (SQLite support file)
4. `installer-output/GoldScope-Setup-1.0.0.exe` (installer)

---

## 1) Files You Need to Know (Complete Reference)

These are the main files used in this process:

1. `package.json` (root): build and packaging commands
2. `frontend/package.json`: frontend build command (`vite build`)
3. `backend/index.js`: server startup and settings load at app start
4. `backend/db/database.js`: SQLite database file location
5. `backend/routes/settings.js`: settings file location
6. `WINDOWS_EXE_PACKAGING_GUIDE.md`: this guide
7. `GoldScopeInstaller.iss`: installer script (you will create this)

---

## 2) Before You Start

You need:

1. Windows
2. Node.js (LTS recommended)
3. npm
4. Inno Setup 6+

Recommended:

1. Git
2. A clean test machine or VM for final testing

Check versions:

```powershell
node -v
npm -v
```

---

## 3) Step 1 - Build the Frontend

### What you do

Run from project root:

```powershell
npm --prefix frontend install
npm --prefix frontend run build
```

### Why this matters

Your backend serves files from `frontend/dist`. If this folder is missing, the app opens but the UI can be blank.

### Check

Confirm these exist:

1. `frontend/dist/index.html`
2. `frontend/dist/assets/`

---

## 4) Step 2 - Install pkg

### What you do

```powershell
npm install -g pkg
pkg --version
```

### Why this matters

`pkg` creates the Windows app file (`.exe`) from your Node backend.

---

## 5) Step 3 - Update Root package.json for Packaging

Update only the root `package.json` (not `frontend/package.json`).

Use this full content:

```json
{
  "name": "goldscope-dashboard",
  "version": "1.0.0",
  "description": "Fischer GOLDSCOPE SD - Gold Testing Dashboard & Reporting System",
  "main": "backend/index.js",
  "bin": "backend/index.js",
  "scripts": {
    "start": "node backend/index.js",
    "dev": "node --watch backend/index.js",
    "build:frontend": "npm --prefix frontend run build",
    "pkg:win": "pkg . --targets node18-win-x64 --output dist/GoldScope.exe",
    "pkg:copy-native": "powershell -NoProfile -Command \"Copy-Item .\\node_modules\\better-sqlite3\\build\\Release\\better_sqlite3.node .\\dist\\better_sqlite3.node -Force\"",
    "dist:win": "npm run build:frontend && npm run pkg:win && npm run pkg:copy-native"
  },
  "dependencies": {
    "better-sqlite3": "^12.10.0",
    "chokidar": "^3.6.0",
    "express": "^4.22.2",
    "ws": "^8.20.1"
  },
  "pkg": {
    "scripts": [
      "backend/**/*.js"
    ],
    "assets": [
      "frontend/dist/**/*",
      "backend/**/*.json"
    ]
  }
}
```

### Why this matters

1. `bin` points to backend entry file.
2. `pkg.scripts` tells pkg which backend files to include.
3. `pkg.assets` tells pkg which built frontend files to include.
4. `dist:win` gives one command for full build.

---

## 6) Step 4 - Fix File Paths for EXE Mode (Most Important)

If you skip this step, app data may not save correctly on client systems.

### Simple rule

1. In local development: save data in project folder.
2. In EXE mode: save data in a `data` folder next to the EXE.

This is controlled by checking:

```js
typeof process.pkg !== 'undefined'
```

### 4A) Update backend/db/database.js

Goal:

1. Keep DB in `data/goldscope-data.db`
2. Create `data` folder if missing

Use this pattern near the top:

```js
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const IS_PKG = typeof process.pkg !== 'undefined';
const APP_BASE_DIR = IS_PKG ? path.dirname(process.execPath) : path.join(__dirname, '..', '..');
const DATA_DIR = path.join(APP_BASE_DIR, 'data');
const DB_PATH = path.join(DATA_DIR, 'goldscope-data.db');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}
```

Call `ensureDataDir()` before opening the database.

### 4B) Update backend/routes/settings.js

Goal:

1. Keep settings in `data/settings.json`
2. Use same logic as DB path

Use this pattern:

```js
const IS_PKG = typeof process.pkg !== 'undefined';
const APP_BASE_DIR = IS_PKG ? path.dirname(process.execPath) : path.join(__dirname, '..', '..');
const DATA_DIR = path.join(APP_BASE_DIR, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');
```

### 4C) Update backend/index.js

Goal:

1. At startup, read settings from the same `data/settings.json` location.
2. Do not read settings from old repo-only path when running EXE.

Tip:

Use the same `IS_PKG`, `APP_BASE_DIR`, `DATA_DIR`, and `SETTINGS_PATH` logic for startup read.

---

## 7) Step 5 - Install Dependencies

Run from project root:

```powershell
npm install
npm --prefix frontend install
```

Why:

1. Root install gets backend dependencies.
2. Frontend install gets build dependencies.

---

## 8) Step 6 - Build GoldScope.exe

### Main command

```powershell
npm run dist:win
```

### Expected output

1. `dist/GoldScope.exe`
2. `dist/better_sqlite3.node`

### Manual fallback

```powershell
pkg . --targets node18-win-x64 --output dist/GoldScope.exe
Copy-Item .\node_modules\better-sqlite3\build\Release\better_sqlite3.node .\dist\better_sqlite3.node -Force
```

---

## 9) Step 7 - Confirm SQLite Support File Is Beside EXE

Run:

```powershell
Get-ChildItem .\dist
```

Make sure both are present:

1. `GoldScope.exe`
2. `better_sqlite3.node`

Why:

The app needs this file to open SQLite database.

---

## 10) Step 8 - Test the EXE Before Building Installer

Run:

```powershell
.\dist\GoldScope.exe
```

Check in browser:

1. `http://127.0.0.1:3000`
2. `http://127.0.0.1:3000/api/health`

Test checklist:

1. UI loads
2. Health API returns `ok`
3. Settings can be changed and saved
4. `dist/data/` appears after first run
5. Restart app and confirm settings/data stay
6. `.exp` file watch still works

---

## 11) Step 9 - Build Installer with Inno Setup

Create `GoldScopeInstaller.iss` in project root.

Paste this full script:

```iss
; GoldScope Installer
; Requires Inno Setup 6+

[Setup]
AppId={{A7A0B6F1-0C53-4D4A-8A29-6E3D4E9D1A01}
AppName=GoldScope Dashboard
AppVersion=1.0.0
AppPublisher=Your Company
DefaultDirName={autopf}\GoldScope Dashboard
DefaultGroupName=GoldScope Dashboard
DisableProgramGroupPage=yes
OutputDir=installer-output
OutputBaseFilename=GoldScope-Setup-1.0.0
Compression=lzma
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional icons:"; Flags: unchecked

[Files]
Source: "dist\GoldScope.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\better_sqlite3.node"; DestDir: "{app}"; Flags: ignoreversion

[Dirs]
Name: "{app}\data"

[Icons]
Name: "{group}\GoldScope Dashboard"; Filename: "{app}\GoldScope.exe"
Name: "{autodesktop}\GoldScope Dashboard"; Filename: "{app}\GoldScope.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\GoldScope.exe"; Description: "Launch GoldScope Dashboard"; Flags: nowait postinstall skipifsilent
```

Build installer:

1. Open Inno Setup
2. Open `GoldScopeInstaller.iss`
3. Click Compile
4. Get result in `installer-output/`

---

## 12) Step 10 - Final Client Delivery Checklist

Before sharing with client, confirm:

1. Installer opens and installs without error.
2. App starts from shortcut.
3. Dashboard page opens.
4. Settings save correctly.
5. Data stays after restart.
6. `better_sqlite3.node` exists beside installed EXE.
7. Clean machine test passed.
8. App version in installer is correct.
9. You documented where data is stored.
10. You documented backup method.

---

## 13) Common Errors and Simple Fixes

| Error | Meaning | Fix |
|---|---|---|
| `Cannot find module 'better-sqlite3'` | App cannot load SQLite support file | Copy `better_sqlite3.node` beside EXE |
| `Could not locate the bindings file` | SQLite support file is missing or in wrong place | Check `dist/better_sqlite3.node` exists with exact name |
| `SQLITE_CANTOPEN` | App cannot open DB file | Ensure Step 4 path changes are done and `data` folder exists |
| Settings do not save | Wrong settings path | Ensure `settings.json` path points to `data/settings.json` |
| Blank page or 404 | Frontend build missing | Run frontend build again and check `frontend/dist/` |
| `EADDRINUSE: 3000` | Port 3000 already used | Stop old process or set another `PORT` for test |
| Watcher not reading `.exp` | Wrong export file path or no permission | Update path in settings and verify file access |

---

## 14) All Commands in One Order

Run from project root:

```powershell
npm --prefix frontend install
npm --prefix frontend run build
npm install -g pkg
npm install
npm run dist:win
.\dist\GoldScope.exe
```

Then compile installer using Inno Setup.

---

## 15) Quick Handover Notes

Share these with your team:

1. This guide
2. App version
3. Installer file
4. Install location
5. Data folder location (`<install-folder>\data`)
6. Backup and restore steps

---

## 16) One-Page Sanity Test (After Install)

Pass condition:

1. App launches
2. UI is visible
3. Save settings works
4. Restart keeps settings

If all 4 pass, release is ready.

---

## 17) Step-to-File Reference Matrix

Use this table when you want a quick answer to: what to edit, and what to run.

| Step | Main file or folder | What you change or check | Command to run |
|---|---|---|---|
| Step 1 | `frontend/` | Build frontend files into `frontend/dist/` | `npm --prefix frontend install` then `npm --prefix frontend run build` |
| Step 2 | Global npm tools | Install packaging tool | `npm install -g pkg` |
| Step 3 | `package.json` | Add packaging scripts and pkg config | No direct run required after save |
| Step 4A | `backend/db/database.js` | Set DB path to `data/goldscope-data.db` in both local and EXE mode | No direct run required after save |
| Step 4B | `backend/routes/settings.js` | Set settings path to `data/settings.json` in both local and EXE mode | No direct run required after save |
| Step 4C | `backend/index.js` | Read startup settings from same `data/settings.json` path | No direct run required after save |
| Step 5 | Root and frontend dependencies | Install all packages | `npm install` and `npm --prefix frontend install` |
| Step 6 | `dist/` | Build Windows app file | `npm run dist:win` |
| Step 7 | `dist/` | Confirm sqlite support file is beside EXE | `Get-ChildItem .\dist` |
| Step 8 | `dist/GoldScope.exe` | Run and test app before installer | `.\dist\GoldScope.exe` |
| Step 9 | `GoldScopeInstaller.iss` | Build installer | Compile in Inno Setup |
| Step 10 | Installed app + data folder | Final delivery checks | Manual checklist |
