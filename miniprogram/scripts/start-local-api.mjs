import { PGlite } from '@electric-sql/pglite';
import { createServer } from 'pglite-server';
import { spawn } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const website=resolve(process.argv[2]||join(root,'..'));
const db=new PGlite();await db.waitReady;
const server=createServer(db);
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(55432,'127.0.0.1',resolve);});
const env={...process.env,DATABASE_URL:'postgres://postgres:test@127.0.0.1:55432/postgres',DIRECT_URL:'postgres://postgres:test@127.0.0.1:55432/postgres',DATABASE_POOL_MAX:'1',NO_PROXY:'localhost,127.0.0.1,::1'};
function run(args){return spawn(process.execPath,args,{cwd:website,env,stdio:'inherit',windowsHide:true});}
for(const command of ['migrate','check']) {
  const migration=run(['scripts/manage-database.mjs',command]);
  const code=await new Promise(resolve=>migration.on('exit',resolve));
  if(code!==0){server.close();await db.close();process.exit(1);}
}
console.log('Isolated local PostgreSQL test database ready. Starting API at http://127.0.0.1:3210');
const app=run(['node_modules/next/dist/bin/next','dev','--webpack','-p','3210','-H','127.0.0.1']);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{app.kill();server.close();void db.close();});
app.on('exit',()=>{server.close();void db.close();});
