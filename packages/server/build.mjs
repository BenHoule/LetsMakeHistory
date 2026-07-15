/**
 * Production build script for the LMH server.
 *
 * Bundles ALL JavaScript dependencies (express, socket.io, etc.) into a single
 * dist/index.js using esbuild.  Only better-sqlite3 is kept external because it
 * contains a native (.node) binary that cannot be bundled.
 *
 * After bundling, better-sqlite3 and its loader (node-gyp-build) are copied into
 * dist/node_modules/ with pnpm symlinks fully resolved, so electron-builder can
 * copy real files (not broken symlinks) into the packaged app and can rebuild the
 * native module for the correct Electron ABI.
 */

import { build } from 'esbuild';
import { cpSync, mkdirSync, realpathSync, existsSync, readdirSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── 1. Bundle server TypeScript ───────────────────────────────────────────────
await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'dist/index.cjs',


  // Bundle everything EXCEPT the native module (cannot be bundled).
  external: ['better-sqlite3'],

  // Redirect workspace package imports to their TypeScript source files so they
  // are also bundled in (avoids pnpm symlink issues for workspace deps too).
  alias: {
    '@lmh/types': path.join(__dirname, '../../packages/types/src/index.ts'),
    '@lmh/rules': path.join(__dirname, '../../packages/rules/index.ts'),
  },
});

// ── 2. Copy SQL migration files ───────────────────────────────────────────────
mkdirSync('dist/db/migrations', { recursive: true });
cpSync('src/db/migrations', 'dist/db/migrations', { recursive: true });

// ── 3. Copy native deps with pnpm symlinks resolved ───────────────────────────
// better-sqlite3 loads its .node binary via the 'bindings' package; both must
// be present as real (non-symlink) directories so electron-builder can copy them
// and rebuild the native module for the correct Electron ABI.
//
// pnpm may hoist packages to the root node_modules OR keep them only in the
// .pnpm virtual store.  We search both locations.
const MONOREPO_ROOT = path.join(__dirname, '../..');

function resolvePackageDir(packageName) {
  // 1. Try the root node_modules symlink (hoisted packages)
  const hoisted = path.join(MONOREPO_ROOT, 'node_modules', packageName);
  if (existsSync(hoisted)) {
    try { return realpathSync(hoisted); } catch {}
  }
  // 2. Search the .pnpm store directly (e.g. bindings@1.5.0)
  const pnpmStore = path.join(MONOREPO_ROOT, 'node_modules', '.pnpm');
  if (existsSync(pnpmStore)) {
    const dirs = readdirSync(pnpmStore);
    const prefix = packageName.replace('/', '+') + '@';
    const match = dirs.find(d => d.startsWith(prefix));
    if (match) {
      const candidate = path.join(pnpmStore, match, 'node_modules', packageName);
      if (existsSync(candidate)) return realpathSync(candidate);
    }
  }
  return null;
}

const NATIVE_DEPS = ['better-sqlite3', 'bindings', 'file-uri-to-path'];

for (const dep of NATIVE_DEPS) {
  const realSrc = resolvePackageDir(dep);
  if (!realSrc) {
    console.warn(`Warning: ${dep} not found – skipping`);
    continue;
  }
  const dst = path.join(__dirname, 'dist', 'node_modules', dep);
  mkdirSync(dst, { recursive: true });
  cpSync(realSrc, dst, { recursive: true });
  console.log(`Copied ${dep} → dist/node_modules/${dep}/`);
}

// Remove prebuilt binaries from better-sqlite3 to prevent platform confusion
// when packaging on different platforms (e.g., Windows build on Linux).
// This forces better-sqlite3 to use the built .node file from build/Release/.
const betterSqlite3Bin = path.join(__dirname, 'dist', 'node_modules', 'better-sqlite3', 'bin');
if (existsSync(betterSqlite3Bin)) {
  rmSync(betterSqlite3Bin, { recursive: true });
  console.log('Removed prebuilt binaries from better-sqlite3 (using built .node)');
}

console.log('Server build complete → dist/index.cjs');
