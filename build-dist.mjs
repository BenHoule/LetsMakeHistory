#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = __dirname;
const TARGET = process.argv[2] ?? '';

function commandName(base) {
  return process.platform === 'win32' ? `${base}.cmd` : base;
}

function quoteArg(arg) {
  if (/^[a-zA-Z0-9_./:=+-]+$/.test(arg)) {
    return arg;
  }
  return `"${arg.replace(/"/g, '\\"')}"`;
}

function run(cmd, args, options = {}) {
  const commandLine = [quoteArg(cmd), ...args.map(quoteArg)].join(' ');
  const result = spawnSync(commandLine, [], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: process.env,
    shell: true,
    ...options,
  });

  if (result.error) {
    console.error(`ERROR: Failed to run ${cmd}`);
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function logStep(step, message) {
  console.log(`[${step}/5] ${message}`);
}

function runPnpm(args, options = {}) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath && npmExecPath.toLowerCase().includes('pnpm')) {
    run(process.execPath, [npmExecPath, ...args], options);
    return;
  }
  run(commandName('pnpm'), args, options);
}

console.log('');
console.log('==========================================');
console.log("  Let's Make History - Distribution Build");
console.log('==========================================');
console.log('');

logStep(1, 'Installing workspace dependencies...');
runPnpm(['install', '--frozen-lockfile']);

logStep(2, 'Building SvelteKit client (adapter-static)...');
const clientDir = path.join(REPO_ROOT, 'packages', 'client');
const clientBuildEnv = {
  ...process.env,
  NODE_ENV: 'production',
  PUBLIC_API_URL: process.env.PUBLIC_API_URL ?? 'http://localhost:3001',
  PUBLIC_WS_URL: process.env.PUBLIC_WS_URL ?? 'http://localhost:3001',
};
runPnpm(['run', 'build'], {
  cwd: clientDir,
  env: clientBuildEnv,
});

const clientBuildDir = path.join(clientDir, 'build');
if (!existsSync(clientBuildDir)) {
  console.error(`ERROR: Client build output not found at ${clientBuildDir}`);
  process.exit(1);
}
console.log('  -> Client built to packages/client/build/');

logStep(3, 'Bundling server with esbuild...');
const serverDir = path.join(REPO_ROOT, 'packages', 'server');
runPnpm(['run', 'build'], { cwd: serverDir });
console.log('  -> Server bundled to packages/server/dist/index.cjs');

const electronDir = path.join(REPO_ROOT, 'packages', 'electron');
const electronNodeModules = path.join(electronDir, 'node_modules');
if (existsSync(electronNodeModules)) {
  rmSync(electronNodeModules, { recursive: true, force: true });
}
run(commandName('npm'), ['install', '--no-package-lock'], { cwd: electronDir });

const electronPkgPath = path.join(electronDir, 'node_modules', 'electron', 'package.json');
if (!existsSync(electronPkgPath)) {
  console.error('ERROR: Electron was not installed in packages/electron/node_modules.');
  process.exit(1);
}

const electronVersion = JSON.parse(readFileSync(electronPkgPath, 'utf8')).version;
logStep(4, `Rebuilding better-sqlite3 for Electron ${electronVersion}...`);
run(commandName('npx'), [
  '--yes',
  '@electron/rebuild',
  '--version',
  electronVersion,
  '--module-dir',
  'dist/node_modules/better-sqlite3',
  '--which-module',
  'better-sqlite3',
], { cwd: serverDir });

logStep(5, 'Packaging with electron-builder...');
const isWsl2 =
  process.platform === 'linux' &&
  (os.release().toLowerCase().includes('microsoft') || Boolean(process.env.WSL_DISTRO_NAME));

let builderFlags = [];
switch (TARGET) {
  case '--win': {
    if (isWsl2) {
      console.log('INFO: WSL2 detected - using --win --dir to skip Wine/NSIS.');
      builderFlags = ['--win', '--dir'];
    } else {
      builderFlags = ['--win'];
    }
    break;
  }
  case '--win-dir':
    builderFlags = ['--win', '--dir'];
    break;
  case '--mac':
    builderFlags = ['--mac'];
    break;
  case '--linux':
    builderFlags = ['--linux'];
    break;
  default:
    builderFlags = [];
}

const electronPackageJson = JSON.parse(
  readFileSync(path.join(electronDir, 'package.json'), 'utf8'),
);

const builderConfig = {
  ...(electronPackageJson.build ?? {}),
  directories: {
    ...(electronPackageJson.build?.directories ?? {}),
    output: path.join(REPO_ROOT, 'dist'),
  },
  extraResources: [
    {
      from: path.join(REPO_ROOT, 'packages', 'server'),
      to: 'server',
      filter: ['**/*', '!src/**', '!node_modules/.cache/**', '!**/*.map'],
    },
    {
      from: path.join(REPO_ROOT, 'packages', 'client', 'build'),
      to: 'client-build',
    },
  ],
};

const tempConfigPath = path.join(REPO_ROOT, '.electron-builder.config.json');
writeFileSync(tempConfigPath, JSON.stringify(builderConfig, null, 2));

try {
  const electronBuilderCliPath = path.join(
    electronDir,
    'node_modules',
    'electron-builder',
    'cli.js',
  );

  if (!existsSync(electronBuilderCliPath)) {
    console.error('ERROR: electron-builder is not installed.');
    process.exit(1);
  }

  run(process.execPath, [electronBuilderCliPath, ...builderFlags, '--config', tempConfigPath], {
    cwd: electronDir,
  });
} finally {
  if (existsSync(tempConfigPath)) {
    rmSync(tempConfigPath, { force: true });
  }
}

console.log('');
console.log('==========================================');
console.log('  Build complete! Output -> dist/');
console.log('==========================================');
console.log('');

const distDir = path.join(REPO_ROOT, 'dist');
if (existsSync(distDir)) {
  const entries = readdirSync(distDir);
  if (entries.length === 0) {
    console.log('dist/ is empty');
  } else {
    for (const entry of entries) {
      console.log(entry);
    }
  }
}