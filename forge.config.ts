import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerZIP } from '@electron-forge/maker-zip';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { execSync } from 'node:child_process';
import { cpSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

// Native/external modules that Vite marks as external but need to be
// present in the packaged app's node_modules for runtime require().
const NATIVE_DEPS = ['node-pty', 'ws'];

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack: '{**/node-pty/**,**/*.node}',
    },
    name: 'Airport',
    extraResource: ['CHANGELOG.md', 'bin'],
  },
  hooks: {
    preStart: async () => {
      process.env.AIRPORT_DEV = '1';
      const plist = resolve(require.resolve('electron/package.json'), '..', 'dist/Electron.app/Contents/Info.plist');
      execSync(`plutil -replace CFBundleIdentifier -string com.airport.dev "${plist}"`);
      execSync(`plutil -replace CFBundleDisplayName -string "Airport Dev" "${plist}"`);
      execSync(`plutil -replace CFBundleName -string "Airport Dev" "${plist}"`);
    },
    packageAfterCopy: async (_config, buildPath) => {
      // The Vite plugin bundles everything except externals into .vite/build/.
      // Native modules (node-pty) and pure-JS externals (ws) are left as
      // require('...') calls — we need to copy them into the packaged app
      // so Electron can resolve them at runtime.
      const projectRoot = resolve(__dirname);
      const srcNM = join(projectRoot, 'node_modules');
      const destNM = join(buildPath, 'node_modules');

      for (const dep of NATIVE_DEPS) {
        const src = join(srcNM, dep);
        if (existsSync(src)) {
          cpSync(src, join(destNM, dep), { recursive: true });
        }
      }

      // Also copy transitive native deps that node-pty may need
      const nanAddon = join(srcNM, 'nan');
      if (existsSync(nanAddon)) {
        cpSync(nanAddon, join(destNM, 'nan'), { recursive: true });
      }
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerZIP({}, ['darwin']),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        {
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
