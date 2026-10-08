const { _electron: electron } = require('@playwright/test');
const path=require('node:path');const fs=require('node:fs/promises');
(async()=>{
 const executablePath=path.resolve('release/mac-arm64/Lína.app/Contents/MacOS/Lína');
 const app=await electron.launch({executablePath});
 try{
  const page=await app.firstWindow();await page.getByTestId('preview').waitFor();
  const details=await app.evaluate(({app})=>({packaged:app.isPackaged,version:app.getVersion(),platform:process.platform,architecture:process.arch}));
  if(!details.packaged)throw new Error('Expected the packaged app.');
  await page.getByRole('button',{name:'Preview view',exact:true}).click();
  if(await page.getByLabel('Source pane').isVisible())throw new Error('Preview view did not switch.');
  await page.getByRole('button',{name:'Split view',exact:true}).click();
  await page.screenshot({path:'test-results/lina-packaged.png'});
  await page.getByRole('button',{name:'AI settings',exact:true}).click();
  await page.getByRole('dialog',{name:'AI settings'}).waitFor();
  await page.screenshot({path:'test-results/lina-settings.png'});
  await page.getByRole('button',{name:'Close settings'}).click();
  await fs.writeFile('test-results/packaged-smoke.json',JSON.stringify({...details,preview:true,viewSwitching:true,settings:true},null,2));
  console.log(JSON.stringify(details));
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
