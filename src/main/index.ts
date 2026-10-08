import {app,BrowserWindow,dialog,ipcMain,Menu,safeStorage,session} from 'electron';
import {mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Documents,blank,atomicJSON,remove,MAX_DOCUMENT_BYTES} from './documents';
import {endpointURL,suggest} from './ai';
import type {AISettings,SettingsInput,Command,Snapshot,Action,DocumentState,AIRequest} from '../shared/types';
app.setName('Lína');
if(process.env.LINA_USER_DATA)app.setPath('userData',process.env.LINA_USER_DATA);
const storage=app.getPath('userData');
const preferencesFile=path.join(storage,'preferences.json');
const recoveryFile=path.join(storage,'recovery.json');
let win:BrowserWindow|null=null;
let approvedClose=false;
let quitting=false;
let fileBusy=false;
let aiController:AbortController|null=null;
let recoveryTimer:ReturnType<typeof setTimeout>|null=null;
let recoveryQueue=Promise.resolve();
let config={endpoint:'http://localhost:4000/v1',model:'',rememberKey:false,encryptedKey:''};
let sessionKey='';
const documents=new Documents({
  open:async()=>{const result=await dialog.showOpenDialog(win!,{title:'Open Markdown',properties:['openFile'],filters:[{name:'Markdown & text',extensions:['md','markdown','mdown','txt']},{name:'All files',extensions:['*']}]});return result.canceled?null:result.filePaths[0];},
  save:async(current)=>{const result=await dialog.showSaveDialog(win!,{title:'Save Markdown',defaultPath:current||'Untitled.md',filters:[{name:'Markdown',extensions:['md']},{name:'Text',extensions:['txt']}]});return result.canceled?null:result.filePath||null;},
  unsaved:async(name)=>{const {response}=await dialog.showMessageBox(win!,{type:'warning',message:`Save changes to “${name}”?`,detail:'Your edits will be lost if you discard them.',buttons:['Save','Cancel','Discard Changes'],defaultId:0,cancelId:1,noLink:true});return (['save','cancel','discard'] as const)[response]||'cancel';},
  conflict:async()=>{const {response}=await dialog.showMessageBox(win!,{type:'warning',message:'This file changed on disk.',detail:'Replace the version on disk with your current edits?',buttons:['Cancel','Replace'],defaultId:0,cancelId:0});return response===1;}
});
function publicSettings():AISettings{return {endpoint:config.endpoint,model:config.model,hasKey:!!(sessionKey||config.encryptedKey),rememberKey:config.rememberKey};}
function command(value:Command){win?.webContents.send('lina:command',value);}
function title(){const d=documents.document;win?.setTitle(`${d.path?path.basename(d.path):'Untitled'}${documents.dirty?' •':''} — Lína`);win?.setDocumentEdited(documents.dirty);if(d.path)win?.setRepresentedFilename(d.path);}
function recover(keep=true){if(recoveryTimer)clearTimeout(recoveryTimer);recoveryTimer=null;const doc={...documents.document};recoveryQueue=recoveryQueue.catch(()=>{}).then(()=>keep&&doc.text!==doc.savedText?atomicJSON(recoveryFile,doc):remove(recoveryFile));return recoveryQueue;}
function queueRecovery(){if(recoveryTimer)clearTimeout(recoveryTimer);recoveryTimer=setTimeout(()=>{recover().catch(()=>{});},400);}
function validSender(event:Electron.IpcMainEvent|Electron.IpcMainInvokeEvent){if(!win || event.sender!==win.webContents || event.senderFrame!==win.webContents.mainFrame)throw new Error('Untrusted caller.');}
function applySnapshot(value:Snapshot){if(!value||typeof value.id!=='string'||typeof value.text!=='string'||!Number.isInteger(value.revision)||value.revision<0)throw new Error('Invalid document update.');documents.update(value);title();}
function registerIPC(){
  ipcMain.handle('lina:ready',(e)=>{validSender(e);return {document:documents.document,settings:publicSettings()};});
  ipcMain.on('lina:update',(e,snapshot:Snapshot)=>{try{validSender(e);if(fileBusy)return;applySnapshot(snapshot);queueRecovery();}catch{/* Renderer limits size before sending. */}});
  ipcMain.handle('lina:file',async(e,action:Action,snapshot:Snapshot)=>{
    validSender(e);if(!['new','open','save','saveAs','close'].includes(action))throw new Error('Unknown file action.');
    if(fileBusy)return null;
    fileBusy=true;
    try {
      applySnapshot(snapshot);
      const result=await documents.action(action);
      if(result){aiController?.abort();await recover(action!=='close');title();if(action==='close'){approvedClose=true;win?.close();}}
      else if(action==='close')quitting=false;
      return result;
    } catch(error){quitting=false;throw error;} finally{fileBusy=false;}
  });
  ipcMain.handle('lina:settings',async(e,input?:SettingsInput)=>{
    validSender(e);if(!input)return publicSettings();
    if(typeof input.endpoint!=='string'||typeof input.model!=='string'||input.model.length>200||typeof input.rememberKey!=='boolean'||(input.key!==undefined&&(typeof input.key!=='string'||input.key.length>8192)))throw new Error('Invalid AI settings.');
    const endpoint=endpointURL(input.endpoint);
    let key=input.clearKey?'':input.key||sessionKey;
    if(!key&&config.encryptedKey&&!input.clearKey)key=safeStorage.decryptString(Buffer.from(config.encryptedKey,'base64'));
    let encryptedKey='';
    if(input.rememberKey&&key){if(!safeStorage.isEncryptionAvailable())throw new Error('Secure storage is unavailable. Keep the key for this session instead.');encryptedKey=safeStorage.encryptString(key).toString('base64');}
    const next={endpoint,model:input.model.trim(),rememberKey:input.rememberKey,encryptedKey};
    await atomicJSON(preferencesFile,next);config=next;sessionKey=key;aiController?.abort();return publicSettings();
  });
  ipcMain.handle('lina:cancel-ai',e=>{validSender(e);aiController?.abort();});
  ipcMain.handle('lina:suggest',async(e,request:AIRequest)=>{
    validSender(e);if(fileBusy)throw new Error('Finish the file operation first.');
    if(!request||typeof request.requestId!=='string'||request.requestId.length>100)throw new Error('Invalid request.');
    aiController?.abort();const controller=new AbortController();aiController=controller;
    const timeout=setTimeout(()=>controller.abort(),60000);
    try {
      const key=sessionKey||(config.encryptedKey?safeStorage.decryptString(Buffer.from(config.encryptedKey,'base64')):'');
      const result=await suggest({...documents.document},request,{...config,key},controller.signal);
      if(controller.signal.aborted)throw new Error('Suggestion canceled.');
      if(documents.document.id!==result.documentId||documents.document.revision!==result.revision)throw new Error('The document changed. Please request a new suggestion.');
      return result;
    }catch(error){if(controller.signal.aborted)throw new Error('Suggestion canceled or timed out.');if(error instanceof TypeError)throw new Error('Cannot reach the AI endpoint. Check that your LiteLLM server is running.');throw error;}finally{clearTimeout(timeout);if(aiController===controller)aiController=null;}
  });
}
function createWindow(){
  approvedClose=false;
  win=new BrowserWindow({width:1180,height:800,minWidth:820,minHeight:560,title:'Lína',titleBarStyle:'hiddenInset',trafficLightPosition:{x:20,y:23},backgroundColor:'#f5f6f4',show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,spellcheck:false}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',e=>e.preventDefault());
  win.webContents.on('will-attach-webview',e=>e.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  win.on('close',e=>{if(!approvedClose){e.preventDefault();command('close');}});
  win.on('closed',()=>{win=null;});
  win.once('ready-to-show',()=>{title();win?.show();});
  win.loadFile(path.join(__dirname,'../renderer/index.html'));
}
function menus(){
  const item=(label:string,value:Command,accelerator?:string):Electron.MenuItemConstructorOptions=>({label,accelerator,click:()=>command(value)});
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'Lína',submenu:[{role:'about'},item('AI Settings…','settings','CmdOrCtrl+,'),{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}]},
    {label:'File',submenu:[item('New','new','CmdOrCtrl+N'),item('Open…','open','CmdOrCtrl+O'),{type:'separator'},item('Save','save','CmdOrCtrl+S'),item('Save As…','saveAs','CmdOrCtrl+Shift+S'),{type:'separator'},item('Close','close','CmdOrCtrl+W')]},
    {label:'Edit',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
    {label:'View',submenu:[item('Source','source','CmdOrCtrl+1'),item('Split','split','CmdOrCtrl+2'),item('Live Preview','preview','CmdOrCtrl+3'),item('Reading','reading','CmdOrCtrl+4'),{type:'separator'},{role:'togglefullscreen'}]},
    {label:'Writing',submenu:[item('Rewrite…','rewrite'),item('Shorten…','shorten'),item('Translate…','translate')]},
    {role:'windowMenu'}
  ]));
}
app.on('before-quit',e=>{if(win&&!approvedClose){e.preventDefault();if(!quitting){quitting=true;command('close');}}});
app.on('window-all-closed',()=>app.quit());
app.on('activate',()=>{if(!win)createWindow();});
app.whenReady().then(async()=>{
  await mkdir(storage,{recursive:true});
  try{const data=JSON.parse(await readFile(preferencesFile,'utf8'));config={endpoint:endpointURL(data.endpoint),model:typeof data.model==='string'?data.model:'',rememberKey:!!data.rememberKey,encryptedKey:typeof data.encryptedKey==='string'?data.encryptedKey:''};}catch{/* No existing preferences needed. */}
  try{const doc=JSON.parse(await readFile(recoveryFile,'utf8')) as DocumentState;if(typeof doc.text==='string'&&typeof doc.savedText==='string'&&Buffer.byteLength(doc.text)<=MAX_DOCUMENT_BYTES&&(doc.path===null||typeof doc.path==='string'))documents.restore({...doc,revision:0});}catch{/* Missing recovery starts a fresh document. */}
  if(!documents.document.recovered){documents.document=blank('# A little room to think\n\nWelcome to **Lína**, Hjörtur. A quiet space for words, notes, and the next good idea.\n\n## Start with a line\n\nClick anywhere and start writing. Formatting stays visible; Markdown syntax appears on the line you’re editing.\n\n- Open a Markdown file with **⌘ O**\n- Save your words with **⌘ S**\n- Switch your view with **⌘ 1**, **⌘ 2**, **⌘ 3**, or **⌘ 4**\n\n> Make a little space. See what shows up.\n\n## A second pair of eyes\n\nSelect a passage, choose a writing action, and review the suggestion before it touches your document. Set up your LiteLLM endpoint in **AI settings** when you’re ready.\n');documents.document.savedText=documents.document.text;}
  session.defaultSession.webRequest.onBeforeRequest((details,callback)=>{callback({cancel:!['file:','devtools:'].includes(new URL(details.url).protocol)});});
  registerIPC();menus();createWindow();
});
