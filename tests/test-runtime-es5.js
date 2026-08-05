'use strict';

var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var RuntimeEs5 = require('../scripts/check-runtime-es5');

var project = path.join(__dirname, '..');
var temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ploff-es5-'));
var invalidCases = [
  { name: 'class.js', source: 'class Example {}' },
  { name: 'arrow.js', source: 'var value = () => 1;' },
  { name: 'async.js', source: 'async function load() {}' },
  { name: 'module.js', source: 'import value from "module";' },
  { name: 'let.js', source: 'let value = 1;' }
];

assert.doesNotThrow(function () {
  RuntimeEs5.parseSource('(function () { "use strict"; var value = 1; return value; }());', 'valid.js');
}, 'the runtime checker must accept valid ES5 scripts');

invalidCases.forEach(function (entry) {
  assert.throws(function () {
    RuntimeEs5.parseSource(entry.source, entry.name);
  }, /ECMAScript 5/, entry.name + ' must be rejected as post-ES5 runtime syntax');
});

assert.throws(function () {
  RuntimeEs5.parseSource('var task = new Promise(function () {});', 'promise.js');
}, /Promise.*forbidden/, 'the runtime checker must reject Promise even though it is valid ES5 syntax');

fs.writeFileSync(path.join(temporary, 'valid.js'), 'var valid = true;\n');
fs.writeFileSync(path.join(temporary, 'invalid.js'), 'var invalid = (value) => value;\n');
assert.throws(function () {
  RuntimeEs5.checkFiles([path.join(temporary, 'valid.js'), path.join(temporary, 'invalid.js')]);
}, /invalid\.js:1:/, 'file checks must report the precise failing file and source position');

(function runtimeInventoryIncludesEveryDeliverySurface() {
  var files = RuntimeEs5.collectRuntimeFiles(project).map(function (file) {
    return path.relative(project, file).replace(/\\/g, '/');
  });
  assert.ok(files.indexOf('app/app.js') !== -1, 'the generated TV bundle must be parsed as ES5');
  assert.ok(files.indexOf('app/coordinator/application-controller.js') !== -1, 'coordinator modules must be parsed as ES5');
  assert.ok(files.indexOf('webos-service/service.js') !== -1, 'the packaged webOS service must be parsed as ES5');
}());

RuntimeEs5.checkFiles(RuntimeEs5.collectRuntimeFiles(project));

fs.rmSync(temporary, { recursive: true, force: true });
console.log('Runtime ES5 checks passed');
