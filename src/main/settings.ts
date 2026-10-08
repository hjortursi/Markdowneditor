import {readFile} from 'node:fs/promises';
import type {AIProvider,AIProfile,AISettings,SettingsInput} from '../shared/types';
import {providers,providerIds,isProvider} from '../shared/providers';
import {providerEndpoint} from './ai';
import {atomicJSON} from './documents';
interface StoredProfile {endpoint:string;model:string;rememberKey:boolean;encryptedKey:string}
interface Encryption {available():boolean;encrypt(key:string):string;decrypt(value:string):string}
export class SettingsStore {
  private active:AIProvider='openai';
  private profiles=Object.fromEntries(providerIds.map(id=>[id,{endpoint:providers[id].endpoint,model:'',rememberKey:false,encryptedKey:''}])) as Record<AIProvider,StoredProfile>;
  private keys:Partial<Record<AIProvider,string>>={};
  constructor(private file:string,private encryption:Encryption){}
  async load(){
    try{
      const data=JSON.parse(await readFile(this.file,'utf8'));
      const entries=data.version===2?data.profiles:{custom:data};
      if(data.version!==2)this.active='custom';else if(isProvider(data.active))this.active=data.active;
      for(const id of providerIds){const value=entries?.[id];if(!value)continue;try{
        if(typeof value.model!=='string'||value.model.length>200)continue;
        this.profiles[id]={endpoint:providerEndpoint(id,value.endpoint),model:value.model,rememberKey:!!value.rememberKey,encryptedKey:value.rememberKey&&typeof value.encryptedKey==='string'?value.encryptedKey:''};
      }catch{/* A malformed profile does not disable the others. */}}
    }catch{/* A fresh installation starts with direct provider support. */}
  }
  private publicProfile(provider:AIProvider):AIProfile {const p=this.profiles[provider];return {provider,endpoint:p.endpoint,model:p.model,rememberKey:p.rememberKey,hasKey:!!(this.keys[provider]||p.encryptedKey)};}
  public():AISettings{return {...this.publicProfile(this.active),profiles:providerIds.map(id=>this.publicProfile(id))};}
  async save(input:SettingsInput):Promise<AISettings>{
    if(!input||!isProvider(input.provider)||typeof input.endpoint!=='string'||typeof input.model!=='string'||input.model.length>200||typeof input.rememberKey!=='boolean'||(input.clearKey!==undefined&&typeof input.clearKey!=='boolean')||(input.key!==undefined&&(typeof input.key!=='string'||input.key.length>8192||/[\r\n]/.test(input.key))))throw new Error('Invalid AI settings.');
    const id=input.provider;const previous=this.profiles[id];const endpoint=providerEndpoint(id,input.endpoint);
    // A credential is bound to its provider and endpoint. Never carry it to a new destination.
    const sameEndpoint=previous.endpoint===endpoint;
    let key=input.clearKey?'':input.key?.trim()||(sameEndpoint?this.keys[id]||'':'');
    let encryptedKey=sameEndpoint&&!input.clearKey&&!input.key?previous.encryptedKey:'';
    if(!input.rememberKey&&encryptedKey&&!key)key=this.encryption.decrypt(encryptedKey);
    if(input.rememberKey&&key){if(!this.encryption.available())throw new Error('Secure storage is unavailable. Keep the key for this session instead.');encryptedKey=this.encryption.encrypt(key);}
    if(!input.rememberKey||input.clearKey)encryptedKey='';
    const next={endpoint,model:input.model.trim(),rememberKey:input.rememberKey,encryptedKey};
    await atomicJSON(this.file,{version:2,active:id,profiles:{...this.profiles,[id]:next}});
    this.active=id;this.profiles[id]=next;this.keys[id]=key;return this.public();
  }
  transport(){const p=this.profiles[this.active];return {provider:this.active,endpoint:p.endpoint,model:p.model,key:this.keys[this.active]||(p.encryptedKey?this.encryption.decrypt(p.encryptedKey):'')};}
}
