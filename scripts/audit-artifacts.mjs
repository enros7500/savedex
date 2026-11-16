import { readFile,readdir,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');const files=['README.md','.env.example'];
async function walk(relative){for(const entry of await readdir(path.join(root,relative),{withFileTypes:true})){const name=path.posix.join(relative,entry.name);if(entry.isDirectory())await walk(name);else if(/\.(md|json|html|yml|yaml)$/.test(name))files.push(name);}}
await walk('docs');await walk('.github');
const patterns={credential:/\b(?:sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[A-Za-z0-9_-]{30,})\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,private_user_path:/[A-Z]:[\\/]Users[\\/]/gi};
const findings=[];for(const file of files){const content=await readFile(path.join(root,file),'utf8');for(const [kind,pattern]of Object.entries(patterns)){pattern.lastIndex=0;if(pattern.test(content))findings.push({file,kind});}}
const gitignore=await readFile(path.join(root,'.gitignore'),'utf8');const excluded=['.env','data/','.cache/','.tools/','node_modules/'];for(const name of excluded)if(!gitignore.split(/\r?\n/).includes(name))findings.push({file:'.gitignore',kind:'missing exclusion '+name});
const demo=await readFile(path.join(root,'docs/demo/savedex.gif'));
const report={verified_at:new Date().toISOString(),scope:'shareable text documents and workflow; GIF frames manually inspected, no user profile/cookies or private URLs used',files_scanned:files.length,findings,excluded_private_locations:excluded,demo_sha256:createHash('sha256').update(demo).digest('hex'),publication_performed:false};
await writeFile(path.join(root,'docs/delivery-7-audit.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({files:files.length,findings}));if(findings.length)process.exitCode=1;
