import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';

const pair = generateKeyPairSync('rsa', { modulusLength:2048 });
const jwk = { ...pair.publicKey.export({ format:'jwk' }), kid:'test-google-key', alg:'RS256' };
const headers = {
  INVENTARIO:['ID','DATA','HORA','CODIGO_BARRAS','PATRIMONIO','SETOR','TIPO','FABRICANTE','MODELO','OBSERVACAO'],
  SETORES:['ID','NOME_SETOR','ATIVO'], TIPOS:['ID','NOME_TIPO','ATIVO'], MODELOS:['ID','TIPO','FABRICANTE','MODELO','ATIVO']
};
function token(overrides = {}, key = pair.privateKey, header = {}) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const message = encode({ alg:'RS256',kid:jwk.kid,...header }) + '.' + encode({ iss:'https://accounts.google.com',aud:'test.apps.googleusercontent.com',sub:'123',email:'operator@example.com',email_verified:true,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,...overrides });
  return message + '.' + sign('RSA-SHA256',Buffer.from(message),key).toString('base64url');
}
function fixture() {
  const db = Object.fromEntries(Object.entries(headers).map(([name,head]) => [name,[head.slice()]]));
  db.SETORES.push(['s1','Sala Amarela','SIM'],['s2','Sala Azul','SIM']);
  db.TIPOS.push(['t1','Desktop','SIM'],['t2','Monitor','SIM']);
  db.MODELOS.push(['m1','Desktop','Dell','OptiPlex 3080','SIM'],['m2','Monitor','Dell','P2219H','SIM']);
  let locked = false, writes = 0;
  const sheets = {};
  for (const name of Object.keys(db)) {
    sheets[name] = {
      getLastRow: () => db[name].length,
      getMaxRows: () => 1000,
      getRange(row,col,rows,cols) {
        return {
          getDisplayValues: () => Array.from({length:rows},(_,r) => Array.from({length:cols},(_,c) => String(db[name][row+r-1]?.[col+c-1] ?? ''))),
          setNumberFormat() { return this; },
          setValues(values) {
            assert.ok(locked,'Todas as gravações de dados precisam de LockService');
            writes++;
            values.forEach((cells,r) => { db[name][row+r-1] ||= []; cells.forEach((value,c) => db[name][row+r-1][col+c-1] = String(value).replace(/^'/,'')); });
            return this;
          }
        };
      }
    };
  }
  const props = { SPREADSHEET_ID:'test-sheet',GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',ALLOWED_ORIGIN:'https://uparochamiranda.github.io',ALLOWED_EMAILS:'operator@example.com',TIME_ZONE:'America/Sao_Paulo' };
  const cache = new Map();
  const context = vm.createContext({
    console, navigator: {appName:'Netscape'},
    PropertiesService:{getScriptProperties:() => ({getProperty:key => props[key],setProperties:values => Object.assign(props,values)})},
    SpreadsheetApp:{openById:() => ({getSheetByName:name => sheets[name]}),flush(){}},
    LockService:{getScriptLock:() => ({tryLock:() => { if (locked) return false; locked=true; return true; },releaseLock:() => locked=false})},
    CacheService:{getScriptCache:() => ({get:key => cache.get(key),put:(key,value) => cache.set(key,value),remove:key => cache.delete(key)})},
    UrlFetchApp:{fetch:() => ({getResponseCode:() => 200,getContentText:() => JSON.stringify({keys:[jwk]})})},
    HtmlService:{XFrameOptionsMode:{ALLOWALL:'ALLOWALL'},createHtmlOutput:html => ({html,setXFrameOptionsMode(){return this;}})},
    Utilities:{getUuid:randomUUID,DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(alg,value) => [...createHash(alg).update(value).digest()],base64EncodeWebSafe:value => Buffer.from(value).toString('base64url'),formatDate:(value,tz,pattern) => pattern === 'yyyy-MM-dd' ? new Intl.DateTimeFormat('en-CA',{timeZone:tz}).format(value) : '12:30:00'}
  });
  for (const file of ['JwtLibrary.gs','Auth.gs','Configure.gs','Code.gs']) vm.runInContext(readFileSync(new URL('../apps-script/'+file,import.meta.url),'utf8'),context,{filename:file});
  context.DEPLOYMENT_DEFAULTS_ = { ALLOWED_ORIGIN:'https://uparochamiranda.github.io' };
  function rpc(action,data = {}, credential = token(), overrides = {}) {
    const output = context.doPost({parameter:{payload:JSON.stringify({action,data,token:credential,requestId:'a'.repeat(64),origin:props.ALLOWED_ORIGIN,...overrides})}}).html;
    const json = output.match(/window\.top\.postMessage\((.*),"https:\/\/uparochamiranda.github.io"\);/s)?.[1];
    assert.ok(json,'Resposta precisa usar postMessage com origem explícita');
    return JSON.parse(json);
  }
  return {context,db,props,rpc,get writes(){return writes;}};
}
const equipment = (overrides={}) => ({codigo:'00001234',patrimonio:'0099',setorId:'s1',tipoId:'t1',modeloId:'m1',observacao:'Em uso',...overrides});
test('verifica RS256 real e bloqueia tokens adulterados, expirados, de outro cliente e contas não autorizadas',() => {
  const f = fixture();
  assert.equal(f.rpc('bootstrap').ok,true);
  for (const bad of [token({aud:'other'}),token({exp:1}),token({iss:'https://evil.example'}),token({email_verified:false}),token({},pair.privateKey,{alg:'HS256'}),token().slice(0,-12)+'tampered']) {
    assert.equal(f.rpc('saveEquipment',equipment(),bad).error.code,'UNAUTHORIZED');
  }
  assert.equal(f.rpc('bootstrap',{},token({email:'outsider@example.com'})).error.code,'FORBIDDEN');
  assert.equal(f.writes,0);
});
test('origem, ação desconhecida e requisição sem login falham sem escrita',() => {
  const f = fixture();
  assert.equal(f.rpc('saveEquipment',equipment(),'').error.code,'UNAUTHORIZED');
  assert.equal(f.rpc('saveEquipment',equipment(),token(),{origin:'https://evil.example'}).error.code,'ORIGIN');
  assert.equal(f.rpc('setupInventory_').error.code,'ACTION');
  assert.equal(f.rpc('configurarInventario_').error.code,'ACTION');
  assert.equal(f.writes,0);
});
test('preenche configuração ausente somente com valores publicados sem remover autenticação',() => {
  const f = fixture();
  delete f.props.ALLOWED_ORIGIN;
  const response = f.rpc('bootstrap',{},'',{origin:'https://uparochamiranda.github.io'});
  assert.equal(f.props.ALLOWED_ORIGIN,'https://uparochamiranda.github.io');
  assert.equal(f.props.GOOGLE_CLIENT_ID,'test.apps.googleusercontent.com','Preserva as propriedades já configuradas');
  assert.equal(response.error.code,'UNAUTHORIZED');
  assert.equal(f.writes,0);
});
test('salva com zeros, fabricante do servidor, consulta e impede duplicação dentro do lock',() => {
  const f=fixture();
  const first=f.rpc('saveEquipment',equipment({fabricante:'Injetado'}));
  assert.equal(first.ok,true); assert.equal(first.data.CODIGO_BARRAS,'00001234'); assert.equal(first.data.FABRICANTE,'Dell');
  assert.equal(f.rpc('saveEquipment',equipment()).error.code,'DUPLICATE');
  assert.equal(f.db.INVENTARIO.length,2);
  assert.equal(f.rpc('find',{code:' 00001234 '}).data.ID,first.data.ID);
  assert.equal(f.rpc('query',{search:'0099'}).data.matched,1);
  assert.equal(f.rpc('query',{setor:'Sala Azul'}).data.matched,0);
  assert.equal(f.rpc('indicators').data.total,1);
  assert.equal(f.rpc('indicators').data.today,1);
});
test('valida referências, tipo do modelo e campos obrigatórios no servidor',() => {
  const f=fixture();
  for (const data of [equipment({codigo:''}),equipment({tipoId:'t2'}),equipment({modeloId:'fake'}),equipment({setorId:'fake'}),equipment({observacao:'x'.repeat(2001)})]) assert.equal(f.rpc('saveEquipment',data).error.code,'VALIDATION');
  assert.equal(f.writes,0);
});
test('atualiza sem duplicar, mantém data original e detecta edição concorrente',() => {
  const f=fixture();
  const r=f.rpc('saveEquipment',equipment()).data;
  const saved=f.rpc('updateEquipment',equipment({id:r.ID,version:r._version,setorId:'s2'}));
  assert.equal(saved.ok,true); assert.equal(saved.data.SETOR,'Sala Azul'); assert.equal(saved.data.DATA,r.DATA);
  assert.equal(f.rpc('updateEquipment',equipment({id:r.ID,version:r._version})).error.code,'CONFLICT');
  const second=f.rpc('saveEquipment',equipment({codigo:'OTHER'})).data;
  assert.equal(f.rpc('updateEquipment',equipment({id:second.ID,version:second._version})).error.code,'DUPLICATE');
  assert.equal(f.db.INVENTARIO.length,3);
});
test('setores e modelos evitam duplicidades mesmo inativos, e tipo renomeado preserva associação dos modelos',() => {
  const f=fixture();
  const save=data => f.rpc('saveCatalog',data);
  assert.equal(save({entity:'SETORES',nome:' Sála amarela '}).error.code,'DUPLICATE_CATALOG');
  const model=save({entity:'MODELOS',tipoId:'t1',fabricante:'LG',nome:'Novo Modelo'});
  assert.equal(model.ok,true);
  assert.equal(save({entity:'MODELOS',tipoId:'t1',fabricante:'lg',nome:'novo modelo'}).error.code,'DUPLICATE_CATALOG');
  assert.equal(save({entity:'TIPOS',id:'t1',nome:'Computador',ativo:true}).ok,true);
  assert.equal(f.db.MODELOS[1][1],'Computador');
  assert.equal(save({entity:'TIPOS',id:'t1',nome:'Computador',ativo:false}).error.code,'VALIDATION');
});
test('valores de fórmula são tratados como texto e resposta não permite fechar script',() => {
  const f=fixture();
  const saved=f.rpc('saveEquipment',equipment({codigo:'=IMPORTXML("https://invalid")',observacao:'</script><script>alert(1)</script>'}));
  assert.equal(saved.ok,true);
  assert.equal(saved.data.OBSERVACAO,'</script><script>alert(1)</script>');
  assert.equal(f.rpc('query',{}).data.items[0].CODIGO_BARRAS,'=IMPORTXML("https://invalid")');
});
