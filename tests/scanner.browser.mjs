// Decodificação real no navegador. Uma imagem local opcional pode ser enviada
// como argumento; ela permanece local e não é incluída no repositório público.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json'));
const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'});
try {
  const page=await browser.newPage();
  await page.route('http://localhost:4173/**',async route=>{
    const relative=new URL(route.request().url()).pathname.slice(1);
    if(!relative) return route.fulfill({body:'<!doctype html>',contentType:'text/html'});
    const body=await fs.readFile(new URL('../'+relative,import.meta.url));
    await route.fulfill({body,contentType:'text/javascript'});
  });
  await page.goto('http://localhost:4173/');
  const image=process.argv[2]?await fs.readFile(process.argv[2]):null;
  const result=await page.evaluate(async src=>{
    const {createBarcodeReader}=await import('./scanner.js');
    const reader=await createBarcodeReader();
    const qr=new ZXingBrowser.BrowserQRCodeSvgWriter().write('INVENTARIO-QR-0001',300,300);
    const img=new Image();img.src='data:image/svg+xml;base64,'+btoa(new XMLSerializer().serializeToString(qr));await img.decode();
    const canvas=document.createElement('canvas');canvas.width=300;canvas.height=300;
    const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,300,300);ctx.drawImage(img,0,0);
    const qrText=reader.decodeFromCanvas(canvas).getText();
    let label=null;
    if(src){
      const img=new Image();img.src=src;await img.decode();
      canvas.width=img.width;canvas.height=img.height;canvas.getContext('2d').drawImage(img,0,0);
      let decoded;
      for(let attempt=0;attempt<6&&!decoded;attempt++){try{decoded=reader.decodeFromCanvas(canvas);}catch{}}
      if(!decoded) throw Error('A imagem de teste não foi decodificada.');
      label={code:decoded.getText(),format:ZXingBrowser.BarcodeFormat[decoded.getBarcodeFormat()]};
    }
    return {qrText,label};
  },image?'data:image/png;base64,'+image.toString('base64'):null);
  assert.equal(result.qrText,'INVENTARIO-QR-0001');
  if(process.argv[3]) assert.equal(result.label?.code,process.argv[3]);
  console.log('PASS: QR Code real e leitor com correção de inclinação.',JSON.stringify(result));
}finally{await browser.close();}
