// Diagnóstico público: não envia login e não grava equipamentos.
import fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const config = await fs.readFile(new URL('../config.js',import.meta.url),'utf8');
const endpoint = config.match(/appsScriptUrl:\s*'([^']+)'/)?.[1];
if (!endpoint) throw new Error('URL do Apps Script não configurada.');
await fs.mkdir('outputs/live',{recursive:true});
for (const method of ['GET','POST']) {
  const options = method === 'POST' ? {method,body:new URLSearchParams({payload:JSON.stringify({action:'bootstrap',data:{},origin:'https://uparochamiranda.github.io',requestId:randomBytes(32).toString('hex'),token:''})})} : {};
  const response = await fetch(endpoint,{...options,signal:AbortSignal.timeout(30000)});
  const html = await response.text();
  await fs.writeFile(`outputs/live/${method.toLowerCase()}.html`,html);
  const init = html.match(/goog\.script\.init\(("(?:\\.|[^"\\])*")/);
  let userHtml;
  if (init) {
    const jsonString = init[1].replace(/\\x([0-9a-f]{2})/gi, (_,hex) => '\\u00'+hex);
    userHtml = JSON.parse(JSON.parse(jsonString)).userHtml;
  }
  console.log(JSON.stringify({method,status:response.status,url:response.url,userHtml:userHtml ?? html.slice(0,1800)}));
}
