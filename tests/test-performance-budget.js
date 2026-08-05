'use strict';

var assert = require('assert');
var PerformanceBudget = require('../scripts/check-performance-budget');

assert.strictEqual(PerformanceBudget.MAX_BUNDLE_BYTES, 800000, 'the runtime must use the current adjustable raw-byte guardrail');
assert.strictEqual(PerformanceBudget.MAX_GZIP_BYTES, 165000, 'the runtime must use the current adjustable gzip guardrail');

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

console.log('Performance budget checks passed');
