import React,{useState,useEffect,useRef,useMemo} from 'react';
import {createRoot} from 'react-dom/client';
import {EditorView} from '@codemirror/view';
import {FilePlus,FolderOpen,FloppyDisk,Columns,Code,Article,PencilSimple,Sparkle,ArrowDown,Translate,GearSix,X,ArrowRight,Check,Leaf} from '@phosphor-icons/react';
import type {DocumentState,AISettings,AIResult,AIOperation,Command,Action,ViewMode} from '../shared/types';
import {Editor,lockEditor,replaceRange} from './Editor';
import {renderMarkdown} from './preview';
import './styles.css';
const errorText=(error:unknown)=>String(error instanceof Error?error.message:error).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');
const names={rewrite:'Rewrite',shorten:'Shorten',translate:'Translate'};
function App(){
  const [doc,setDoc]=useState<DocumentState|null>(null);const current=useRef<DocumentState|null>(null);
  const [settings,setSettings]=useState<AISettings|null>(null);
  const [mode,setMode]=useState<ViewMode>('preview');const [busy,setBusy]=useState(false);const operationLock=useRef(false);
  const [selection,setSelection]=useState({from:0,to:0});const editor=useRef<EditorView|null>(null);
  const [notice,setNotice]=useState('');const [error,setError]=useState('');
  const [settingsOpen,setSettingsOpen]=useState(false);const [aiAction,setAIAction]=useState<AIOperation|null>(null);
  const [language,setLanguage]=useState('Icelandic');const [pending,setPending]=useState(false);const requestId=useRef<string|null>(null);
  const [proposal,setProposal]=useState<AIResult|null>(null);
  const commands=useRef<(c:Command)=>void>(()=>{});
  function setDocument(value:DocumentState){current.current=value;setDoc(value);}
  useEffect(()=>{window.lina.ready().then(({document,settings})=>{setDocument(document);setSettings(settings);if(document.recovered)setNotice('Recovered your unsaved draft.');}).catch(e=>setError(errorText(e)));const off=window.lina.onCommand(c=>commands.current(c));return off;},[]);
  useEffect(()=>{setSelection({from:0,to:0});},[doc?.id]);
  useEffect(()=>{
    if(!settingsOpen&&!aiAction&&!proposal)return;
    const previous=document.activeElement as HTMLElement|null;
    const frame=requestAnimationFrame(()=>{const modal=document.querySelector<HTMLElement>('[role="dialog"]');const first=modal?.querySelector<HTMLElement>('input:not([type="checkbox"]),button');first?.focus();});
    function handleKey(e:KeyboardEvent){
      if(e.key==='Escape'){e.preventDefault();if(settingsOpen)setSettingsOpen(false);else if(aiAction)setAIAction(null);else setProposal(null);}
      if(e.key==='Tab'){const modal=document.querySelector('[role="dialog"]');const elements=Array.from(modal?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled])')||[]);const first=elements[0],last=elements[elements.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
    }
    document.addEventListener('keydown',handleKey);return()=>{cancelAnimationFrame(frame);document.removeEventListener('keydown',handleKey);previous?.focus();};
  },[settingsOpen,aiAction,proposal]);
  useEffect(()=>{
    function shortcut(e:KeyboardEvent){
      if(!(e.metaKey||e.ctrlKey)||e.altKey)return;
      const key=e.key.toLowerCase();const map:Record<string,Command>={n:'new',o:'open',w:'close',',':'settings','1':'source','2':'split','3':'preview','4':'reading',s:e.shiftKey?'saveAs':'save'};
      const action=map[key];if(action){e.preventDefault();commands.current(action);}
    }
    document.addEventListener('keydown',shortcut,true);return()=>document.removeEventListener('keydown',shortcut,true);
  },[]);
  function edited(text:string){const value=current.current;if(!value)return;const next={...value,text,revision:value.revision+1};setDocument(next);window.lina.update({id:next.id,text,revision:next.revision});setNotice('');if(proposal){setProposal(null);setNotice('Suggestion dismissed because the document changed.');}}
  async function file(action:Action){
    const value=current.current;if(!value||operationLock.current)return;
    operationLock.current=true;setBusy(true);lockEditor(editor.current,true);setError('');
    try{const result=await window.lina.file(action,{id:value.id,text:value.text,revision:value.revision});if(result){setDocument(result);setProposal(null);setAIAction(null);requestId.current=null;setPending(false);if(action==='save'||action==='saveAs')setNotice(result.text===result.savedText?'Saved.':'Save canceled.');}}
    catch(e){setError(errorText(e));}finally{operationLock.current=false;setBusy(false);lockEditor(editor.current,false);}
  }
  function openAI(action:AIOperation){if(busy||pending)return;setError('');setProposal(null);setAIAction(action);}
  commands.current=c=>{if(['source','split','preview','reading'].includes(c))setMode(c as ViewMode);else if(c==='settings')setSettingsOpen(true);else if(['rewrite','shorten','translate'].includes(c))openAI(c as AIOperation);else void file(c as Action);};
  async function runAI(){
    if(!doc||!aiAction||pending)return;
    if(!settings?.model){setAIAction(null);setSettingsOpen(true);return;}
    const from=selection.from===selection.to?0:selection.from;const to=selection.from===selection.to?doc.text.length:selection.to;
    const id=crypto.randomUUID();requestId.current=id;setPending(true);setAIAction(null);setError('');setNotice('');
    try{const result=await window.lina.suggest({requestId:id,documentId:doc.id,revision:doc.revision,from,to,operation:aiAction,language});const latest=current.current;if(requestId.current!==id)return;if(latest?.id!==result.documentId||latest.revision!==result.revision){setNotice('Document changed. Request a new suggestion.');return;}setProposal(result);}
    catch(e){if(requestId.current===id)setError(errorText(e));}finally{if(requestId.current===id){setPending(false);requestId.current=null;}}
  }
  function accept(){const value=current.current;if(!proposal||!value||!editor.current)return;if(value.id!==proposal.documentId||value.revision!==proposal.revision||value.text.slice(proposal.from,proposal.to)!==proposal.original){setProposal(null);setError('Document changed. Please request a new suggestion.');return;}const result=proposal;setProposal(null);replaceRange(editor.current,result.from,result.to,result.proposed);setNotice('Suggestion applied. Undo with ⌘ Z.');}
  const preview=useMemo(()=>renderMarkdown(doc?.text||''),[doc?.text]);
  if(!doc)return <div className="loading">Opening Lína…</div>;
  const dirty=doc.text!==doc.savedText;const wordCount=doc.text.trim()?doc.text.trim().split(/\s+/u).length:0;
  const selected=selection.to-selection.from;const filename=doc.path?.split('/').pop()||'Untitled';
  return <main className="app">
    <header className="titlebar"><div className="app-name"><Leaf size={17} weight="duotone"/><span>Lína</span></div><div className="document-title" title={doc.path||'New document'}>{dirty&&<span className="dirty-dot" aria-label="Unsaved changes"/>}{filename}<span className="document-kind">Markdown</span></div><button className="icon-button" aria-label="AI settings" title="AI settings · ⌘ ," onClick={()=>setSettingsOpen(true)}><GearSix size={19}/></button></header>
    <div className="toolbar"><div className="file-tools"><button className="icon-button" disabled={busy} aria-label="New document" title="New · ⌘ N" onClick={()=>file('new')}><FilePlus size={19}/></button><button className="icon-button" disabled={busy} aria-label="Open file" title="Open · ⌘ O" onClick={()=>file('open')}><FolderOpen size={20}/></button><button className="icon-button" disabled={busy} aria-label="Save file" title="Save · ⌘ S" onClick={()=>file('save')}><FloppyDisk size={19}/></button><span className="separator"/><span className="toolbar-caption">A little room to think.</span></div><div className="view-control" aria-label="Document view">{(['source','split','preview','reading'] as const).map((view,index)=>{const Icon=[Code,Columns,PencilSimple,Article][index];const label={source:'Source',split:'Split',preview:'Live Preview',reading:'Reading'}[view];return <button key={view} aria-label={`${label} view`} aria-pressed={mode===view} className={mode===view?'selected':''} onClick={()=>setMode(view)} title={`⌘ ${index+1}`}><Icon size={16}/>{label}</button>;})}</div></div>
    <div className="writing-bar"><div className="writing-label"><Sparkle size={16}/><span>A second pair of eyes</span></div><div className="writing-actions"><button disabled={busy||pending||!doc.text.trim()} onClick={()=>openAI('rewrite')}><PencilSimple size={15}/>Rewrite</button><button disabled={busy||pending||!doc.text.trim()} onClick={()=>openAI('shorten')}><ArrowDown size={15}/>Shorten</button><button disabled={busy||pending||!doc.text.trim()} onClick={()=>openAI('translate')}><Translate size={16}/>Translate</button></div><span className="ai-target">{selected?`${selected.toLocaleString()} characters selected`:'Whole document'}</span></div>
    {(error||notice||pending)&&<div className={`message ${error?'error':''}`} role={error?'alert':'status'}>{pending?<><span className="spinner"/>Asking your writing assistant…<button onClick={()=>{requestId.current=null;setPending(false);window.lina.cancelAI();setNotice('Suggestion canceled.');}}>Cancel</button></>:<><span>{error||notice}</span><button aria-label="Dismiss message" onClick={()=>{setError('');setNotice('');}}><X size={14}/></button></>}</div>}
    <div className={`workspace mode-${mode}`}><section className="source-pane" aria-label="Source pane"><div className="pane-label"><span>{mode==='preview'?'LIVE PREVIEW':'SOURCE'}</span><span>{mode==='preview'?'CLICK TO WRITE':'MARKDOWN'}</span></div><Editor live={mode==='preview'} key={doc.id} text={doc.text} onChange={edited} onSelection={(from,to)=>setSelection({from,to})} onReady={view=>{editor.current=view;if(view)lockEditor(view,busy);}}/></section><section className="preview-pane" aria-label="Preview pane"><div className="pane-label"><span>{mode==='reading'?'READING':'PREVIEW'}</span><span>{mode==='reading'?'READ ONLY':'LIVE'}</span></div><div className="preview-scroll"><article className="markdown" data-testid="preview" dangerouslySetInnerHTML={{__html:preview}}/>{!doc.text&&<div className="empty-preview"><Leaf size={32} weight="thin"/><h2>Every idea starts with a line.</h2><p>Start writing. Your words will appear here.</p></div>}</div></section></div>
    <footer><span><span className={`status-dot ${dirty?'unsaved':''}`}/>{dirty?'Unsaved changes':doc.path?'All changes saved':'Ready to write'}</span><span>{wordCount.toLocaleString()} words<span className="footer-divider">·</span>{doc.text.length.toLocaleString()} characters</span><span>UTF-8<span className="footer-divider">·</span>Local first</span></footer>
    {settingsOpen&&settings&&<Settings settings={settings} close={()=>setSettingsOpen(false)} saved={value=>{setSettings(value);setNotice('AI settings saved.');setSettingsOpen(false);}}/>}
    {aiAction&&<div className="overlay" onClick={()=>setAIAction(null)}><section className="sheet small-sheet" role="dialog" aria-modal="true" aria-label={`${names[aiAction]} with AI`} onClick={e=>e.stopPropagation()}><button className="close-sheet icon-button" aria-label="Close writing action" onClick={()=>setAIAction(null)}><X size={20}/></button><div className="eyebrow">WRITING ASSISTANT</div><h2>{names[aiAction]} your words.</h2><p>{selected?'Your selected passage':'The whole document'} will be sent to <strong>{settings?.model||'your configured model'}</strong> at <span className="endpoint-label">{settings?.endpoint}</span>.</p>{aiAction==='translate'&&<label>Translate into<input autoFocus value={language} maxLength={80} onChange={e=>setLanguage(e.target.value)}/></label>}<p className="fineprint">You’ll review the suggestion before applying it.</p><div className="sheet-actions"><button className="secondary" onClick={()=>setAIAction(null)}>Cancel</button><button className="primary" onClick={runAI}>{settings?.model?'Get suggestion':'Set up AI'}<ArrowRight size={16}/></button></div></section></div>}
    {proposal&&<div className="overlay"><section className="sheet review-sheet" role="dialog" aria-modal="true" aria-label="Review AI suggestion"><div className="eyebrow">YOUR WORDS, YOUR CALL</div><h2>A suggestion to consider.</h2><p>Review both versions. Accepting replaces only the text you sent.</p><div className="comparison"><div><h3>Original</h3><pre>{proposal.original}</pre></div><div><h3>Suggested</h3><pre>{proposal.proposed}</pre></div></div><div className="sheet-actions"><span className="fineprint">You can undo an accepted suggestion with ⌘ Z.</span><button className="secondary" onClick={()=>{setProposal(null);setNotice('Suggestion rejected.');}}>Reject</button><button className="primary" disabled={busy} onClick={accept}><Check size={16}/>Accept suggestion</button></div></section></div>}
  </main>;
}
function Settings({settings,close,saved}:{settings:AISettings;close:()=>void;saved:(value:AISettings)=>void}){
  const [endpoint,setEndpoint]=useState(settings.endpoint);const [model,setModel]=useState(settings.model);const [key,setKey]=useState('');const [remember,setRemember]=useState(settings.rememberKey);const [clear,setClear]=useState(false);const [error,setError]=useState('');const [saving,setSaving]=useState(false);
  async function submit(e:React.FormEvent){e.preventDefault();setSaving(true);try{saved(await window.lina.settings({endpoint,model,key:key||undefined,rememberKey:remember,clearKey:clear}));}catch(e){setError(errorText(e));}finally{setSaving(false);}}
  return <div className="overlay" onClick={()=>!saving&&close()}><form className="sheet settings-sheet" role="dialog" aria-modal="true" aria-label="AI settings" onClick={e=>e.stopPropagation()} onSubmit={submit}><button type="button" className="close-sheet icon-button" aria-label="Close settings" onClick={close}><X size={20}/></button><div className="eyebrow">OPTIONAL · LITELLM</div><h2>A second pair of eyes.</h2><p>Connect your own LiteLLM or compatible gateway. Nothing is sent until you request a suggestion.</p><label>Base URL<input autoFocus required aria-label="Base URL" value={endpoint} onChange={e=>setEndpoint(e.target.value)} placeholder="http://localhost:4000/v1"/></label><label>Model<input aria-label="Model" value={model} maxLength={200} onChange={e=>setModel(e.target.value)} placeholder="Your gateway’s model name"/></label><label>API key <span className="optional">optional</span><input aria-label="API key" type="password" value={key} maxLength={8192} autoComplete="off" onChange={e=>{setKey(e.target.value);setClear(false);}} placeholder={settings.hasKey&&!clear?'A key is configured · leave blank to keep it':'Enter a key for this session'}/></label><label className="checkbox-label"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/>Remember key securely on this Mac</label><p className="fineprint">By default, keys last for this session. Remembered keys use macOS-backed encryption. Settings are saved without making a test request.</p>{settings.hasKey&&<button type="button" className="text-button" onClick={()=>{setClear(true);setKey('');setRemember(false);}}>Remove configured key{clear?' on save':''}</button>}{error&&<div className="settings-error" role="alert">{error}</div>}<div className="sheet-actions"><button type="button" className="secondary" disabled={saving} onClick={close}>Cancel</button><button className="primary" disabled={saving} type="submit">{saving?'Saving…':'Save settings'}<Check size={16}/></button></div></form></div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
