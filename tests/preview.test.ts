// @vitest-environment jsdom
import {it,expect} from 'vitest';
import {renderMarkdown} from '../src/renderer/preview';
it('renders headings, tables, lists and code',()=>{const html=renderMarkdown('# Title\n\n- One\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```js\nconst x = 1;\n```');expect(html).toContain('<h1>Title</h1>');expect(html).toContain('<table>');expect(html).toContain('<code');});
it('cannot execute HTML or fetch images and links',()=>{const html=renderMarkdown('<script>alert(1)</script>\n\n<img src="https://example.com/track">\n\n![Picture](https://example.com/pixel.png)\n\n[Link](https://example.com)');const element=document.createElement('div');element.innerHTML=html;expect(element.querySelector('script,img,iframe,a')).toBeNull();expect(element.querySelector('[src],[href],[onerror]')).toBeNull();expect(html).toContain('not loaded');});
