import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={INVENTARIO_CONFIG:{},addEventListener(){}};
const {trustedOrigin}=await import('../api.js');
test('canal aceita somente origens HTTPS do sandbox Apps Script',() => {
  for (const origin of ['https://script.googleusercontent.com','https://abc123-script.googleusercontent.com']) assert.equal(trustedOrigin(origin),true);
  for (const origin of ['null','http://script.googleusercontent.com','https://script.googleusercontent.com.evil.example','https://other.googleusercontent.com','https://abc-script.googleusercontent.com:444','https://uparochamiranda.github.io']) assert.equal(trustedOrigin(origin),false);
});
