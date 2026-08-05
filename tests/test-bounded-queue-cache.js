'use strict';

var assert = require('assert');
var BoundedQueueCache;

try {
  BoundedQueueCache = require('../app/coordinator/bounded-queue-cache');
} catch (error) {
  BoundedQueueCache = null;
}

assert.ok(BoundedQueueCache, 'the bounded queue cache module must exist');

(function enforcesPageAndRecordBoundsAtPeak() {
  var cache = BoundedQueueCache.create({ pageSize: 40, maxPages: 5, maxRecords: 200 });
  var page;
  var index;
  var record;
  for (page = 0; page < 20; page += 1) {
    record = [];
    for (index = 0; index < 40; index += 1) {
      record.push({ occurrenceId: 'queue:' + (page * 40 + index), absoluteIndex: page * 40 + index });
    }
    cache.putPage(page * 40, record, { total: 800, generation: 2 });
    assert.ok(cache.snapshot().residentPages <= 5, 'resident pages must never exceed five');
    assert.ok(cache.snapshot().residentRecords <= 200, 'resident records must never exceed 200');
    assert.ok(cache.snapshot().peakResidentPages <= 5, 'peak page count must remain bounded during replacement');
    assert.ok(cache.snapshot().peakResidentRecords <= 200, 'peak record count must remain bounded during replacement');
  }
}());

(function evictsLeastRecentlyUsedPageAndReloadsInReverse() {
  var cache = BoundedQueueCache.create({ pageSize: 2, maxPages: 2, maxRecords: 4 });
  cache.putPage(0, [{ occurrenceId: 'q:0' }, { occurrenceId: 'q:1' }], { total: 6 });
  cache.putPage(2, [{ occurrenceId: 'q:2' }, { occurrenceId: 'q:3' }], { total: 6 });
  assert.deepStrictEqual(cache.getPage(0).map(function (item) { return item.occurrenceId; }), ['q:0', 'q:1']);
  cache.putPage(4, [{ occurrenceId: 'q:4' }, { occurrenceId: 'q:5' }], { total: 6, terminal: true });
  assert.strictEqual(cache.getPage(2), null, 'the least recently used page must be evicted');
  assert.deepStrictEqual(
    cache.descriptor(2),
    { start: 2, expectedSize: 2, knownSize: 2, total: 6, terminal: false, generation: 0, loadState: 'evicted' },
    'evicted page descriptors must retain only lightweight reload metadata'
  );
  cache.putPage(2, [{ occurrenceId: 'q:2' }, { occurrenceId: 'q:3' }], { total: 6 });
  assert.deepStrictEqual(cache.getPage(2).map(function (item) { return item.occurrenceId; }), ['q:2', 'q:3'], 'reverse navigation must reload an evicted page');
}());

(function replacementDoesNotDoubleCountAndDescriptorsStayLightweight() {
  var cache = BoundedQueueCache.create({ pageSize: 2, maxPages: 2, maxRecords: 3 });
  var closure = function () { return 'large response'; };
  cache.putPage(0, [{ occurrenceId: 'q:0' }, { occurrenceId: 'q:1' }], {
    total: 3,
    response: { MediaContainer: { Metadata: [{ large: true }] } },
    callback: closure
  });
  cache.putPage(0, [{ occurrenceId: 'q:0-new' }], { total: 3 });
  assert.strictEqual(cache.snapshot().residentRecords, 1, 'replacing a page must remove old records before counting new records');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(cache.descriptor(0), 'response'), false, 'descriptors must not retain response objects');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(cache.descriptor(0), 'callback'), false, 'descriptors must not retain closures');
}());

(function discardsPagesBeyondAShrunkenTerminalBoundary() {
  var cache = BoundedQueueCache.create({ pageSize: 2, maxPages: 3, maxRecords: 6 });
  cache.putPage(0, [{ occurrenceId: 'q:0' }], { total: 1, terminal: true, signature: 'sig-a' });
  cache.putPage(2, [{ occurrenceId: 'q:2' }, { occurrenceId: 'q:3' }], { total: 4, signature: 'sig-cd' });
  cache.discardFrom(1);
  assert.deepStrictEqual(cache.getPage(0), [{ occurrenceId: 'q:0' }]);
  assert.strictEqual(cache.getPage(2), null);
  assert.strictEqual(cache.descriptor(2), null, 'discarded out-of-range pages must not retain stale sequence descriptors');
  assert.strictEqual(cache.snapshot().residentPages, 1);
  assert.strictEqual(cache.snapshot().residentRecords, 1);
}());

(function rejectsOversizedPagesWithoutBreakingBounds() {
  var cache = BoundedQueueCache.create({ pageSize: 40, maxPages: 5, maxRecords: 200 });
  var records = [];
  var index;
  for (index = 0; index < 41; index += 1) { records.push({ occurrenceId: 'q:' + index }); }
  assert.throws(function () {
    cache.putPage(0, records, { total: 41 });
  }, /page size/i);
  assert.strictEqual(cache.snapshot().residentRecords, 0);
}());


(function retainsOnlyALightweightPageSignatureAfterEviction() {
  var cache = BoundedQueueCache.create({ pageSize: 2, maxPages: 1, maxRecords: 2 });
  cache.putPage(0, [{ ratingKey: 'a' }, { ratingKey: 'b' }], { total: 4, signature: 'sig-ab' });
  cache.putPage(2, [{ ratingKey: 'c' }, { ratingKey: 'd' }], { total: 4, signature: 'sig-cd' });
  assert.strictEqual(cache.getPage(0), null);
  assert.strictEqual(cache.descriptor(0).signature, 'sig-ab', 'evicted descriptors may retain one compact sequence fingerprint');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(cache.descriptor(0), 'records'), false, 'descriptors must not retain item arrays');
}());

console.log('Bounded queue cache checks passed');
