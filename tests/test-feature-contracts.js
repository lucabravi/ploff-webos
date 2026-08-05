'use strict';

var assert = require('assert');
var Contracts = require('../scripts/check-feature-contracts');

var direct = "function create(){ function open(){} function destroy(){} return { open: open, destroy: destroy }; }";
var assigned = "function create(){ var api; function enter(){} api = { enter: enter }; return api; }";
var consumer = "function wire(){ shellFeature.enter(); shellFeature['destroy'](); }";

assert.deepStrictEqual(Contracts.exportedMethods(direct, 'direct.js'), ['destroy', 'open'], 'direct feature return contracts must be parsed');
assert.deepStrictEqual(Contracts.exportedMethods(assigned, 'assigned.js'), ['enter'], 'assigned API contracts must be parsed');
assert.deepStrictEqual(Contracts.memberUses(consumer, 'shellFeature', 'consumer.js'), ['destroy', 'enter'], 'production member consumers must be parsed');

var report = Contracts.analyzeProject(require('path').join(__dirname, '..'));
assert.strictEqual(report.unused.length, 0, 'every exported feature method must have a production or lifecycle consumer: ' + report.unused.join(', '));
assert.strictEqual(report.undeclared.length, 0, 'every production feature call must belong to the declared contract: ' + report.undeclared.join(', '));
assert.strictEqual(report.contractDrift.length, 0, 'checked-in feature contracts must match the exported API exactly: ' + report.contractDrift.join(', '));

console.log('Feature contract checks passed');
