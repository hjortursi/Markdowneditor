const fs=require('node:fs/promises');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
// Electron 44 on macOS 26 still resolves its default helper bundle names.
// Restore those names before signing. See electron-builder issue #9771.
exports.default=async context=>{
 if(context.electronPlatformName!=='darwin')return;
 const product=context.packager.appInfo.productFilename;
 const frameworks=path.join(context.appOutDir,product+'.app','Contents','Frameworks');
 for(const suffix of ['',' (GPU)',' (Renderer)',' (Plugin)']){
  const branded=product+' Helper'+suffix;
  const original='Electron Helper'+suffix;
  const directory=path.join(frameworks,original+'.app');
  await fs.rename(path.join(frameworks,branded+'.app'),directory);
  await fs.rename(path.join(directory,'Contents','MacOS',branded),path.join(directory,'Contents','MacOS',original));
  execFileSync('/usr/bin/plutil',['-replace','CFBundleExecutable','-string',original,path.join(directory,'Contents','Info.plist')]);
 }
};
