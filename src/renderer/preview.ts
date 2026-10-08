import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
const markdown=new MarkdownIt({html:false,linkify:false,typographer:true});
markdown.renderer.rules.image=(tokens,index)=>`<span class="image-placeholder">Image · ${markdown.utils.escapeHtml(tokens[index].content||'image')} (not loaded)</span>`;
markdown.renderer.rules.link_open=()=>'<span class="preview-link">';
markdown.renderer.rules.link_close=()=>'</span>';
export function renderMarkdown(text:string):string {return DOMPurify.sanitize(markdown.render(text),{USE_PROFILES:{html:true},FORBID_TAGS:['img','iframe','video','audio','style','form','input','object'],FORBID_ATTR:['style','src','srcset']});}
