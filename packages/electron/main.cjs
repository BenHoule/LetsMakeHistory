/**
 * Let's Make History — Electron main process
 *
 * Behaviour:
 *  1. Forks the Express server as a child process via utilityProcess.fork()
 *     (the Electron-native API for spawning Node.js children; supports ESM).
 *  2. Waits for the server to signal "ready" over IPC.
 *  3. Opens the default web browser to the local server.
 *  4. Creates a system-tray icon so the host can share the player link or quit.
 */

'use strict';

const { app, Tray, Menu, shell, dialog, clipboard, nativeImage, utilityProcess } = require('electron');
const path   = require('path');
const http   = require('http');
const os     = require('os');

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT  = Number(process.env.PORT ?? 3000);
const isDev = !app.isPackaged;

// Paths differ between dev and packaged builds.
const SERVER_ENTRY = isDev
  ? path.join(__dirname, '..', 'server', 'src', 'index.ts')   // dev: run via tsx
  : path.join(process.resourcesPath, 'server', 'dist', 'index.cjs'); // packaged: esbuild CJS bundle

const STATIC_DIR = isDev
  ? path.join(__dirname, '..', 'client', 'build')
  : path.join(process.resourcesPath, 'client-build');

const DB_PATH = path.join(app.getPath('userData'), 'lmhistory.db');

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getLocalIP () {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return '127.0.0.1';
}

function waitForServer (retries = 60) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http.get(`http://127.0.0.1:${PORT}/api/v1/sessions`, res => {
        res.resume();
        resolve();
      }).on('error', () => {
        if (--retries <= 0) return reject(new Error('Server did not start in time.'));
        setTimeout(attempt, 500);
      });
    };
    attempt();
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
let tray       = null;
let serverProc = null;
let serverStderr = '';  // collect stderr for error reporting

app.on('before-quit', () => {
  if (serverProc) { try { serverProc.kill(); } catch {} }
});

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

app.whenReady().then(async () => {
  const env = {
    ...process.env,
    PORT:       String(PORT),
    DB_PATH,
    STATIC_DIR,
  };

  // ── Start the server ──────────────────────────────────────────────────────
  if (isDev) {
    // Development: run TypeScript directly via tsx
    const { spawn } = require('child_process');
    serverProc = spawn(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['tsx', SERVER_ENTRY],
      { env, stdio: 'pipe', cwd: path.join(__dirname, '..', 'server') }
    );
    if (serverProc.stderr) serverProc.stderr.on('data', d => { serverStderr += d.toString(); });
    if (serverProc.stdout) serverProc.stdout.on('data', d => process.stdout.write(d));
  } else {
    // Production: use utilityProcess.fork() -- Electron API for
    // spawning Node.js children with full ESM support.
    serverProc = utilityProcess.fork(SERVER_ENTRY, [], {
      env,
      stdio: 'pipe',
    });
    if (serverProc.stderr) serverProc.stderr.on('data', d => { serverStderr += d.toString(); });
    if (serverProc.stdout) serverProc.stdout.on('data', d => process.stdout.write(d));
  }

  serverProc.on('exit', code => {
    console.log(`Server process exited with code ${code}`);
  });

  // ── Wait for server to be ready ───────────────────────────────────────────
  try {
    await waitForServer();
  } catch (e) {
    const detail = serverStderr
      ? `Server error output:\n${serverStderr.slice(0, 2000)}`
      : 'No error output captured. Check that port ' + PORT + ' is not already in use.';
    dialog.showErrorBox("Let's Make History — Server Failed to Start", detail);
    app.quit();
    return;
  }

  const localIP   = getLocalIP();
  const playerURL = `http://${localIP}:${PORT}/lobby`;
  const gmURL     = `http://localhost:${PORT}`;

  // ── Tray icon ─────────────────────────────────────────────────────────────
  const iconPath = path.join(__dirname, 'icons', 'icon.png');
  const icon = require('fs').existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();

  tray = new Tray(icon);
  tray.setToolTip("Let's Make History — Server Running");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Let's Make History", enabled: false },
    { label: `Listening on port ${PORT}`, enabled: false },
    { type: 'separator' },
    { label: 'Open GM Dashboard',       click: () => shell.openExternal(gmURL) },
    { label: 'Open Player Lobby',       click: () => shell.openExternal(playerURL) },
    { type: 'separator' },
    { label: 'Copy Player Link (LAN)',  click: () => clipboard.writeText(playerURL) },
    { label: `Your LAN IP: ${localIP}`, enabled: false },
    { type: 'separator' },
    { label: 'Quit',                    click: () => app.quit() },
  ]));
  tray.on('click', () => tray.popUpContextMenu());

  // ── Open browser ─────────────────────────────────────────────────────────
  await shell.openExternal(gmURL);

  // ── Startup dialog ───────────────────────────────────────────────────────
  dialog.showMessageBox({
    type:    'info',
    title:   "Let's Make History — Server Started",
    message: 'The server is running.',
    detail:  [
      `GM Dashboard (this machine):\n  ${gmURL}`,
      '',
      `Player join link (share with players on your network):\n  ${playerURL}`,
      '',
      'Right-click the tray icon to copy the link or quit.',
    ].join('\n'),
    buttons: ['OK'],
  });
});

// Keep the app alive even if all windows are closed (tray-only app).
app.on('window-all-closed', e => e.preventDefault?.());
