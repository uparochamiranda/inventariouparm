// Artefato de implantação; usa apenas o runtime de planilhas fornecido pelo ambiente.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const runtime = path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node');
const require = createRequire(path.join(runtime,'package.json'));
const { Workbook, SpreadsheetFile } = await import(pathToFileURL(require.resolve('@oai/artifact-tool')).href);
const workbook = Workbook.create();
const types = ['Desktop','Notebook','Monitor','Impressora','Scanner','Nobreak','Switch','Roteador','Access Point','Servidor','Televisão','Totem','Outros'];
const definitions = [
  ['INVENTARIO',['ID','DATA','HORA','CODIGO_BARRAS','PATRIMONIO','SETOR','TIPO','FABRICANTE','MODELO','OBSERVACAO'],[]],
  ['SETORES',['ID','NOME_SETOR','ATIVO'],[]],
  ['TIPOS',['ID','NOME_TIPO','ATIVO'],types.map((name,index) => [`tipo-${index+1}`,name,'SIM'])],
  ['MODELOS',['ID','TIPO','FABRICANTE','MODELO','ATIVO'],[['modelo-1','Desktop','Dell','OptiPlex 3080','SIM'],['modelo-2','Monitor','Dell','P2219H','SIM'],['modelo-3','Impressora','HP','LaserJet M404dn','SIM']]]
];
await fs.mkdir('outputs/planilha',{recursive:true});
for (const [name,headers,rows] of definitions) {
  const sheet = workbook.worksheets.add(name);
  const last = String.fromCharCode(64+headers.length);
  const range = sheet.getRange(`A1:${last}${Math.max(2,rows.length+1)}`);
  range.setNumberFormat('@');
  range.format.font = {name:'Arial',size:11,color:'#26354d'};
  range.format.columnWidth = 24;
  range.format.rowHeight = 25;
  sheet.getRange(`A1:${last}1`).values = [headers];
  sheet.getRange(`A1:${last}1`).format = {fill:'#185adb',font:{name:'Arial',size:10,bold:true,color:'#ffffff'},rowHeight:30};
  if (rows.length) sheet.getRange(`A2:${last}${rows.length+1}`).values = rows;
  sheet.freezePanes.freezeRows(1);
  if (name === 'INVENTARIO') { sheet.getRange('D1:D2').format.columnWidth=30; sheet.getRange('J1:J2').format.columnWidth=38; }
  if (name === 'MODELOS') sheet.getRange('D1:D4').format.columnWidth=32;
  const preview = await workbook.render({sheetName:name,range:`A1:${last}${Math.max(3,Math.min(rows.length+1,7))}`,scale:1.5,format:'png'});
  await fs.writeFile(`outputs/planilha/${name}.png`,new Uint8Array(await preview.arrayBuffer()));
  console.log((await workbook.inspect({kind:'table',range:`${name}!A1:${last}${Math.max(1,Math.min(rows.length+1,4))}`,include:'values',tableMaxRows:4,tableMaxCols:10,maxChars:1800})).ndjson);
}
await (await SpreadsheetFile.exportXlsx(workbook)).save('outputs/planilha/Inventario-TI.xlsx');
console.log('Planilha exportada sem equipamentos fictícios e sem fórmulas.');
