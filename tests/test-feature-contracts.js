'use strict';

var assert = require('assert');
var Contracts = require('../scripts/check-feature-contracts');
var acorn = require('acorn');
var fs = require('fs');
var os = require('os');
var path = require('path');

var direct = "function create(){ function open(){} function destroy(){} return { open: open, destroy: destroy }; }";
var assigned = "function create(){ var api; function enter(){} api = { enter: enter }; return api; }";
var consumer = "function wire(){ shellFeature.enter(); shellFeature['destroy'](); }";

assert.deepStrictEqual(Contracts.exportedMethods(direct, 'direct.js'), ['destroy', 'open'], 'direct feature return contracts must be parsed');
assert.deepStrictEqual(Contracts.exportedMethods(assigned, 'assigned.js'), ['enter'], 'assigned API contracts must be parsed');
assert.deepStrictEqual(Contracts.memberUses(consumer, 'shellFeature', 'consumer.js'), ['destroy', 'enter'], 'production member consumers must be parsed');

var parsedFiles = {};
var realParse = acorn.parse;
var report;
acorn.parse = function (source, options) {
  var name = options.sourceFile;
  parsedFiles[name] = (parsedFiles[name] || 0) + 1;
  return realParse.call(acorn, source, options);
};
try {
  report = Contracts.analyzeProject(path.join(__dirname, '..'));
} finally {
  acorn.parse = realParse;
}
var parsedNames = Object.keys(parsedFiles);
assert.ok(parsedNames.length > Contracts.FEATURES.length, 'consumer inventory must include the real runtime');
assert.deepStrictEqual(parsedNames.filter(function (name) { return parsedFiles[name] !== 1; }), [],
  'each authored runtime source must be parsed once per project check, not once per feature');
assert.strictEqual(report.unused.length, 0, 'every exported feature method must have a production or lifecycle consumer: ' + report.unused.join(', '));
assert.strictEqual(report.undeclared.length, 0, 'every production feature call must belong to the declared contract: ' + report.undeclared.join(', '));
assert.strictEqual(report.contractDrift.length, 0, 'checked-in feature contracts must match the exported API exactly: ' + report.contractDrift.join(', '));

(function aNewInvocationReadsChangedSourcesWithoutWeakeningTheContracts() {
  var fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'ploff-feature-contracts-'));
  var declarations = {};
  var calls = [];
  try {
    fs.mkdirSync(path.join(fixture, 'app/coordinator'), { recursive: true });
    fs.mkdirSync(path.join(fixture, 'scripts'));
    Contracts.FEATURES.forEach(function (feature) {
      declarations[feature.name] = ['destroy', 'open'];
      fs.writeFileSync(path.join(fixture, feature.file),
        'function create(){ return { open: function(){}, destroy: function(){} }; }');
      calls.push(feature.variable + '.open();');
    });
    fs.writeFileSync(path.join(fixture, 'scripts/feature-contracts.json'), JSON.stringify(declarations));
    fs.writeFileSync(path.join(fixture, 'app/consumer.js'), calls.join('\n'));
    var before = Contracts.analyzeProject(fixture);
    assert.deepStrictEqual(before.unused, []);
    assert.deepStrictEqual(before.undeclared, []);
    assert.deepStrictEqual(before.contractDrift, []);
    fs.writeFileSync(path.join(fixture, 'app/consumer.js'), calls.filter(function (call) {
      return call !== 'detailFeature.open();';
    }).concat('shellFeature.missing();').join('\n'));
    fs.writeFileSync(path.join(fixture, 'app/coordinator/player-feature-controller.js'),
      'function create(){ return { open: function(){}, destroy: function(){}, extra: function(){} }; }');
    var after = Contracts.analyzeProject(fixture);
    assert.deepStrictEqual(after.unused, ['detail.open', 'player.extra']);
    assert.deepStrictEqual(after.undeclared, ['shell.missing']);
    assert.deepStrictEqual(after.contractDrift, ['player.unexpected:extra']);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}());

console.log('Feature contract checks passed (' + parsedNames.length + ' runtime files parsed once)');
