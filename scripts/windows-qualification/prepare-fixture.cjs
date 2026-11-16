// Uses existing owners and portable Project packages, never a second profile/store model.
const path=require('node:path'),fs=require('node:fs'),Module=require('node:module').Module;
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),out=path.resolve(process.argv[2]||path.join(root,'tests/windows-qualification/fixture'));
function compile(relative) {
 const filename=path.join(root,relative),m=new Module(filename);
 const {outputFiles}=require(path.join(root,'renderer/node_modules/esbuild')).buildSync({entryPoints:[filename],bundle:true,platform:'node',format:'cjs',write:false,alias:{'@math3d/core':path.join(root,'packages/core/src/index.ts'),'@math3d/kernel':path.join(root,'packages/kernel/src/index.ts')}});
 m._compile(outputFiles[0].text,filename);return m.exports;
}
const owners=compile('tests/fixtures/unified-projects/meshResources.ts'),freeze=compile('tests/fixtures/unified-projects/projectFreeze.ts');
const mesh=owners.meshResourceFixture(),mixed=freeze.projectFreezeFixture();
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'mesh.resources.json'),mesh.raw);fs.writeFileSync(path.join(out,'mixed.resources.json'),mixed.raw);
fs.writeFileSync(path.join(out,'recovery.json'),JSON.stringify({fixtureSourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),raw:mesh.raw,documentId:mesh.docs[0].identity.id,historicalResult:mesh.result},null,2)+'\n');
const packets=[['mesh.resources.json',mesh],['mixed.resources.json',mixed]].map(([file,x])=>({file,projectId:x.project.identity.id,documentIds:x.project.workspace.entries.map(e=>e.expected.id),historicalResultIds:x.project.workspace.results.map(r=>r.resultId),resourceCount:JSON.parse(x.raw).resources.length}));
fs.writeFileSync(path.join(out,'profile-seed.json'),JSON.stringify({schema:'math3d.windows-qualification-profile-seed/v1',fixtureSourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),status:'prepared-not-executed',packets,applicationUserData:'Created by installed application through UI import/save only',profilePolicy:'A fresh disposable run root; never default LOCALAPPDATA, no copied LevelDB or synthetic localStorage'},null,2)+'\n');
console.log(JSON.stringify({status:'prepared-not-executed',projects:packets.length,resourceSidecars:packets.reduce((n,p)=>n+p.resourceCount,0)}));
