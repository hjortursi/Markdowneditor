import {EditorState,Range,Transaction} from '@codemirror/state';
import {syntaxTree} from '@codemirror/language';
import {Decoration,DecorationSet,EditorView,ViewPlugin,ViewUpdate,WidgetType} from '@codemirror/view';
import {isolateHistory} from '@codemirror/commands';

class TextWidget extends WidgetType {
  constructor(readonly text:string,readonly className:string){super();}
  eq(other:TextWidget){return this.text===other.text&&this.className===other.className;}
  toDOM(){const element=document.createElement('span');element.className=this.className;element.textContent=this.text;return element;}
  ignoreEvent(){return false;}
}
class TaskWidget extends WidgetType {
  constructor(readonly position:number,readonly checked:boolean){super();}
  eq(other:TaskWidget){return this.position===other.position&&this.checked===other.checked;}
  toDOM(view:EditorView){
    const input=document.createElement('input');input.type='checkbox';input.className='lp-task';input.checked=this.checked;input.setAttribute('aria-label','Toggle task');
    input.addEventListener('change',()=>{
      if(view.state.readOnly){input.checked=this.checked;return;}
      // The widget contains no document HTML. Toggle the original Markdown byte.
      const marker=view.state.sliceDoc(this.position,this.position+3);
      if(!/^\[[ xX]\]$/.test(marker))return;
      view.dispatch({changes:{from:this.position+1,to:this.position+2,insert:input.checked?'x':' '},annotations:[Transaction.userEvent.of('input'),isolateHistory.of('full')]});
    });return input;
  }
  ignoreEvent(){return true;}
}
export function previewDecorations(state:EditorState,focused:boolean,ranges:readonly {from:number;to:number}[]=[{from:0,to:state.doc.length}]){
  const decorations:Range<Decoration>[]=[];const hidden:Range<Decoration>[]=[];const lines=new Set<string>();
  const active=focused?state.selection.ranges.map(r=>({from:state.doc.lineAt(r.from).from,to:state.doc.lineAt(r.to).to})):[];
  const editing=(from:number,to:number)=>active.some(r=>from<=r.to&&to>=r.from);
  function mark(from:number,to:number,className:string){if(from<to)decorations.push(Decoration.mark({class:className}).range(from,to));}
  function replace(from:number,to:number,widget?:WidgetType){if(from>=to||state.sliceDoc(from,to).includes('\n'))return;const range=Decoration.replace({widget}).range(from,to);decorations.push(range);hidden.push(range);}
  function line(position:number,className:string){const from=state.doc.lineAt(position).from;const key=from+className;if(!lines.has(key)){lines.add(key);decorations.push(Decoration.line({class:className}).range(from));}}
  for(const visible of ranges){
    syntaxTree(state).iterate({from:visible.from,to:visible.to,enter:node=>{
      const {name,from,to}=node;
      if(name==='Image'){
        if(!editing(from,to)){const alt=state.sliceDoc(from,to).match(/^!\[([^\]]*)\]/)?.[1]||'Image';replace(from,to,new TextWidget(`Image · ${alt} (not loaded)`,'lp-image'));return false;}
      }
      if(/^ATXHeading[1-6]$/.test(name)||/^SetextHeading[12]$/.test(name))line(from,'lp-heading lp-h'+name.at(-1));
      if(name==='StrongEmphasis')mark(from,to,'lp-strong');
      if(name==='Emphasis')mark(from,to,'lp-emphasis');
      if(name==='Strikethrough')mark(from,to,'lp-strike');
      if(name==='InlineCode')mark(from,to,'lp-code');
      if(name==='Link')mark(from,to,'lp-link');
      if(name==='FencedCode'||name==='CodeBlock'){
        const start=state.doc.lineAt(Math.max(from,visible.from));const end=Math.min(to,visible.to);
        for(let number=start.number;number<=state.doc.lines;number++){const current=state.doc.line(number);if(current.from>end)break;line(current.from,'lp-code-block');}
      }
      if(name==='TableHeader'||name==='TableRow'||name==='TableDelimiter')line(from,'lp-table-source');
      if(name==='QuoteMark'){line(from,'lp-quote');if(!editing(from,to)){const trailing=state.sliceDoc(to,to+1)===' '?1:0;replace(from,to+trailing);}}
      if(name==='HeaderMark'&&!editing(from,to)){const trailing=state.sliceDoc(to,to+1)===' '?1:0;replace(from,to+trailing);}
      if(['EmphasisMark','StrikethroughMark','CodeMark','LinkMark'].includes(name)&&!editing(from,to))replace(from,to);
      if((name==='URL'||name==='LinkTitle')&&node.node.parent?.name==='Link'&&!editing(from,to))replace(from,to);
      if(name==='CodeInfo'&&!editing(from,to))mark(from,to,'lp-code-language');
      if(name==='ListMark'&&!editing(from,to)&&/^[-+*]$/.test(state.sliceDoc(from,to)))replace(from,to,new TextWidget('•','lp-bullet'));
      if(name==='TaskMarker'&&!editing(from,to))replace(from,to,new TaskWidget(from,/x/i.test(state.sliceDoc(from,to))));
      if(name==='HorizontalRule'&&!editing(from,to))replace(from,to,new TextWidget('','lp-rule'));
    }});
  }
  return {decorations:Decoration.set(decorations,true),hidden:Decoration.set(hidden,true)};
}
class LivePreview {
  decorations:DecorationSet;hidden:DecorationSet;
  constructor(view:EditorView){const result=previewDecorations(view.state,view.hasFocus,view.visibleRanges);this.decorations=result.decorations;this.hidden=result.hidden;}
  update(update:ViewUpdate){
    if(update.docChanged||update.selectionSet||update.focusChanged||update.viewportChanged||syntaxTree(update.startState)!==syntaxTree(update.state)){
      const result=previewDecorations(update.state,update.view.hasFocus,update.view.visibleRanges);this.decorations=result.decorations;this.hidden=result.hidden;
    }
  }
}
export const livePreview=ViewPlugin.fromClass(LivePreview,{decorations:view=>view.decorations,provide:plugin=>EditorView.atomicRanges.of(view=>view.plugin(plugin)?.hidden||Decoration.none)});
export const liveTheme=EditorView.theme({
  '&':{height:'100%',fontSize:'14px'},
  '.cm-scroller':{fontFamily:'-apple-system, BlinkMacSystemFont, Helvetica Neue, sans-serif',lineHeight:'1.8'},
  '.cm-content':{maxWidth:'780px',width:'100%',padding:'38px 40px 100px',margin:'0 auto',caretColor:'#46663b'},
  '.cm-line':{padding:'0',color:'#394235'},
  '.cm-line.lp-heading':{fontWeight:'620',letterSpacing:'-.6px',lineHeight:'1.35',color:'#283524',paddingTop:'8px',paddingBottom:'4px'},
  '.lp-h1':{fontSize:'30px'},'.lp-h2':{fontSize:'21px'},'.lp-h3':{fontSize:'18px'},'.lp-h4,.lp-h5,.lp-h6':{fontSize:'16px'},
  '.lp-strong':{fontWeight:'650'},'.lp-emphasis':{fontStyle:'italic'},'.lp-strike':{textDecoration:'line-through'},
  '.lp-code':{fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',fontSize:'12px',background:'#edf2e8',borderRadius:'3px',padding:'2px 0'},
  '.lp-link':{color:'#507a3f',textDecoration:'underline',textUnderlineOffset:'3px'},
  '.cm-line.lp-quote':{borderLeft:'3px solid #c3d0b9',paddingLeft:'18px',color:'#7c8b72'},
  '.lp-bullet':{color:'#8da07f',display:'inline-block',width:'12px'},
  '.lp-task':{accentColor:'#46663b',verticalAlign:'middle',margin:'0 5px 2px 0',cursor:'pointer'},
  '.cm-line.lp-code-block,.cm-line.lp-table-source':{fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',fontSize:'12px',background:'#f2f5ef',padding:'0 12px'},
  '.lp-code-language':{fontSize:'10px',color:'#96a18d'},
  '.lp-image':{display:'inline-block',color:'#8a967f',fontSize:'11px',padding:'4px 8px',border:'1px dashed #ccd6c4',borderRadius:'4px'},
  '.lp-rule':{display:'inline-block',borderTop:'1px solid #dfe6d9',width:'100%',verticalAlign:'middle'},
  '&.cm-focused':{outline:'none'},'.cm-selectionBackground, &.cm-focused .cm-selectionBackground':{background:'#d8e5d2'},'.cm-cursor':{borderLeftColor:'#46683b'}
});
