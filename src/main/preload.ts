import {contextBridge,ipcRenderer} from 'electron';
import type {LinaAPI,Command,DocumentState} from '../shared/types';
const api:LinaAPI={
  ready:()=>ipcRenderer.invoke('lina:ready'),
  update:snapshot=>ipcRenderer.send('lina:update',snapshot),
  file:(action,snapshot)=>ipcRenderer.invoke('lina:file',action,snapshot),
  settings:input=>ipcRenderer.invoke('lina:settings',input),
  suggest:request=>ipcRenderer.invoke('lina:suggest',request),
  cancelAI:()=>ipcRenderer.invoke('lina:cancel-ai'),
  onCommand:callback=>{const listener=(_:unknown,command:Command)=>callback(command);ipcRenderer.on('lina:command',listener);return()=>ipcRenderer.removeListener('lina:command',listener);},
  onDocument:callback=>{const listener=(_:unknown,doc:DocumentState)=>callback(doc);ipcRenderer.on('lina:document',listener);return()=>ipcRenderer.removeListener('lina:document',listener);}
};
contextBridge.exposeInMainWorld('lina',api);
