import { spawn } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
const keys=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SESSION_KEY'];
if (keys.some(key=>!process.env[key]) || process.env.SESSION_KEY.length<32 || !process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) throw new Error('Secrets serveur manquants. Aucun déploiement effectué.');
const config='deploy/wrangler-accounts.json';
function run(args, input) {
 return new Promise((resolve,reject)=>{
  const child=spawn('npx',['--no-install','wrangler',...args],{stdio:['pipe','pipe','pipe'],env:process.env});
  let output=''; child.stdout.on('data',d=>{output+=d;}); child.stderr.on('data',()=>{});
  child.on('error',reject);child.on('close',code=>code===0?resolve(output):reject(new Error('Déploiement refusé ; vérifier la configuration Cloudflare sans modifier le plan.')));
  child.stdin.end(input);
 });
}
// First publication exposes only the login shell; API fails closed until secrets are set.
const output=await run(['deploy','--config',config]);
await run(['secret','bulk','--config',config],JSON.stringify(Object.fromEntries(keys.map(k=>[k,process.env[k]]))));
const url=output.match(/https:\/\/mimmo-comptes-preview\.[a-z0-9-]+\.workers\.dev\b/i)?.[0];
if (!url) throw new Error('Adresse non détectée. Consulter le Worker mimmo-comptes-preview.');
const response=await fetch(url+'/api/properties');
if(response.status!==401) throw new Error('Contrôle anonyme échoué. Ne pas utiliser cet aperçu.');
if(process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,`Aperçu comptes : ${url}\n\nAPI anonyme refusée (401). Tester inscription, confirmation email et persistance avec deux comptes.\n`);
console.log(`Aperçu comptes : ${url}`);
