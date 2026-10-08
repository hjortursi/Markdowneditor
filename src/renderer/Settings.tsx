import {useState,type FormEvent} from 'react';
import {X,Check} from '@phosphor-icons/react';
import type {AISettings,AIProvider} from '../shared/types';
import {providers,providerIds} from '../shared/providers';
export function Settings({settings,close,saved}:{settings:AISettings;close:()=>void;saved:(value:AISettings)=>void}){
  const [provider,setProvider]=useState(settings.provider);const [endpoint,setEndpoint]=useState(settings.endpoint);const [model,setModel]=useState(settings.model);
  const [key,setKey]=useState('');const [remember,setRemember]=useState(settings.rememberKey);const [clear,setClear]=useState(false);const [error,setError]=useState('');const [saving,setSaving]=useState(false);
  const preset=providers[provider];const profile=settings.profiles.find(p=>p.provider===provider)!;const hasKey=profile.hasKey&&profile.endpoint===endpoint&&!clear;
  function choose(id:AIProvider){const next=settings.profiles.find(p=>p.provider===id)!;setProvider(id);setEndpoint(next.endpoint);setModel(next.model);setRemember(next.rememberKey);setKey('');setClear(false);setError('');}
  async function submit(e:FormEvent){e.preventDefault();setSaving(true);try{saved(await window.lina.settings({provider,endpoint,model,key:key||undefined,rememberKey:remember,clearKey:clear}));}catch(e){setError(String(e instanceof Error?e.message:e).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,''));}finally{setSaving(false);}}
  return <div className="overlay" onClick={()=>!saving&&close()}><form className="sheet settings-sheet" role="dialog" aria-modal="true" aria-label="AI settings" onClick={e=>e.stopPropagation()} onSubmit={submit}>
    <button type="button" disabled={saving} className="close-sheet icon-button" aria-label="Close settings" onClick={close}><X size={20}/></button>
    <div className="eyebrow">YOUR MODELS · BUILT IN</div><h2>A second pair of eyes.</h2><p>Choose a provider and bring your own API key. Cloud providers connect directly from Lína.</p>
    <label>Provider<select aria-label="AI provider" disabled={saving} value={provider} onChange={e=>choose(e.target.value as AIProvider)}>{providerIds.map(id=><option key={id} value={id}>{providers[id].name}</option>)}</select></label>
    <p className="provider-help">{preset.description}</p>
    {provider==='custom'||provider==='ollama'?<label>Base URL<input required aria-label="Base URL" disabled={saving} value={endpoint} onChange={e=>{setEndpoint(e.target.value);setKey('');}} placeholder={preset.endpoint}/></label>:<p className="provider-destination">{endpoint}</p>}
    <label>Model<input required aria-label="Model" disabled={saving} value={model} maxLength={200} onChange={e=>setModel(e.target.value)} placeholder={provider==='openrouter'?'Provider/model ID from OpenRouter':'Model ID from your provider'}/></label>
    <label>API key <span className="optional">{preset.keyRequired?'required':'optional'}</span><input aria-label="API key" required={preset.keyRequired&&!hasKey} disabled={saving} type="password" value={key} maxLength={8192} autoComplete="off" onChange={e=>{setKey(e.target.value);setClear(false);}} placeholder={hasKey?'A key is configured · leave blank to keep it':'Enter your API key'}/></label>
    {profile.hasKey&&profile.endpoint!==endpoint&&<p className="fineprint">The destination changed. Enter a key for this endpoint.</p>}
    <label className="checkbox-label"><input disabled={saving} type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/>Remember key securely on this Mac</label>
    <p className="fineprint">Each provider keeps its own settings. Keys last for this session unless remembered with macOS-backed encryption. Saving makes no AI request.</p>
    {hasKey&&<button disabled={saving} type="button" className="text-button" onClick={()=>{setClear(true);setKey('');setRemember(false);}}>Remove configured key</button>}
    {error&&<div className="settings-error" role="alert">{error}</div>}
    <div className="sheet-actions"><button type="button" className="secondary" disabled={saving} onClick={close}>Cancel</button><button className="primary" disabled={saving} type="submit">{saving?'Saving…':'Save settings'}<Check size={16}/></button></div>
  </form></div>;
}
