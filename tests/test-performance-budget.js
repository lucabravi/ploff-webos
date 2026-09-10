'use strict';

var assert = require('assert');
var PerformanceBudget = require('../scripts/check-performance-budget');

assert.strictEqual(PerformanceBudget.MAX_BUNDLE_BYTES, 900000, 'the runtime must use the current adjustable raw-byte guardrail');
assert.strictEqual(PerformanceBudget.MAX_GZIP_BYTES, 190000, 'the runtime must use the current adjustable gzip guardrail');

assert.strictEqual(
  PerformanceBudget.checkBuffer(Buffer.alloc(PerformanceBudget.MAX_BUNDLE_BYTES + 1)).rawWithinBudget,
  false,
  'the bundle budget must reject an oversized uncompressed runtime'
);
assert.strictEqual(
  PerformanceBudget.checkBuffer(Buffer.from('small runtime')).withinBudget,
  true,
  'the bundle budget must accept a compact runtime'
);


assert.strictEqual(PerformanceBudget.MAX_STYLES_BYTES, 265000, 'the generated CSS must use an adjustable raw-byte guardrail');
assert.strictEqual(PerformanceBudget.MAX_STYLES_GZIP_BYTES, 40000, 'the generated CSS must use an adjustable gzip guardrail');
assert.strictEqual(PerformanceBudget.MAX_INITIAL_SCRIPT_COUNT, 130, 'startup script fan-out must use an adjustable count guardrail');
assert.strictEqual(PerformanceBudget.MAX_INITIAL_JS_BYTES, 2210000, 'startup JavaScript must use an adjustable aggregate-byte guardrail');

(function startupAssetBudgetsIgnoreRemoteAndReportIndependentLimits() {
  var fs = require('fs');
  var os = require('os');
  var path = require('path');
  var temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ploff-performance-budget-'));
  var indexPath = path.join(temp, 'index.html');
  fs.writeFileSync(path.join(temp, 'a.js'), 'var a = 1;');
  fs.writeFileSync(path.join(temp, 'b.js'), 'var b = 2;');
  fs.writeFileSync(path.join(temp, 'styles.css'), 'body { color: white; }');
  fs.writeFileSync(indexPath,
    '<link rel="stylesheet" href="styles.css?v=1">' +
    '<script src="a.js?v=1"></script>' +
    '<script src="https://example.invalid/remote.js"></script>' +
    '<script src="b.js#local"></script>');

  var countFailure = PerformanceBudget.checkStartupAssets(indexPath, {
    maxStylesBytes: 1000,
    maxStylesGzipBytes: 1000,
    maxInitialScriptCount: 1,
    maxInitialJsBytes: 1000
  });
  assert.strictEqual(countFailure.initialScriptCount, 2, 'remote scripts must not count toward local startup fan-out');
  assert.strictEqual(countFailure.scriptCountWithinBudget, false, 'startup count budget must reject excessive local script fan-out');
  assert.strictEqual(countFailure.initialJsWithinBudget, true, 'independent aggregate JS budget must remain green for the small fixture');
  assert.strictEqual(countFailure.stylesWithinBudget, true, 'independent CSS raw budget must remain green for the small fixture');

  var jsFailure = PerformanceBudget.checkStartupAssets(indexPath, {
    maxStylesBytes: 1000,
    maxStylesGzipBytes: 1000,
    maxInitialScriptCount: 10,
    maxInitialJsBytes: 10
  });
  assert.strictEqual(jsFailure.initialJsWithinBudget, false, 'startup aggregate JS budget must reject excessive bytes independently');
  assert.strictEqual(jsFailure.scriptCountWithinBudget, true, 'script-count budget must remain independent from JS bytes');

  var cssFailure = PerformanceBudget.checkStartupAssets(indexPath, {
    maxStylesBytes: 10,
    maxStylesGzipBytes: 10,
    maxInitialScriptCount: 10,
    maxInitialJsBytes: 1000
  });
  assert.strictEqual(cssFailure.stylesWithinBudget, false, 'generated CSS raw budget must reject excessive bytes');
  assert.strictEqual(cssFailure.stylesGzipWithinBudget, false, 'generated CSS gzip budget must reject excessive bytes');

  fs.rmSync(temp, { recursive: true, force: true });
}());

(function currentStartupAssetsFitTheEngineeringGuardrails() {
  var path = require('path');
  var result = PerformanceBudget.checkStartupAssets(path.join(__dirname, '..', 'app', 'index.html'));
  assert.strictEqual(result.withinBudget, true, 'current checked-in startup assets must fit the engineering guardrails');
  assert.ok(result.initialScriptCount <= PerformanceBudget.MAX_INITIAL_SCRIPT_COUNT, 'startup script count may change deliberately but must remain within the engineering guardrail');
}());

console.log('Performance budget checks passed');

assert.strictEqual(PerformanceBudget.MAX_PLAYER_BYTES, 550000);
assert.strictEqual(PerformanceBudget.MAX_PLAYER_GZIP_BYTES, 115000);
assert.strictEqual(PerformanceBudget.checkPlayerBuffer(Buffer.alloc(550001)).withinBudget, false,
  'deferred code must not escape an independently enforced budget');
assert.strictEqual(PerformanceBudget.checkPlayerBuffer(Buffer.from('small Player')).withinBudget, true);
