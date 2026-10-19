// Run an exact source snapshot in a separate DevTools project. This avoids
// recompiles caused by editing the active project's private configuration.
const {existsSync,readFileSync,writeFileSync,cpSync,mkdtempSync}=require('node:fs');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const file=path.join(root,'project.private.config.json');
const before=existsSync(file)?readFileSync(file,'utf8'):'{"setting":{}}';
const snapshot=mkdtempSync(path.join(require('node:os').tmpdir(),'aitrainer-acceptance-project-'));
const cli=process.env.WECHAT_DEVTOOLS_CLI||'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat';
const automationPort=9421;
const quote=value=>"'"+value.replace(/'/g,"''")+"'";
try{
 for(const name of ['app.js','app.json','app.wxss','config.js','sitemap.json','data','utils','pages','components','project.config.json'])cpSync(path.join(root,name),path.join(snapshot,name),{recursive:true});
 const config=JSON.parse(before);config.setting={...config.setting,urlCheck:false,compileHotReLoad:false};
 config.projectname='训练师小程序自动验收';
 writeFileSync(path.join(snapshot,'project.private.config.json'),JSON.stringify(config,null,2)+'\n');
 console.log('DevTools source snapshot:',snapshot);
 const launch=spawnSync('powershell.exe',['-NoProfile','-Command',`& ${quote(cli)} auto --project ${quote(snapshot)} --auto-port ${automationPort} --trust-project`],{stdio:'inherit',windowsHide:true});
 if(launch.status!==0)throw new Error('WeChat DevTools automation launch failed');
 const options={stdio:'inherit',windowsHide:true,env:{...process.env,WECHAT_AUTOMATION_PORT:String(automationPort),WECHAT_ACCEPTANCE_PROJECT:snapshot}};
 const run=(script,args=[])=>spawnSync(process.execPath,[path.join(__dirname,script),...args],options);
 // Project close/reopen is a separate diagnostic: this DevTools version may
 // discard the automation storage profile, including unrelated wx storage.
 const test=run(process.argv.includes('--restart-only')?'test-devtools-restart.cjs':process.argv.includes('--ux-only')?'test-devtools-ux.cjs':process.argv.includes('--theory-only')?'test-devtools-theory.cjs':'test-devtools.cjs');
 process.exitCode=test.status|| (test.error?1:0);
}finally{
 spawnSync('powershell.exe',['-NoProfile','-Command',`& ${quote(cli)} close --project ${quote(snapshot)}`],{stdio:'inherit',windowsHide:true});
 console.log('The original project configuration was not changed.');
}
