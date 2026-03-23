import { app, Menu } from 'electron';
import { WsServer } from './ws-server';

export function setupMenu(server: WsServer): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Session',
      submenu: [
        {
          label: 'New Session',
          accelerator: 'CmdOrCtrl+T',
          click: () => {
            server.broadcast('menu:new-session');
          },
        },
        {
          label: 'New Worktree',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            server.broadcast('menu:new-worktree');
          },
        },
        {
          label: 'Close Session',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            server.broadcast('menu:close-session');
          },
        },
        { type: 'separator' },
        {
          label: 'Jump to Next Waiting',
          accelerator: 'CmdOrCtrl+J',
          click: () => {
            server.broadcast('menu:jump-waiting');
          },
        },
        { type: 'separator' },
        {
          label: 'Next Session',
          accelerator: 'CmdOrCtrl+]',
          click: () => {
            server.broadcast('menu:next-session');
          },
        },
        {
          label: 'Previous Session',
          accelerator: 'CmdOrCtrl+[',
          click: () => {
            server.broadcast('menu:prev-session');
          },
        },
        {
          label: 'Next Session',
          accelerator: 'CmdOrCtrl+Shift+]',
          visible: false,
          click: () => {
            server.broadcast('menu:next-session');
          },
        },
        {
          label: 'Previous Session',
          accelerator: 'CmdOrCtrl+Shift+[',
          visible: false,
          click: () => {
            server.broadcast('menu:prev-session');
          },
        },
        { type: 'separator' },
        {
          label: 'Clear Terminal',
          accelerator: 'CmdOrCtrl+K',
          click: () => {
            server.broadcast('menu:clear-terminal');
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: "What's New",
          click: () => {
            server.broadcast('menu:whats-new');
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
