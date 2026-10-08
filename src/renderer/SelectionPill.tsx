import {useEffect,useRef,useState,type FormEvent} from 'react';
import type {EditorView} from '@codemirror/view';
import {Sparkle,ArrowUp,X} from '@phosphor-icons/react';
import type {AISettings} from '../shared/types';
import {providers} from '../shared/providers';
export interface SelectedPassage {documentId:string;revision:number;from:number;to:number;original:string}
export function SelectionPill({view,target,settings,hidden,layoutKey,submit}:{view:EditorView|null;target:SelectedPassage;settings:AISettings|null;hidden:boolean;layoutKey:string;submit:(prompt:string,target:SelectedPassage)=>void}){
  const [prompt,setPrompt]=useState('');const [position,setPosition]=useState<{left:number;top:number;width:number}|null>(null);const [dismissed,setDismissed]=useState(false);
  const pill=useRef<HTMLFormElement>(null);
  useEffect(()=>{
    if(!view||hidden||dismissed)return;
    let frame=0;
    function measure(){
      if(!view)return;const bounds=view.scrollDOM.getBoundingClientRect();
      const middle=view.posAtCoords({x:bounds.left+bounds.width/2,y:bounds.top+Math.min(45,bounds.height/2)},false);
      const fallback=middle!==null&&middle>=target.from&&middle<=target.to?view.coordsAtPos(middle):null;
      const start=view.coordsAtPos(target.from)||fallback||view.coordsAtPos(target.to);const end=view.coordsAtPos(target.to)||fallback||start;
      if(!start||!end||end.bottom<bounds.top||start.top>bounds.bottom){setPosition(null);return;}
      const width=Math.min(400,bounds.width-24);const height=pill.current?.offsetHeight||70;
      const left=Math.max(bounds.left+12,Math.min(start.left,bounds.right-width-12));
      const above=start.top-height-10;const below=end.bottom+10;
      const top=Math.max(bounds.top+12,Math.min(above>=bounds.top+12?above:below,bounds.bottom-height-12));
      setPosition({left,top,width});
    }
    function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(measure);}
    const observer=new ResizeObserver(schedule);observer.observe(view.scrollDOM);observer.observe(view.contentDOM);
    schedule();view.scrollDOM.addEventListener('scroll',schedule);window.addEventListener('resize',schedule);
    return()=>{observer.disconnect();cancelAnimationFrame(frame);view.scrollDOM.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);};
  },[view,target.from,target.to,hidden,dismissed,layoutKey]);
  function send(e:FormEvent){e.preventDefault();if(prompt.trim())submit(prompt.trim(),target);}
  if(hidden||dismissed||!position)return null;
  const configured=settings&&settings.model&&(!providers[settings.provider].keyRequired||settings.hasKey);
  return <form ref={pill} className="selection-pill" role="dialog" aria-label="Edit selected text with AI" style={position} onSubmit={send} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();setDismissed(true);view?.focus();}}}>
    <div className="pill-input-row"><Sparkle className="pill-sparkle" size={16}/><input aria-label="Editing instruction" value={prompt} maxLength={2000} onChange={e=>setPrompt(e.target.value)} placeholder="How should this passage change?"/><button type="submit" className="pill-send" disabled={!prompt.trim()} aria-label={configured?'Suggest edit':'Set up AI'} title={configured?'Suggest edit · Enter':'Set up AI'}><ArrowUp size={18}/></button><button type="button" className="pill-dismiss" aria-label="Dismiss selection assistant" onClick={()=>{setDismissed(true);view?.focus();}}><X size={13}/></button></div>
    <div className="pill-footnote"><span title={settings?`${settings.model} · ${settings.endpoint}`:undefined}>{configured?`${target.to-target.from} characters → ${providers[settings.provider].name}`:'Choose your provider and API key'}</span><span>Review before applying</span></div>
  </form>;
}
