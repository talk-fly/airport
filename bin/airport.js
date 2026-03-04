#!/usr/bin/env node
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Ensure node-pty is compiled for Electron's ABI.
// postinstall should have run electron-rebuild, but in npx environments it
// can fail silently. We check for the binary and re-run rebuild if needed.
const pkgRoot = path.join(__dirname, '..');
const rebuildBin = path.join(pkgRoot, 'node_modules', '.bin', 'electron-rebuild');

function tryRebuild() {
  if (!fs.existsSync(rebuildBin)) return false;
  try {
    console.log('Rebuilding node-pty for Electron (first run)...');
    execSync(`"${rebuildBin}" -f -w node-pty`, {
      cwd: pkgRoot,
      stdio: 'inherit',
      timeout: 120_000,
    });
    return true;
  } catch {
    return false;
  }
}

// Quick check: can we load node-pty at all? This runs under system Node,
// but after electron-rebuild the binary targets Electron's ABI — so a load
// failure here is expected and OK. We only use this to detect if the native
// binary is completely missing (build tools not installed).
let needsRebuild = false;
try {
  require('node-pty');
} catch (err) {
  const msg = err && err.message ? err.message : String(err);
  // MODULE_NOT_FOUND = never compiled; anything else = likely ABI mismatch
  // from electron-rebuild (which is fine — Electron will load it).
  if (msg.includes('MODULE_NOT_FOUND') || msg.includes('Cannot find module')) {
    // Binary truly missing — try rebuild
    needsRebuild = true;
  } else if (msg.includes('was compiled against a different Node.js version') ||
             msg.includes('NODE_MODULE_VERSION') ||
             msg.includes('dlopen') ||
             msg.includes('posix_spawnp')) {
    // ABI mismatch or Electron-targeted binary — this is expected after
    // electron-rebuild. Electron will load it correctly.
    needsRebuild = false;
  } else {
    needsRebuild = true;
  }
}

if (needsRebuild) {
  if (!tryRebuild()) {
    console.error('\n\x1b[1;31mError: node-pty native module is not available.\x1b[0m\n');
    if (process.platform === 'darwin') {
      console.error('  \x1b[1mFix:\x1b[0m  xcode-select --install');
      console.error('  Then: npx airport-ai\n');
    } else if (process.platform === 'win32') {
      console.error('  \x1b[1mFix:\x1b[0m  npm install -g windows-build-tools');
      console.error('  Then: npx airport-ai\n');
    } else {
      console.error('  \x1b[1mFix:\x1b[0m  Install gcc, g++, make, and python3');
      console.error('  Then: npx airport-ai\n');
    }
    process.exit(1);
  }
}

// Run hook setup before launching Electron.
// When invoked via `npx airport-ai`, npm lifecycle scripts (prestart) don't
// run, so hooks never get installed into ~/.claude/settings.json.
const setupScript = path.join(__dirname, '..', 'scripts', 'setup-hooks.mjs');
try {
  execSync(`node "${setupScript}"`, { stdio: 'inherit' });
} catch { /* non-critical — hooks are optional */ }

const electronPath = require('electron');

// On macOS, stamp the Electron binary's Info.plist so the menu bar
// and Dock show "Airport" instead of the default "Electron".
if (process.platform === 'darwin') {
  const plist = path.resolve(path.dirname(electronPath), '..', 'Info.plist');
  try {
    execSync(`plutil -replace CFBundleDisplayName -string "Airport" "${plist}"`);
    execSync(`plutil -replace CFBundleName -string "Airport" "${plist}"`);
    execSync(`plutil -replace CFBundleIdentifier -string "com.airport.app" "${plist}"`);
  } catch { /* ignore — non-critical */ }
}

const child = spawn(electronPath, [path.join(__dirname, '..')], {
  stdio: 'inherit',
});

child.on('close', (code) => {
  process.exit(code);
});
