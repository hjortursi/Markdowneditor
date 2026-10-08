import {test,expect,_electron as electron,type ElectronApplication,type Page} from '@playwright/test';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {createServer,type Server} from 'node:http';
import os from 'node:os';import path from 'node:path';
let app:ElectronApplication;let page:Page;let directory:string;let server:Server;let endpoint:string;let uploaded:string[];let delay=false;
test.beforeEach(async()=>{
 directory=await mkdtemp(path.join(os.tmpdir(),'lina-e2e-'));uploaded=[];delay=false;
 server=createServer((req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{const payload=JSON.parse(body);uploaded.push(payload.messages[1].content);const reply=()=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:'# Suggested\n\nClearer words.'}}]}));};if(delay)setTimeout(reply,700);else reply();});});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));endpoint=`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`;
 app=await electron.launch({args:[path.resolve('.')],env:{...process.env,LINA_USER_DATA:directory}});page=await app.firstWindow();await expect(page.getByRole('textbox',{name:'Live preview editor'})).toBeVisible();await page.getByRole('button',{name:'Split view',exact:true}).click();await expect(page.getByTestId('preview')).toContainText('A little room to think');
});
test.afterEach(async()=>{if(app){await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:2,checkboxChecked:false});});await app.close();}await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true});});
async function text(value:string){await page.getByRole('textbox',{name:'Markdown source'}).click();await page.keyboard.press('Meta+a');await page.keyboard.insertText(value);}
async function settings(){await page.getByRole('button',{name:'AI settings',exact:true}).click();await page.getByRole('textbox',{name:'Base URL'}).fill(endpoint);await page.getByRole('textbox',{name:'Model',exact:true}).fill('mock-model');await page.getByRole('button',{name:'Save settings'}).click();}
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
