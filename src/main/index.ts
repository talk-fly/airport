import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { PtyManager } from './pty-manager';
import { WsServer } from './ws-server';
import { registerIpcHandlers } from './ipc-handlers';
import { setupMenu } from './menu';
import { IPC } from '../shared/ipc-channels';
import { startHookWatcher } from './hook-watcher';

if (started) {
  app.quit();
}

const isDev = !!MAIN_WINDOW_VITE_DEV_SERVER_URL;
const branchTag = process.env.AIRPORT_BRANCH_TAG;
const devName = branchTag ? `Airport Dev (${branchTag})` : 'Airport Dev';
app.setName(isDev ? devName : 'Airport');
if (isDev) {
  app.setPath('userData', path.join(app.getPath('appData'), devName));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  const ptyManager = new PtyManager();
  const wsServer = new WsServer();
  let mainWindow: BrowserWindow | null = null;
  let stateSaved = false;

  const createWindow = () => {
    mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 800,
      minHeight: 500,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 12, y: 12 },
      backgroundColor: '#000000',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
      },
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    // Intercept window close to save state first
    mainWindow.on('close', (e) => {
      if (!stateSaved && mainWindow && !mainWindow.isDestroyed()) {
        e.preventDefault();
        wsServer.broadcast(IPC.STATE_REQUEST_SAVE);
        // Give the renderer time to save, then actually close
        setTimeout(() => {
          stateSaved = true;
          ptyManager.closeAll();
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.destroy();
          }
        }, 500);
      }
    });

    const port = wsServer.getPort();
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      const url = new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
      url.searchParams.set('wsPort', String(port));
      mainWindow.loadURL(url.toString());
    } else {
      mainWindow.loadFile(
        path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
        { query: { wsPort: String(port) } }
      );
    }

    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow?.focus();
    });
  };

  registerIpcHandlers(ptyManager, wsServer);
  const stopHookWatcher = startHookWatcher(ptyManager, wsServer);

  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on('ready', async () => {
    await wsServer.start();
    setupMenu(wsServer);
    createWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      stateSaved = false;
      createWindow();
    }
  });

  app.on('before-quit', (e) => {
    if (!stateSaved && mainWindow && !mainWindow.isDestroyed()) {
      e.preventDefault();
      wsServer.broadcast(IPC.STATE_REQUEST_SAVE);
      setTimeout(() => {
        stateSaved = true;
        stopHookWatcher();
        ptyManager.closeAll();
        wsServer.close();
        app.quit();
      }, 500);
    } else {
      stopHookWatcher();
      ptyManager.closeAll();
      wsServer.close();
    }
  });
}
