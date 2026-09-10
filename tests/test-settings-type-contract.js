'use strict';

var assert = require('assert');
var childProcess = require('child_process');
var fs = require('fs');
var os = require('os');
var path = require('path');
var Settings = require('../app/settings');
var SettingsSchema = require('../app/settings-schema');

var root = path.join(__dirname, '..');
var definitions = SettingsSchema.all();
var temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ploff-settings-contract-'));

function valueType(definition) {
  if (Array.isArray(definition.defaultValue)) { return 'string[]'; }
  return typeof definition.defaultValue;
}

// Derive both the key set and value categories from the real persistence schema.
// A missing/extra/optional declaration, incorrect primitive type, or incompatible
// narrowed union must fail the compiler instead of silently drifting from Settings.
var source = [
  'type Assert<T extends true> = T;',
  'type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;',
  'type SchemaShape = { version: number; ' + definitions.map(function (definition) {
    return JSON.stringify(definition.key) + ': ' + valueType(definition) + ';';
  }).join(' ') + ' };',
  'type ExactKeys = Assert<Equal<keyof PloffSettingsRecord, keyof SchemaShape>>;',
  'type RequiredValues = Assert<PloffSettingsRecord extends SchemaShape ? true : false>;',
  'var settingsRecord: PloffSettingsRecord = ' + JSON.stringify(Settings.defaults()) + ';'
];

definitions.forEach(function (definition) {
  var choices = definition.allowed || [definition.defaultValue];
  if (typeof definition.defaultValue === 'boolean') { choices = [false, true]; }
  if (Array.isArray(definition.defaultValue)) { choices = [[], definition.allowed || ['en', 'it']]; }
  source.push('type NotAny_' + definition.key + ' = Assert<Equal<0 extends (1 & PloffSettingsRecord[' +
    JSON.stringify(definition.key) + ']) ? true : false, false>>;');
  choices.forEach(function (choice) {
    var input = {};
    input[definition.key] = choice;
    source.push('settingsRecord[' + JSON.stringify(definition.key) + '] = ' +
      JSON.stringify(Settings.validate(input)[definition.key]) + ';');
  });
});

var result;
try {
  fs.writeFileSync(path.join(temp, 'settings-record.ts'), source.join('\n') + '\n');
  fs.writeFileSync(path.join(temp, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { noEmit: true, strict: true, skipLibCheck: true, target: 'ES2017', types: [] },
    files: [path.join(root, 'types/runtime-contracts.d.ts'), path.join(temp, 'settings-record.ts')]
  }));
  // Use the public compiler CLI; no dependency on an unstable compiler AST API.
  result = childProcess.spawnSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'),
    '--project', path.join(temp, 'tsconfig.json'), '--pretty', 'false'], {
    cwd: root, encoding: 'utf8', timeout: 30000
  });
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
assert.ifError(result.error);
assert.strictEqual(result.status, 0,
  'PloffSettingsRecord must match SettingsSchema keys and normalized value types:\n' + result.stdout + result.stderr);
console.log('Settings type/schema contract checks passed');
