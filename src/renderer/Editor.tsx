import {useEffect,useRef} from 'react';
import {EditorState,Compartment,Transaction} from '@codemirror/state';
import {EditorView,keymap,lineNumbers,highlightActiveLine,drawSelection} from '@codemirror/view';
import {defaultKeymap,history,historyKeymap,isolateHistory} from '@codemirror/commands';
import {markdown} from '@codemirror/lang-markdown';
import {syntaxHighlighting,defaultHighlightStyle} from '@codemirror/language';
const readonly=new WeakMap<EditorView,Compartment>();
export function lockEditor(view:EditorView|null,locked:boolean){const compartment=view&&readonly.get(view);if(view&&compartment)view.dispatch({effects:compartment.reconfigure(EditorState.readOnly.of(locked))});}
export function replaceRange(view:EditorView,from:number,to:number,text:string){view.dispatch({changes:{from,to,insert:text},selection:{anchor:from+text.length},annotations:[Transaction.userEvent.of('input'),isolateHistory.of('full')]});view.focus();}
export function Editor({text,onChange,onSelection,onReady}:{text:string;onChange:(text:string)=>void;onSelection:(from:number,to:number)=>void;onReady:(view:EditorView|null)=>void}){
  const host=useRef<HTMLDivElement>(null);const callbacks=useRef({onChange,onSelection});callbacks.current={onChange,onSelection};
  useEffect(()=>{
    const compartment=new Compartment();
    const view=new EditorView({parent:host.current!,state:EditorState.create({doc:text,extensions:[lineNumbers(),highlightActiveLine(),drawSelection(),history(),markdown(),syntaxHighlighting(defaultHighlightStyle),keymap.of([...defaultKeymap,...historyKeymap]),EditorView.lineWrapping,compartment.of(EditorState.readOnly.of(false)),EditorView.contentAttributes.of({'aria-label':'Markdown source',spellcheck:'false'}),EditorState.transactionFilter.of(tr=>tr.docChanged&&new TextEncoder().encode(tr.newDoc.toString()).length>4*1024*1024?[]:tr),EditorView.updateListener.of(update=>{if(update.docChanged)callbacks.current.onChange(update.state.doc.toString());if(update.selectionSet||update.docChanged){const {from,to}=update.state.selection.main;callbacks.current.onSelection(from,to);}}),EditorView.theme({'&':{height:'100%',fontSize:'14px'},'.cm-scroller':{fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',lineHeight:'1.8'},'.cm-content':{padding:'28px 20px 100px 12px'},'.cm-gutters':{background:'transparent',color:'#a2a7a0',border:'none',padding:'0 8px 0 14px'},'.cm-line':{padding:'0 5px'},'.cm-activeLine':{background:'#edf1eb'},'.cm-activeLineGutter':{background:'transparent',color:'#475543'},'&.cm-focused':{outline:'none'},'.cm-selectionBackground, &.cm-focused .cm-selectionBackground':{background:'#d8e5d2'},'.cm-cursor':{borderLeftColor:'#46683b'}})]})});
    readonly.set(view,compartment);onReady(view);
    return()=>{onReady(null);view.destroy();};
  },[]);
  return <div className="editor-host" ref={host}/>;
}
