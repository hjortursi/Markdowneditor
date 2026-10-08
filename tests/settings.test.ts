import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {SettingsStore} from '../src/main/settings';
import {providers} from '../src/shared/providers';
import type {AIProvider,SettingsInput} from '../src/shared/types';
let directory:string;let file:string;
const encryption={available:()=>true,encrypt:vi.fn((key:string)=>Buffer.from(key).toString('base64')),decrypt:vi.fn((value:string)=>Buffer.from(value,'base64').toString())};
beforeEach(async()=>{directory=await mkdtemp(path.join(os.tmpdir(),'lina-settings-test-'));file=path.join(directory,'preferences.json');vi.clearAllMocks();});
afterEach(()=>rm(directory,{recursive:true,force:true}));
const input=(provider:AIProvider,key?:string):SettingsInput=>({provider,endpoint:providers[provider].endpoint,model:'test-model',key,rememberKey:false});
it('keeps provider credentials isolated and never returns them to the renderer',async()=>{
 const store=new SettingsStore(file,encryption);await store.load();expect(store.public().provider).toBe('openai');
 await store.save(input('openai','fake-openai'));await store.save(input('anthropic','fake-anthropic'));expect(store.transport().key).toBe('fake-anthropic');
 await store.save(input('openai'));expect(store.transport().key).toBe('fake-openai');expect(store.public().profiles.find(p=>p.provider==='anthropic')?.hasKey).toBe(true);
 expect(JSON.stringify(store.public())).not.toMatch(/fake-openai|fake-anthropic|encryptedKey/);expect(await readFile(file,'utf8')).not.toMatch(/fake-openai|fake-anthropic/);
 const reopened=new SettingsStore(file,encryption);await reopened.load();expect(reopened.public().hasKey).toBe(false);expect(reopened.public().model).toBe('test-model');
});
it('remembers encrypted keys without decrypting on load or exposing ciphertext',async()=>{
 const store=new SettingsStore(file,encryption);await store.save({...input('gemini','fake-gemini'),rememberKey:true});
 expect(await readFile(file,'utf8')).not.toContain('fake-gemini');const reopened=new SettingsStore(file,encryption);await reopened.load();expect(encryption.decrypt).not.toHaveBeenCalled();
 expect(reopened.public().hasKey).toBe(true);expect(JSON.stringify(reopened.public())).not.toContain('encryptedKey');expect(reopened.transport().key).toBe('fake-gemini');
});
it('clears a custom credential when its destination changes',async()=>{
 const store=new SettingsStore(file,encryption);await store.save({...input('custom','fake-custom'),rememberKey:true});
 await store.save({...input('custom'),endpoint:'https://example.com/v1',rememberKey:true});expect(store.public().hasKey).toBe(false);expect(store.transport().key).toBe('');
 await store.save({...input('custom','replacement-key'),endpoint:'https://example.com/v1'});expect(store.transport().key).toBe('replacement-key');
});
it('removing one provider key preserves the others',async()=>{
 const store=new SettingsStore(file,encryption);await store.save(input('openai','one'));await store.save(input('anthropic','two'));await store.save({...input('openai'),clearKey:true});
 expect(store.public().hasKey).toBe(false);await store.save(input('anthropic'));expect(store.transport().key).toBe('two');
});
it('migrates the existing LiteLLM settings without any network or key decryption',async()=>{
 await writeFile(file,JSON.stringify({endpoint:'http://localhost:4000/v1',model:'legacy-model',rememberKey:true,encryptedKey:Buffer.from('legacy-test-key').toString('base64')}));
 const store=new SettingsStore(file,encryption);await store.load();expect(store.public().provider).toBe('custom');expect(store.public().model).toBe('legacy-model');expect(encryption.decrypt).not.toHaveBeenCalled();
 await store.save({...input('custom'),model:'legacy-model',rememberKey:true});expect(encryption.decrypt).not.toHaveBeenCalled();expect(store.transport().key).toBe('legacy-test-key');expect(JSON.parse(await readFile(file,'utf8')).version).toBe(2);
});
it('rejects invalid provider destinations and leaves the current settings intact',async()=>{
 const store=new SettingsStore(file,encryption);await store.save(input('openai','safe-key'));
 await expect(store.save({...input('openai'),endpoint:'https://other.example/v1'})).rejects.toThrow('standard endpoint');expect(store.transport().key).toBe('safe-key');
 await expect(store.save({...input('openai'),key:'bad\nkey'})).rejects.toThrow('Invalid');expect(store.transport().key).toBe('safe-key');
});
it('keeps previous settings when secure storage is unavailable',async()=>{
 const store=new SettingsStore(file,{...encryption,available:()=>false});await store.save(input('openai','session-key'));
 await expect(store.save({...input('anthropic','another-key'),rememberKey:true})).rejects.toThrow('Secure storage');expect(store.public().provider).toBe('openai');expect(store.transport().key).toBe('session-key');
});
