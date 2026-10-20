// Integração de interface com servidor simulado. NÃO comprova gravação Google.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json'));
const { chromium } = require('playwright');
const browser = await chromium.launch({headless:true,channel:'chrome',args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
const context = await browser.newContext({viewport:{width:1440,height:1080}});
const page = await context.newPage();
const errors=[]; page.on('pageerror',error => errors.push(error.message));
const catalogs={setores:[{ID:'s1',NOME_SETOR:'Sala Amarela',ATIVO:'SIM'},{ID:'s2',NOME_SETOR:'Sala Azul',ATIVO:'SIM'}],tipos:[{ID:'t1',NOME_TIPO:'Desktop',ATIVO:'SIM'},{ID:'t2',NOME_TIPO:'Monitor',ATIVO:'SIM'}],modelos:[{ID:'m1',TIPO:'Desktop',FABRICANTE:'Dell',MODELO:'OptiPlex 3080',ATIVO:'SIM'},{ID:'m2',TIPO:'Monitor',FABRICANTE:'Dell',MODELO:'P2219H',ATIVO:'SIM'}]};
const records=[]; const messages=new Map();
let dropNextSaveReply = false;
const indicators=() => ({total:records.length,today:records.length,setores:records.reduce((r,e) => ({...r,[e.SETOR]:(r[e.SETOR]||0)+1}),{}),tipos:records.reduce((r,e) => ({...r,[e.TIPO]:(r[e.TIPO]||0)+1}),{})});
await context.route('http://localhost:4173/**',async route => {
  const relative = new URL(route.request().url()).pathname.slice(1) || 'index.html';
  const body = await fs.readFile(new URL('../'+relative,import.meta.url));
  await route.fulfill({body,contentType:relative.endsWith('.css')?'text/css':relative.endsWith('.js')?'text/javascript':'text/html'});
});
await context.route('https://fonts.googleapis.com/**',route => route.abort());
await context.route('https://accounts.google.com/gsi/client',route => route.fulfill({contentType:'text/javascript',body:`window.google={accounts:{id:{initialize(config){this.callback=config.callback},renderButton(target){let b=document.createElement('button');b.textContent='Entrar com Google (teste)';b.onclick=()=>this.callback({credential:'test-token'});target.append(b)},disableAutoSelect(){}}}};`}));
await context.route('**/config.js',route => route.fulfill({contentType:'text/javascript',body:`window.INVENTARIO_CONFIG={appsScriptUrl:'https://script.google.com/macros/s/test/exec',googleClientId:'test.apps.googleusercontent.com',requestTimeoutMs:5000};`}));
await context.route('https://script.google.com/macros/s/test/exec',async route => {
  const request=JSON.parse(new URLSearchParams(route.request().postData()).get('payload'));
  let data; const d=request.data;
  switch(request.action){
    case 'bootstrap': data={catalogs,indicators:indicators(),email:'operator@example.com'};break;
    case 'catalogs': data=catalogs;break;
    case 'indicators': data=indicators();break;
    case 'find': data=records.find(r=>r.CODIGO_BARRAS===d.code)||null;break;
    case 'saveCatalog': {
      const list=catalogs[{SETORES:'setores',TIPOS:'tipos',MODELOS:'modelos'}[d.entity]];
      data={ID:d.id||'new-'+list.length,ATIVO:d.ativo?'SIM':'NAO'};
      if(d.entity==='MODELOS') Object.assign(data,{TIPO:catalogs.tipos.find(t=>t.ID===d.tipoId).NOME_TIPO,FABRICANTE:d.fabricante,MODELO:d.nome});
      else data[d.entity==='SETORES'?'NOME_SETOR':'NOME_TIPO']=d.nome;
      if(d.id) Object.assign(list.find(r=>r.ID===d.id),data);else list.push(data);break;
    }
    case 'saveEquipment':case 'updateEquipment':{
      const model=catalogs.modelos.find(r=>r.ID===d.modeloId);
      data={ID:d.id||'eq-'+records.length,_version:Math.random().toString(),DATA:'2026-10-20',HORA:'11:00:00',CODIGO_BARRAS:d.codigo,PATRIMONIO:d.patrimonio,SETOR:catalogs.setores.find(r=>r.ID===d.setorId).NOME_SETOR,TIPO:model.TIPO,FABRICANTE:model.FABRICANTE,MODELO:model.MODELO,OBSERVACAO:d.observacao};
      if(d.id) Object.assign(records.find(r=>r.ID===d.id),data);else records.push(data);break;
    }
    case 'query': {
      const matches=records.filter(r=>(!d.search||r.CODIGO_BARRAS.includes(d.search)||r.PATRIMONIO?.includes(d.search))&&(!d.setor||r.SETOR===d.setor)&&(!d.tipo||r.TIPO===d.tipo)&&(!d.modelo||r.MODELO===d.modelo));
      data={total:records.length,matched:matches.length,items:matches.slice(d.offset||0,(d.offset||0)+50)};break;
    }
    default: throw new Error('Unexpected action '+request.action);
  }
  messages.set(request.requestId,{channel:'inventario-ti-v1',requestId:request.requestId,ok:true,data});
  if (request.action === 'saveEquipment' && dropNextSaveReply) {
    dropNextSaveReply = false;
    await route.fulfill({contentType:'text/html',body:'<!doctype html><p>Resposta interrompida para o teste.</p>'});
    return;
  }
  await route.fulfill({contentType:'text/html',body:`<iframe src="https://test-script.googleusercontent.com/relay?id=${request.requestId}"></iframe>`});
});
await context.route('https://test-script.googleusercontent.com/relay?*',route=>{
  const id=new URL(route.request().url()).searchParams.get('id');
  return route.fulfill({contentType:'text/html',body:`<script>top.postMessage(${JSON.stringify(messages.get(id)).replace(/</g,'\\u003c')},'http://localhost:4173');</script>`});
});
const wait=selector=>page.waitForSelector(selector,{timeout:10000});
const click=action=>page.locator(`[data-action="${action}"]`).first().click();
try {
  await page.goto('http://localhost:4173');
  await page.getByText('Entrar com Google (teste)',{exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#auth-panel').hidden);
  await fs.mkdir('outputs/ui',{recursive:true});
  await page.evaluate(()=>{document.querySelector('#toast').hidden=true;window.scrollTo(0,0);});
  await page.screenshot({path:'outputs/ui/desktop.png',fullPage:true});
  await click('go-inventory');await wait('#start-sector');await page.selectOption('#start-sector','s1');await click('start-sector');
  assert.equal(await page.locator('#setorId').isDisabled(),true);
  await page.fill('#codigo','000123');await page.fill('#patrimonio','0099');await page.selectOption('#tipoId','t2');
  await click('new-model');await wait('#catalog-form');
  assert.equal(await page.inputValue('#catalog-type'),'t2');
  await page.fill('#catalog-manufacturer','LG');await page.fill('#catalog-name','22MK400H');
  await page.locator('#catalog-form button[type=submit]').click();
  await page.waitForFunction(()=>!document.querySelector('#modal').open);
  assert.equal(await page.inputValue('#codigo'),'000123');assert.equal(await page.inputValue('#patrimonio'),'0099');assert.equal(await page.inputValue('#fabricante'),'LG');
  await page.locator('button[value=next]').click();
  await page.waitForFunction(()=>document.querySelector('#codigo').value==='');
  assert.equal(records.length,1);assert.equal(records[0].SETOR,'Sala Amarela');assert.equal(await page.inputValue('#setorId'),'s1');
  await page.fill('#codigo','000123');await page.press('#codigo','Enter');await wait('#modal[open]');
  assert.match(await page.locator('#modal').innerText(),/EQUIPAMENTO JÁ INVENTARIADO/);
  await click('duplicate-edit');await wait('#equipment-form');await page.selectOption('#setorId','s2');
  await page.locator('button[value=stay]').click();
  await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Alterações confirmadas'));
  assert.equal(records.length,1);assert.equal(records[0].SETOR,'Sala Azul');
  await click('finish');await click('confirm-finish');await wait('.hero');await click('go-inventory');await click('start-individual');
  await page.fill('#codigo','NEW02');await page.selectOption('#setorId','s2');await page.selectOption('#tipoId','t1');await page.selectOption('#modeloId','m1');
  await page.locator('button[value=next]').click();await page.waitForFunction(()=>document.querySelector('#codigo').value==='');
  assert.equal(await page.inputValue('#setorId'),'');assert.equal(records.length,2);
  await click('new-sector');await page.fill('#catalog-name','Sala Verde');await page.locator('#catalog-form button[type=submit]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);
  assert.equal(await page.inputValue('#setorId'),'new-2');
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{document.querySelector('#toast').hidden=true;window.scrollTo(0,0);});
  await page.screenshot({path:'outputs/ui/mobile-inventory.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Sem rolagem horizontal em celular');
  const manualSector=await page.inputValue('#setorId');
  const manualModel=await page.inputValue('#modeloId');
  await click('scan');await page.waitForFunction(()=>document.querySelector('#camera').srcObject?.active,null,{timeout:10000});
  await page.screenshot({path:'outputs/ui/camera-manual.png'});
  await page.locator('#manual-camera').click();
  assert.equal(await page.evaluate(()=>document.querySelector('#camera').srcObject),null);
  assert.equal(await page.locator('#camera-dialog').evaluate(dialog=>dialog.open),false);
  assert.equal(await page.locator('#codigo').evaluate(input=>document.activeElement===input),true);
  assert.equal(await page.inputValue('#setorId'),manualSector);
  assert.equal(await page.inputValue('#modeloId'),manualModel);
  await page.fill('#codigo','000MANUAL123');assert.equal(await page.inputValue('#codigo'),'000MANUAL123');
  await page.fill('#codigo','');await click('manual-entry');
  assert.equal(await page.locator('#codigo').evaluate(input=>document.activeElement===input),true);
  await page.locator('[data-nav=consulta]').click();await page.waitForFunction(()=>document.querySelector('#query-results').textContent.includes('encontrados'));
  await page.fill('#query-search','0099');await page.waitForFunction(()=>document.querySelector('#query-results').textContent.includes('1 equipamento encontrado'));
  await page.locator('[data-nav=cadastros]').click();await wait('#catalog-list');
  await page.fill('#catalog-search','22MK');assert.match(await page.locator('#catalog-list').innerText(),/22MK400H/);
  await click('catalog-tab');await page.fill('#catalog-search','LG');await click('toggle-catalog');await click('confirm-toggle');
  await page.waitForFunction(()=>!document.querySelector('#modal').open);assert.equal(catalogs.modelos.find(r=>r.MODELO==='22MK400H').ATIVO,'NAO');
  await page.locator('[data-nav=inicio]').click();
  await page.evaluate(()=>{document.querySelector('#toast').hidden=true;window.scrollTo(0,0);});
  await page.screenshot({path:'outputs/ui/mobile-home.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('[data-nav=inventario]').click();await wait('#equipment-form');
  await page.fill('#codigo','RETRY03');await page.selectOption('#setorId','s1');
  dropNextSaveReply=true;
  await page.locator('button[value=next]').click();
  await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Sem confirmação'),{timeout:10000});
  assert.equal(await page.inputValue('#codigo'),'RETRY03','Timeout preserva o formulário');
  assert.equal(records.length,3);
  await page.locator('button[value=next]').click();await wait('#modal[open]');
  assert.match(await page.locator('#modal').innerText(),/EQUIPAMENTO JÁ INVENTARIADO/);
  assert.equal(records.length,3,'Repetir após timeout não cria outra linha');
  // Cenário sem configuração independente dos identificadores reais de produção.
  await context.route('**/config.js',route => route.fulfill({contentType:'text/javascript',body:'window.INVENTARIO_CONFIG={};'}));
  const publicPage = await context.newPage();
  await publicPage.goto('http://localhost:4173');
  assert.match(await publicPage.locator('#auth-title').innerText(),/aguardando configuração/);
  assert.equal(await publicPage.locator('.stat strong').first().innerText(),'—');
  await publicPage.screenshot({path:'outputs/ui/preview-sem-integracao.png',fullPage:true});
  await publicPage.locator('[data-action=go-inventory]').first().click();
  await publicPage.locator('[data-action=start-individual]').click();
  assert.equal(await publicPage.locator('#equipment-form').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: POST em iframe com relay de origem validada; login simulado; dois modos; modelo e setor em sessão; salvar/próximo; duplicado; editar; filtros; câmera virtual encerrada; celular sem overflow; timeout sem falso sucesso e repetição sem duplicar; integração não configurada bloqueia gravação.');
  console.log('Google Sheets real e câmera física NÃO testados por este teste.');
} finally { await browser.close(); }
