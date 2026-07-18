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
const https  = require('https');
const os     = require('os');
const fs     = require('fs');

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
const INVITE_CONFIG_PATH = path.join(app.getPath('userData'), 'invite-settings.json');

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

function normalizeBaseUrl (raw, fallbackPort = PORT) {
  const text = String(raw ?? '').trim();
  if (!text) return null;

  const inferredScheme = fallbackPort === 443 ? 'https' : 'http';
  const candidate = /^https?:\/\//i.test(text) ? text : `${inferredScheme}://${text}`;
  try {
    const url = new URL(candidate);
    const protocol = url.protocol === 'https:' ? 'https:' : 'http:';
    const host = url.hostname;
    if (!host) return null;

    const resolvedPort = url.port || (protocol === 'http:' && fallbackPort ? String(fallbackPort) : '');
    return `${protocol}//${host}${resolvedPort ? `:${resolvedPort}` : ''}`;
  } catch {
    return null;
  }
}

function writeDefaultInviteConfig () {
  const template = {
    _instructions: [
      'Set publicBaseUrl to your public host/domain so the tray can copy an internet invite link.',
      'Examples: https://your-domain.example OR your-public-ip:3000',
      'If publicBaseUrl is empty and autoDetectPublicIp is true, the app will try to detect your public IP automatically.',
      'After editing this file, restart the app to reload settings.',
    ],
    publicBaseUrl: '',
    autoDetectPublicIp: true,
    publicIpServiceUrl: 'https://api.ipify.org?format=json',
    publicPort: PORT,
  };

  fs.writeFileSync(INVITE_CONFIG_PATH, JSON.stringify(template, null, 2));
}

function getInviteConfigCandidatePaths () {
  const appData = process.env.APPDATA;
  const programData = process.env.ProgramData;

  return [
    ...(programData
      ? [path.join(programData, 'LetsMakeHistory', 'invite-settings.json')]
      : []),
    INVITE_CONFIG_PATH,
    ...(appData
      ? [
          path.join(appData, 'Let\'s Make History', 'invite-settings.json'),
          path.join(appData, 'lmhistory-app', 'invite-settings.json'),
        ]
      : []),
  ];
}

function loadInviteConfig () {
  const candidatePaths = getInviteConfigCandidatePaths();
  // Prefer the first file that both exists AND has a non-empty publicBaseUrl.
  // This prevents a blank default config (e.g. the app's own userData file)
  // from shadowing a correctly configured ProgramData or AppData file.
  const existingPath =
    candidatePaths.find(p => {
      if (!fs.existsSync(p)) return false;
      try {
        const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
        return typeof parsed?.publicBaseUrl === 'string' && parsed.publicBaseUrl.trim() !== '';
      } catch { return false; }
    }) ??
    candidatePaths.find(configPath => fs.existsSync(configPath));

  if (!existingPath) {
    writeDefaultInviteConfig();
  }

  try {
    const resolvedPath = existingPath ?? INVITE_CONFIG_PATH;
    const parsed = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
    const portCandidate = Number(parsed?.publicPort);
    const publicPort = Number.isInteger(portCandidate) && portCandidate > 0 && portCandidate <= 65535
      ? portCandidate
      : PORT;

    return {
      publicBaseUrl: typeof parsed?.publicBaseUrl === 'string' ? parsed.publicBaseUrl.trim() : '',
      autoDetectPublicIp: parsed?.autoDetectPublicIp !== false,
      publicIpServiceUrl:
        typeof parsed?.publicIpServiceUrl === 'string' && parsed.publicIpServiceUrl.trim()
          ? parsed.publicIpServiceUrl.trim()
          : 'https://api.ipify.org?format=json',
      publicPort,
    };
  } catch {
    writeDefaultInviteConfig();
    return {
      publicBaseUrl: '',
      autoDetectPublicIp: true,
      publicIpServiceUrl: 'https://api.ipify.org?format=json',
      publicPort: PORT,
    };
  }
}

function detectPublicIp (serviceUrl) {
  return new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    try {
      const req = https.get(serviceUrl, {
        timeout: 5000,
        headers: { 'User-Agent': 'lets-make-history' },
      }, res => {
        let data = '';
        res.on('data', chunk => { data += chunk.toString(); });
        res.on('end', () => {
          if ((res.statusCode ?? 500) >= 400) return finish(null);

          const trimmed = data.trim();
          if (!trimmed) return finish(null);

          try {
            const asJson = JSON.parse(trimmed);
            const candidate = String(asJson?.ip ?? '').trim();
            return finish(candidate || null);
          } catch {
            return finish(trimmed);
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        finish(null);
      });
      req.on('error', () => finish(null));
    } catch {
      finish(null);
    }
  });
}

async function resolveInternetBaseUrl (inviteConfig) {
  const fromConfig = normalizeBaseUrl(inviteConfig.publicBaseUrl, inviteConfig.publicPort);
  if (fromConfig) return { baseUrl: fromConfig, source: 'config' };

  const fromEnv = normalizeBaseUrl(process.env.PUBLIC_BASE_URL ?? '', inviteConfig.publicPort);
  if (fromEnv) return { baseUrl: fromEnv, source: 'env' };

  if (inviteConfig.autoDetectPublicIp) {
    const detectedIp = await detectPublicIp(inviteConfig.publicIpServiceUrl);
    if (detectedIp) {
      const fromAutoIp = normalizeBaseUrl(`http://${detectedIp}`, inviteConfig.publicPort);
      if (fromAutoIp) return { baseUrl: fromAutoIp, source: 'auto-ip' };
    }
  }

  return { baseUrl: null, source: 'none' };
}

async function openInviteSettingsFile () {
  const candidatePaths = getInviteConfigCandidatePaths();
  const existingPath = candidatePaths.find(configPath => fs.existsSync(configPath)) ?? INVITE_CONFIG_PATH;
  if (!fs.existsSync(existingPath)) {
    writeDefaultInviteConfig();
  }
  const error = await shell.openPath(existingPath);
  if (error) {
    dialog.showErrorBox('Unable to open invite settings', error);
  }
}

function showInviteSetupInstructions (internetPlayerURL) {
  const detailLines = [
    'Internet Invite Setup',
    '',
    '1) Right-click the tray icon and choose "Open Invite Settings File".',
    '2) Set publicBaseUrl in invite-settings.json.',
    '3) Restart the app.',
    '4) Use "Copy Player Link (Internet)" from the tray menu.',
    '',
    `Invite settings file:\n  ${INVITE_CONFIG_PATH}`,
    '',
    'Router/firewall steps:',
    `- Forward TCP port ${PORT} to this machine`,
    `- Allow inbound TCP ${PORT} in firewall`,
    '',
    internetPlayerURL
      ? `Current internet invite:\n  ${internetPlayerURL}`
      : 'Current internet invite: not available yet (configure settings or ensure public IP detection can reach the internet).',
  ];

  dialog.showMessageBox({
    type: 'info',
    title: "Let's Make History — Invite Setup",
    message: 'Configure internet invites',
    detail: detailLines.join('\n'),
    buttons: ['OK'],
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
  const inviteConfig = loadInviteConfig();
  const { baseUrl: internetBaseUrl, source: internetSource } = await resolveInternetBaseUrl(inviteConfig);

  const env = {
    ...process.env,
    PORT:       String(PORT),
    DB_PATH,
    STATIC_DIR,
    PUBLIC_BASE_URL: inviteConfig.publicBaseUrl,
    PUBLIC_PORT: String(inviteConfig.publicPort),
    INTERNET_BASE_URL: internetBaseUrl ?? '',
    INTERNET_INVITE_SOURCE: internetSource,
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
  const internetPlayerURL = internetBaseUrl ? `${internetBaseUrl}/lobby` : null;

  // ── Tray icon ─────────────────────────────────────────────────────────────
  const iconPath = path.join(__dirname, 'icons', 'icon.png');
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();

  const trayMenuItems = [
    { label: "Let's Make History", enabled: false },
    { label: `Listening on port ${PORT}`, enabled: false },
    { type: 'separator' },
    { label: 'Open GM Dashboard',       click: () => shell.openExternal(gmURL) },
    { label: 'Open Player Lobby',       click: () => shell.openExternal(playerURL) },
    { type: 'separator' },
    { label: 'Copy Player Link (LAN)',  click: () => clipboard.writeText(playerURL) },
    ...(internetPlayerURL
      ? [{ label: 'Copy Player Link (Internet)', click: () => clipboard.writeText(internetPlayerURL) }]
      : [{ label: 'Copy Player Link (Internet)', enabled: false }]),
    { label: 'Show Invite Setup Instructions', click: () => showInviteSetupInstructions(internetPlayerURL) },
    { label: 'Open Invite Settings File', click: () => { openInviteSettingsFile(); } },
    { label: 'Copy Invite Settings File Path', click: () => clipboard.writeText(INVITE_CONFIG_PATH) },
    { label: `Your LAN IP: ${localIP}`, enabled: false },
    ...(internetBaseUrl
      ? [{ label: `Internet Base URL: ${internetBaseUrl}`, enabled: false }]
      : [{ label: 'Internet Base URL: not configured', enabled: false }]),
    { label: `Internet Link Source: ${internetSource}`, enabled: false },
    { type: 'separator' },
    { label: 'Quit',                    click: () => app.quit() },
  ];

  tray = new Tray(icon);
  tray.setToolTip("Let's Make History — Server Running");
  tray.setContextMenu(Menu.buildFromTemplate(trayMenuItems));
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
      ...(internetPlayerURL
        ? ['', `Player join link (internet):\n  ${internetPlayerURL}`]
        : []),
      ...(internetPlayerURL
        ? []
        : ['', 'Internet invite link is not configured yet. Use tray menu -> Open Invite Settings File.']),
      '',
      'Right-click the tray icon to copy the link or quit.',
    ].join('\n'),
    buttons: ['OK'],
  });
});

// Keep the app alive even if all windows are closed (tray-only app).
app.on('window-all-closed', e => e.preventDefault?.());
