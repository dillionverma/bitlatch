import { contextBridge, ipcRenderer } from 'electron';
import type { LatchApi, VaultState } from '../shared/types';
import type { DesktopRequest } from '../shared/protocol';

const request = (message: DesktopRequest) => ipcRenderer.invoke('latch:request', message);

const api: LatchApi = {
  state: () => request({ type: 'state' }),
  login: (input) => request({ type: 'login', input }),
  unlock: (password) => request({ type: 'unlock', password }),
  lock: () => request({ type: 'lock' }),
  logout: () => request({ type: 'logout' }),
  sync: () => request({ type: 'sync' }),
  items: () => request({ type: 'items' }),
  detail: (id) => request({ type: 'detail', id }),
  save: (draft) => request({ type: 'save', draft }),
  copy: (id, field) => request({ type: 'copy', id, field }),
  generate: () => request({ type: 'generate' }),
  installBrowser: () => request({ type: 'installBrowser' }),
  openExtensionFolder: () => request({ type: 'openExtensionFolder' }),
  onState: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: VaultState) => listener(state);
    ipcRenderer.on('latch:state', handler);
    return () => ipcRenderer.removeListener('latch:state', handler);
  },
  onFocusSearch: (listener) => {
    const handler = () => listener();
    ipcRenderer.on('latch:focus-search', handler);
    return () => ipcRenderer.removeListener('latch:focus-search', handler);
  },
};

contextBridge.exposeInMainWorld('latch', api);
