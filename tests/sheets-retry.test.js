'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const main = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const match = main.match(/function loadFromSheets\(callback, silent\)\{[\s\S]*?\r?\n\}\r?\n\r?\n\/\/ Envia apenas/);
assert(match, 'loadFromSheets não encontrado');
const source = match[0].replace(/\r?\n\r?\n\/\/ Envia apenas[\s\S]*$/, '');
let calls = 0;
let failureReported = false;
const waits = [];
const sandbox = {
  SHEETS_WEBAPP: 'https://example.test/exec', SHEETS_READ_ATTEMPTS: 2, SHEETS_RETRY_DELAY_MS: 2000,
  _sheetsSyncing: false, _sheetsLastReadAt: 0, Date: {now: () => 12345},
  fetch: () => { calls++; return calls===1 ? Promise.reject(new Error('HTTP 404')) : Promise.resolve({ok:true,json:() => Promise.resolve({ok:true,data:[{id:'EPIC-1'}]})}); },
  setTimeout: (fn, ms) => { waits.push(ms); fn(); }, setSyncLabel: () => {}, setSourceTrust: () => { failureReported=true; }, console
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
new Promise((resolve,reject) => sandbox.loadFromSheets((err,data) => {
  try {
    assert.ifError(err); assert.strictEqual(data[0].id,'EPIC-1'); assert.strictEqual(calls,2);
    assert.deepStrictEqual(waits,[2000]); assert.strictEqual(failureReported,false); assert.strictEqual(sandbox._sheetsSyncing,false);
    console.log('Sheets retry behavior test passed.'); resolve();
  } catch(error){ reject(error); }
}, false)).catch(error => { console.error(error); process.exitCode=1; });
