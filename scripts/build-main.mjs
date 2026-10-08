import {build} from 'esbuild';
await build({entryPoints:['src/main/index.ts'],bundle:true,platform:'node',format:'cjs',external:['electron'],outfile:'dist/main/index.cjs'});
await build({entryPoints:['src/main/preload.ts'],bundle:true,platform:'node',format:'cjs',external:['electron'],outfile:'dist/main/preload.cjs'});
