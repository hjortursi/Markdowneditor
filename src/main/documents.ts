import {randomUUID} from 'node:crypto';
import {readFile,writeFile,rename,unlink,stat,realpath} from 'node:fs/promises';
import path from 'node:path';
import type {DocumentState,Snapshot,Action} from '../shared/types';
export const MAX_DOCUMENT_BYTES=4*1024*1024;
export function blank(text=''):DocumentState {return {id:randomUUID(),path:null,text,savedText:'',revision:0};}
export interface FileDialogs {open():Promise<string|null>;save(current:string|null):Promise<string|null>;unsaved(name:string):Promise<'save'|'discard'|'cancel'>;conflict():Promise<boolean>}
// Recovery stays dirty after failed writes; chosen symlinks and permissions survive.
export class Documents {
  document:DocumentState=blank();
  private diskText:string|null=null;
  constructor(private dialogs:FileDialogs){}
  update(snapshot:Snapshot) {
    if(snapshot.id!==this.document.id || snapshot.revision<this.document.revision) return;
    if(typeof snapshot.text!=='string' || Buffer.byteLength(snapshot.text)>MAX_DOCUMENT_BYTES) throw new Error('Document exceeds the 4 MB limit.');
    this.document={...this.document,text:snapshot.text,revision:snapshot.revision};
  }
  get dirty(){return this.document.text!==this.document.savedText;}
  async save(saveAs=false):Promise<boolean> {
    const destination=saveAs||!this.document.path?await this.dialogs.save(this.document.path):this.document.path;
    if(!destination) return false;
    if(destination===this.document.path && this.diskText!==null) {
      let current:string|null=null; try{current=await readFile(destination,'utf8');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
      if(current!==this.diskText && !await this.dialogs.conflict()) return false;
    }
    const text=this.document.text;
    const diskText=this.document.lineEnding==='\r\n'?text.replace(/\n/g,'\r\n'):text;
    await atomicText(destination,diskText);
    this.document={...this.document,path:destination,savedText:text,recovered:false}; this.diskText=diskText;
    return true;
  }
  async guard():Promise<boolean> {
    if(!this.dirty)return true;
    const choice=await this.dialogs.unsaved(this.document.path?path.basename(this.document.path):'Untitled');
    if(choice==='cancel')return false;
    return choice==='discard'||await this.save();
  }
  async action(action:Action):Promise<DocumentState|null> {
    if(action==='save'||action==='saveAs'){await this.save(action==='saveAs');return this.document;}
    if(action==='open') {
      const selected=await this.dialogs.open(); if(!selected)return null;
      await readMarkdown(selected);
      if(!await this.guard())return null;
      // The guard may save into this same path. Read its final on-disk version.
      const raw=await readMarkdown(selected);
      const text=raw.replace(/\r\n?/g,'\n');
      this.document={id:randomUUID(),path:selected,text,savedText:text,revision:0,lineEnding:raw.includes('\r\n')?'\r\n':'\n'};this.diskText=raw;
    } else {
      if(!await this.guard())return null;
      if(action==='new'){this.document=blank();this.diskText=null;}
    }
    return this.document;
  }
  restore(doc:DocumentState){this.document={...doc,id:randomUUID(),recovered:true};this.diskText=doc.lineEnding==='\r\n'?doc.savedText.replace(/\n/g,'\r\n'):doc.savedText;}
}
export async function atomicJSON(file:string,data:unknown){const temp=file+'.tmp';await writeFile(temp,JSON.stringify(data),{mode:0o600});await rename(temp,file);}
export async function remove(file:string){await unlink(file).catch(e=>{if(e.code!=='ENOENT')throw e;});}

async function atomicText(selected:string,text:string){
  let destination=selected;let mode=0o644;
  try{destination=await realpath(selected);mode=(await stat(destination)).mode & 0o777;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  const temp=path.join(path.dirname(destination),`.${path.basename(destination)}.lina-${randomUUID()}.tmp`);
  try{await writeFile(temp,text,{encoding:'utf8',mode,flag:'wx'});await rename(temp,destination);}finally{await unlink(temp).catch(()=>{});}
}

async function readMarkdown(file:string){
  const info=await stat(file);if(info.size>MAX_DOCUMENT_BYTES)throw new Error('This file exceeds the 4 MB limit.');
  const bytes=await readFile(file);if(bytes.length>MAX_DOCUMENT_BYTES)throw new Error('This file exceeds the 4 MB limit.');
  let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new Error('Please choose a valid UTF-8 text or Markdown file.');}
  if(text.includes('\0'))throw new Error('Please choose a UTF-8 text or Markdown file.');return text;
}
