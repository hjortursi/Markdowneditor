import {test,expect,_electron as electron,type ElectronApplication,type Page} from '@playwright/test';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {createServer,type Server} from 'node:http';
import os from 'node:os';import path from 'node:path';
let app:ElectronApplication;let page:Page;let directory:string;let server:Server;let endpoint:string;let uploaded:string[];let instructions:string[];let delay=false;
test.beforeEach(async()=>{
 directory=await mkdtemp(path.join(os.tmpdir(),'lina-e2e-'));uploaded=[];instructions=[];delay=false;
 server=createServer((req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{const payload=JSON.parse(body);uploaded.push(payload.messages[1].content);instructions.push(payload.messages[0].content);const reply=()=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:'# Suggested\n\nClearer words.'}}]}));};if(delay)setTimeout(reply,700);else reply();});});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));endpoint=`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`;
 app=await electron.launch({args:[path.resolve('.')],env:{...process.env,LINA_USER_DATA:directory}});page=await app.firstWindow();await expect(page.getByRole('textbox',{name:'Live preview editor'})).toBeVisible();await page.getByRole('button',{name:'Split view',exact:true}).click();await expect(page.getByTestId('preview')).toContainText('A little room to think');
});
test.afterEach(async()=>{if(app){await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:2,checkboxChecked:false});});await app.close();}await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true});});
async function text(value:string){await page.getByRole('textbox',{name:'Markdown source'}).click();await page.keyboard.press('Meta+a');await page.keyboard.insertText(value);}
async function settings(){await page.getByRole('button',{name:'AI settings',exact:true}).click();await page.getByRole('combobox',{name:'AI provider'}).selectOption('custom');await page.getByRole('textbox',{name:'Base URL'}).fill(endpoint);await page.getByRole('textbox',{name:'Model',exact:true}).fill('mock-model');await page.getByRole('button',{name:'Save settings'}).click();}
async function suggest(){await page.getByRole('button',{name:'Rewrite',exact:true}).click();await page.getByRole('button',{name:'Get suggestion'}).click();}
test('real save/open/save-as, live preview, shortcuts and cancel protection',async()=>{
 await text('# Hello Hjörtur\n\n**Live preview**');await expect(page.getByTestId('preview').locator('h1')).toHaveText('Hello Hjörtur');await expect(page.getByLabel('Unsaved changes')).toBeVisible();
 const first=path.join(directory,'first.md');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},first);await page.keyboard.press('Meta+s');await expect.poll(()=>readFile(first,'utf8').catch(()=>'')).toContain('# Hello Hjörtur');await expect(page.getByText('All changes saved')).toBeVisible();
 await text('# Modified');const second=path.join(directory,'second.md');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},second);await page.keyboard.press('Meta+Shift+s');await expect.poll(()=>readFile(second,'utf8').catch(()=>'')).toBe('# Modified');expect(await readFile(first,'utf8')).toContain('Hello Hjörtur');
 await text('# Unsaved');await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1,checkboxChecked:false});});await page.keyboard.press('Meta+n');await expect(page.getByTestId('preview')).toContainText('Unsaved');await page.keyboard.press('Meta+w');await expect(page.getByTestId('preview')).toContainText('Unsaved');
 await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});dialog.showMessageBox=async()=>({response:2,checkboxChecked:false});},first);await page.keyboard.press('Meta+o');await expect(page.getByTestId('preview')).toContainText('Hello Hjörtur');
 await page.keyboard.press('Meta+3');await expect(page.getByRole('textbox',{name:'Live preview editor'})).toBeVisible();await page.keyboard.press('Meta+4');await expect(page.getByLabel('Source pane')).toBeHidden();await page.keyboard.press('Meta+1');await expect(page.getByLabel('Preview pane')).toBeHidden();await page.keyboard.press('Meta+2');await expect(page.getByLabel('Preview pane')).toBeVisible();
 await page.screenshot({path:'test-results/lina-editor.png'});
});
test('mock AI review, reject, accept and undo',async()=>{
 await text('# Original\n\nMy words.');await page.keyboard.press('ArrowRight');await settings();expect(uploaded).toEqual([]);await suggest();await expect(page.getByRole('dialog',{name:'Review AI suggestion'})).toBeVisible();await expect(page.getByTestId('preview')).toContainText('Original');await page.getByRole('button',{name:'Reject',exact:true}).click();await expect(page.getByTestId('preview')).toContainText('Original');
 await suggest();await page.screenshot({path:'test-results/lina-ai-review.png'});await page.getByRole('button',{name:'Accept suggestion'}).click();await expect(page.getByTestId('preview')).toContainText('Suggested');await page.keyboard.press('Meta+z');await expect(page.getByTestId('preview')).toContainText('Original');expect(uploaded).toEqual(['# Original\n\nMy words.','# Original\n\nMy words.']);
});
test('stale responses cannot replace ongoing edits and preview has no remote requests',async()=>{
 await text('# Before');await page.keyboard.press('ArrowRight');await settings();delay=true;await suggest();await text('# After');await expect(page.getByRole('alert')).toContainText('document changed');await expect(page.getByRole('dialog',{name:'Review AI suggestion'})).toHaveCount(0);await expect(page.getByTestId('preview')).toContainText('After');
 const network:string[]=[];page.on('request',r=>{if(r.url().startsWith('http'))network.push(r.url());});await text('<img src="https://example.com/pixel">\n\n![alt](https://example.com/image.png)\n\n<script>alert(1)</script>');await expect(page.getByTestId('preview').locator('img,script')).toHaveCount(0);await page.getByRole('button',{name:'Live Preview view',exact:true}).click();await expect(page.getByRole('textbox',{name:'Live preview editor'}).locator('img:not(.cm-widgetBuffer),script,[src]')).toHaveCount(0);await expect(page.getByRole('textbox',{name:'Live preview editor'}).locator('.lp-image')).toContainText('not loaded');expect(network).toEqual([]);
 const security=await page.evaluate(()=>({node:typeof (window as unknown as {require?:unknown}).require,isolated:typeof window.lina.file==='function'}));expect(security.node).toBe('undefined');expect(security.isolated).toBe(true);
});

test('recovers unsaved edits after an unexpected app exit',async()=>{
 await text('# Recovery\n\nHjörtur’s unsaved words.');
 await expect.poll(()=>readFile(path.join(directory,'recovery.json'),'utf8').catch(()=>'')).toContain('unsaved words');
 const closed=app.waitForEvent('close');app.process().kill('SIGKILL');await closed;
 app=await electron.launch({args:[path.resolve('.')],env:{...process.env,LINA_USER_DATA:directory}});page=await app.firstWindow();
 await expect(page.getByTestId('preview')).toContainText('Hjörtur’s unsaved words.');await expect(page.getByText('Recovered your unsaved draft.')).toBeVisible();await expect(page.getByLabel('Unsaved changes')).toBeVisible();
});

test('editable Live Preview preserves Markdown, history and file saves',async()=>{
 const original='# Heading\n\nA **bold** word and _italic_ text.\n\n- [ ] Do the thing\n\nLast paragraph.';
 await text(original);await page.getByRole('button',{name:'Live Preview view',exact:true}).click();
 const live=page.getByRole('textbox',{name:'Live preview editor'});await expect(live).toBeVisible();await expect(live.locator('.lp-h1')).toContainText('Heading');await expect(live.locator('.lp-strong')).toHaveText('bold');await expect(live.locator('.lp-emphasis')).toHaveText('italic');
 await live.getByRole('checkbox',{name:'Toggle task'}).check();await expect(live.getByRole('checkbox',{name:'Toggle task'})).toBeChecked();
 await live.click();await page.keyboard.press('Meta+End');await page.keyboard.insertText(' More words.');await expect(page.getByLabel('Unsaved changes')).toBeVisible();
 await page.getByRole('button',{name:'Source view',exact:true}).click();await expect(page.getByRole('textbox',{name:'Markdown source'})).toContainText('A **bold** word');await expect(page.getByRole('textbox',{name:'Markdown source'})).toContainText('- [x] Do the thing');
 await page.getByRole('textbox',{name:'Markdown source'}).click();await page.keyboard.press('Meta+z');await expect(page.getByRole('textbox',{name:'Markdown source'})).not.toContainText('More words.');
 await page.getByRole('button',{name:'Live Preview view',exact:true}).click();await live.click();await page.keyboard.press('Meta+Shift+z');
 const file=path.join(directory,'live-preview.md');await app.evaluate(({dialog},value)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:value});},file);await page.keyboard.press('Meta+s');await expect.poll(()=>readFile(file,'utf8').catch(()=>'')).toBe(original.replace('[ ]','[x]')+' More words.');
 await page.getByRole('button',{name:'Reading view',exact:true}).click();await expect(page.getByTestId('preview')).toContainText('More words.');await expect(live).toBeHidden();
 await page.getByRole('button',{name:'Live Preview view',exact:true}).click();await live.locator('.cm-line').filter({hasText:'Heading'}).click();await expect(live.locator('.lp-h1')).toContainText('# Heading');
 await page.getByRole('button',{name:'Live Preview view',exact:true}).focus();await expect(live.locator('.lp-h1')).toHaveText('Heading');await page.screenshot({path:'test-results/lina-live-preview.png'});
});
test('AI suggestions accepted in Live Preview remain undoable',async()=>{
 await text('# Original\n\nMy words.');await page.keyboard.press('ArrowRight');await settings();await page.getByRole('button',{name:'Live Preview view',exact:true}).click();await suggest();await page.getByRole('button',{name:'Accept suggestion'}).click();
 const live=page.getByRole('textbox',{name:'Live preview editor'});await expect(live).toContainText('Suggested');await page.keyboard.press('Meta+z');await expect(live).toContainText('Original');
 await page.getByRole('button',{name:'Split view',exact:true}).click();await expect(page.getByTestId('preview')).toContainText('Original');
});

async function selectMiddle(){
 const source=page.getByRole('textbox',{name:'Markdown source'});await source.click();await page.keyboard.press('Meta+Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await page.keyboard.press('Home');await page.keyboard.press('Shift+End');
 await expect(page.getByRole('dialog',{name:'Edit selected text with AI'})).toBeVisible();
}
test('selection prompt survives view changes and edits only its passage with review and undo',async()=>{
 const original='Keep this introduction.\n\nThis sentence could use more warmth.\n\nKeep this closing thought.';
 const selected='This sentence could use more warmth.';
 await text(original);await settings();await selectMiddle();const pill=page.getByRole('dialog',{name:'Edit selected text with AI'});
 await pill.getByRole('textbox',{name:'Editing instruction'}).fill('Gerðu þennan texta hlýlegri á íslensku');expect(uploaded).toEqual([]);
 await page.getByRole('button',{name:'Live Preview view',exact:true}).click();await expect(pill.getByRole('textbox',{name:'Editing instruction'})).toHaveValue('Gerðu þennan texta hlýlegri á íslensku');
 await expect(page.getByRole('button',{name:'Live Preview view',exact:true})).toHaveAttribute('aria-pressed','true');await expect.poll(async()=>{const box=await pill.boundingBox();const line=await page.getByRole('textbox',{name:'Live preview editor'}).locator('.cm-line').filter({hasText:selected}).boundingBox();return !!(box&&line&&Math.abs(box.x-line.x)<5&&box.y+box.height<=line.y);}).toBe(true);await page.screenshot({path:'test-results/lina-selection-pill.png',animations:'disabled'});
 await pill.getByRole('button',{name:'Suggest edit',exact:true}).click();const review=page.getByRole('dialog',{name:'Review AI suggestion'});await expect(review).toBeVisible();await expect(review.locator('.comparison pre').first()).toHaveText(selected);await page.getByRole('button',{name:'Reject',exact:true}).click();await expect(page.getByTestId('preview')).toContainText(selected);
 await pill.getByRole('button',{name:'Suggest edit',exact:true}).click();await page.getByRole('button',{name:'Accept suggestion'}).click();
 const file=path.join(directory,'selected-edit.md');await app.evaluate(({dialog},value)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:value});},file);await page.keyboard.press('Meta+s');await expect.poll(()=>readFile(file,'utf8').catch(()=>'')).toBe(original.replace(selected,'# Suggested\n\nClearer words.'));
 await page.getByRole('textbox',{name:'Live preview editor'}).click();await page.keyboard.press('Meta+z');await page.keyboard.press('Meta+s');await expect.poll(()=>readFile(file,'utf8').catch(()=>'')).toBe(original);
 expect(uploaded).toEqual([selected,selected]);expect(instructions.every(value=>value.includes('Gerðu þennan texta hlýlegri á íslensku'))).toBe(true);
});
test('a delayed selection edit cannot replace newer writing',async()=>{
 await text('Before.\n\nChange this.\n\nAfter.');await settings();await selectMiddle();await page.getByRole('textbox',{name:'Editing instruction'}).fill('Shorten this');delay=true;await page.getByRole('button',{name:'Suggest edit',exact:true}).click();
 await page.getByRole('textbox',{name:'Markdown source'}).click();await page.keyboard.press('Meta+End');await page.keyboard.insertText(' My new words.');await expect(page.getByRole('alert')).toContainText('document changed');await expect(page.getByRole('dialog',{name:'Review AI suggestion'})).toHaveCount(0);await expect(page.getByTestId('preview')).toContainText('My new words.');expect(uploaded).toEqual(['Change this.']);
});
test('setting up AI preserves the selection prompt and never sends automatically',async()=>{
 await text('Before.\n\nChange this.\n\nAfter.');await selectMiddle();await page.getByRole('textbox',{name:'Editing instruction'}).fill('Make this friendlier');await page.getByRole('button',{name:'Set up AI',exact:true}).click();await expect(page.getByRole('dialog',{name:'AI settings'})).toBeVisible();
 await page.getByRole('combobox',{name:'AI provider'}).selectOption('custom');await page.getByRole('textbox',{name:'Base URL'}).fill(endpoint);await page.getByRole('textbox',{name:'Model',exact:true}).fill('mock-model');await page.getByRole('button',{name:'Save settings'}).click();
 await expect(page.getByRole('textbox',{name:'Editing instruction'})).toHaveValue('Make this friendlier');expect(uploaded).toEqual([]);await page.getByRole('button',{name:'Suggest edit',exact:true}).click();await expect(page.getByRole('dialog',{name:'Review AI suggestion'})).toBeVisible();expect(uploaded).toEqual(['Change this.']);
});
test('provider settings retain separate models and credentials without any AI calls',async()=>{
 await page.getByRole('button',{name:'AI settings',exact:true}).click();await expect(page.getByRole('combobox',{name:'AI provider'})).toHaveValue('openai');await expect(page.getByRole('textbox',{name:'Base URL'})).toHaveCount(0);
 await page.getByRole('textbox',{name:'Model',exact:true}).fill('openai-test-model');await page.getByRole('textbox',{name:'API key',exact:true}).fill('fake-openai-session-key');await page.getByRole('button',{name:'Save settings'}).click();
 await page.getByRole('button',{name:'AI settings',exact:true}).click();await page.getByRole('combobox',{name:'AI provider'}).selectOption('anthropic');await expect(page.getByRole('textbox',{name:'API key',exact:true})).toHaveValue('');await expect(page.getByRole('textbox',{name:'Model',exact:true})).toHaveValue('');await page.getByRole('textbox',{name:'Model',exact:true}).fill('claude-test-model');await page.getByRole('textbox',{name:'API key',exact:true}).fill('fake-anthropic-session-key');await page.getByRole('button',{name:'Save settings'}).click();
 await page.getByRole('button',{name:'AI settings',exact:true}).click();await page.getByRole('combobox',{name:'AI provider'}).selectOption('openai');await expect(page.getByRole('textbox',{name:'Model',exact:true})).toHaveValue('openai-test-model');await expect(page.getByRole('textbox',{name:'API key',exact:true})).toHaveValue('');await page.getByRole('button',{name:'Save settings'}).click();
 const preferences=await page.evaluate(()=>window.lina.settings());expect(preferences.profiles.filter(value=>value.hasKey).map(value=>value.provider)).toEqual(['openai','anthropic']);expect(JSON.stringify(preferences)).not.toContain('session-key');expect(await readFile(path.join(directory,'preferences.json'),'utf8')).not.toContain('session-key');expect(uploaded).toEqual([]);
});
test('selection pill stays inside the editor on resize and dismisses with Escape',async()=>{
 await text('Before.\n\nChange this.\n\nAfter.'+'\n\nMore text.'.repeat(100));await selectMiddle();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(820,560));const pill=page.getByRole('dialog',{name:'Edit selected text with AI'});await expect(pill).toBeVisible();
 await expect.poll(async()=>{const box=await pill.boundingBox();const editor=await page.locator('.cm-scroller').boundingBox();return !!(box&&editor&&box.x>=editor.x&&box.x+box.width<=editor.x+editor.width&&box.y>=editor.y&&box.y+box.height<=editor.y+editor.height);}).toBe(true);
 await pill.getByRole('textbox',{name:'Editing instruction'}).fill('A draft prompt');await page.locator('.cm-scroller').evaluate(el=>{el.scrollTop=el.scrollHeight;});await expect(pill).toHaveCount(0);await page.locator('.cm-scroller').evaluate(el=>{el.scrollTop=0;});await expect(pill.getByRole('textbox',{name:'Editing instruction'})).toHaveValue('A draft prompt');await pill.getByRole('textbox',{name:'Editing instruction'}).focus();await page.keyboard.press('Escape');await expect(pill).toHaveCount(0);expect(uploaded).toEqual([]);
});
