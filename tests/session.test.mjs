import test from 'node:test';
import assert from 'node:assert/strict';

const key='inventario-ti-google-session-v1';
const clientId='test.apps.googleusercontent.com';
const credential=expiry=>'eyJhbGciOiJSUzI1NiJ9.'+Buffer.from(JSON.stringify({exp:expiry})).toString('base64url')+'.signature';
let moduleId=0;
async function session(saved,blocked=false) {
  const data=new Map(saved?[[key,JSON.stringify(saved)]]:[]);
  globalThis.window={INVENTARIO_CONFIG:{googleClientId:clientId},addEventListener(){},sessionStorage:{
    getItem(k){if(blocked)throw Error('blocked');return data.get(k)||null;},
    setItem(k,v){if(blocked)throw Error('blocked');data.set(k,v);},
    removeItem(k){if(blocked)throw Error('blocked');data.delete(k);}
  }};
  return {api:await import(`../api.js?session-test=${++moduleId}`),data};
}
test('restaura credencial vigente somente para o mesmo Client ID e descarta vencidas ou inválidas',async()=>{
  const valid=credential(Math.floor(Date.now()/1000)+3600);
  assert.equal((await session({clientId,credential:valid})).api.signedIn(),true);
  for(const saved of [
    {clientId:'other.apps.googleusercontent.com',credential:valid},
    {clientId,credential:credential(Math.floor(Date.now()/1000)-1)},
    {clientId,credential:credential(Math.floor(Date.now()/1000)+15)},
    {clientId,credential:'malformed'},
    {clientId,credential:null}
  ]){
    const result=await session(saved);assert.equal(result.api.signedIn(),false);assert.equal(result.data.has(key),false);
  }
});
test('sair remove a credencial da aba; armazenamento bloqueado mantém login em memória',async()=>{
  const valid=credential(Math.floor(Date.now()/1000)+3600);
  const result=await session();result.api.setCredential(valid);
  assert.equal(JSON.parse(result.data.get(key)).credential,valid);
  result.api.setCredential('');assert.equal(result.api.signedIn(),false);assert.equal(result.data.has(key),false);
  const blocked=await session(null,true);blocked.api.setCredential(valid);
  assert.equal(blocked.api.signedIn(),true);blocked.api.setCredential('');assert.equal(blocked.api.signedIn(),false);
});
