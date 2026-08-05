'use strict';

var assert = require('assert');
var QueueSequenceContract;

try {
  QueueSequenceContract = require('../app/coordinator/queue-sequence-contract');
} catch (error) {
  QueueSequenceContract = null;
}

assert.ok(QueueSequenceContract, 'the queue sequence contract module must exist');
assert.strictEqual(
  QueueSequenceContract.occurrenceIdentity('playlist-7', 41, 'episode-9'),
  'playlist-7:41:episode-9',
  'occurrence identity must include the origin, absolute position, and media identity'
);
assert.strictEqual(
  QueueSequenceContract.seriesOccurrenceIdentity('series-show-1-regular', 4, 3, 'episode-43'),
  'series-show-1-regular:s4:e3:episode-43',
  'series occurrence identity must encode season and episode positions without entering container indexing'
);
assert.strictEqual(QueueSequenceContract.isPlayable({ ratingKey: 'e1', type: 'episode' }), true);
assert.strictEqual(QueueSequenceContract.isPlayable({ ratingKey: 'm1', type: 'movie' }), true);
assert.strictEqual(QueueSequenceContract.isPlayable({ ratingKey: 's1', type: 'show' }), false);

assert.notStrictEqual(
  QueueSequenceContract.occurrenceIdentity('playlist-7', 3, 'episode-9'),
  QueueSequenceContract.occurrenceIdentity('playlist-7', 19, 'episode-9'),
  'repeated media in one queue must remain distinct occurrences'
);
assert.strictEqual(
  QueueSequenceContract.sameOccurrence(
    { occurrenceId: 'playlist-7:3:episode-9' },
    { occurrenceId: 'playlist-7:3:episode-9' }
  ),
  true,
  'the stable occurrence identity must drive stale-response checks'
);
assert.strictEqual(
  QueueSequenceContract.sameOccurrence(
    { occurrenceId: 'playlist-7:3:episode-9' },
    { occurrenceId: 'playlist-7:19:episode-9' }
  ),
  false,
  'two occurrences of the same media must not share DOM or artwork identity'
);

assert.deepStrictEqual(
  QueueSequenceContract.adjacentState('available', {
    occurrenceId: 'playlist-7:4:episode-10',
    absoluteIndex: 4,
    item: { ratingKey: 'episode-10', type: 'episode' }
  }),
  {
    state: 'available',
    occurrenceId: 'playlist-7:4:episode-10',
    absoluteIndex: 4,
    item: { ratingKey: 'episode-10', type: 'episode' }
  },
  'available targets must preserve semantic position together with the playable item'
);
assert.deepStrictEqual(
  QueueSequenceContract.adjacentState('resolving'),
  { state: 'resolving' },
  'resolving state must not expose a speculative playback target'
);
assert.deepStrictEqual(
  QueueSequenceContract.adjacentState('unavailable'),
  { state: 'unavailable' },
  'unavailable state must be explicit'
);
assert.deepStrictEqual(
  QueueSequenceContract.adjacentState('confirmation-required', null, {
    kind: 'season-gap',
    fromSeason: 1,
    toSeason: 3
  }),
  {
    state: 'confirmation-required',
    confirmation: { kind: 'season-gap', fromSeason: 1, toSeason: 3 }
  },
  'gap traversal must require confirmation without exposing a playback target'
);

assert.throws(function () {
  QueueSequenceContract.adjacentState('available', {
    item: { ratingKey: 'episode-10', type: 'episode' }
  });
}, /occurrence/i, 'an incomplete available target must never reach playback');
assert.throws(function () {
  QueueSequenceContract.adjacentState('available', {
    occurrenceId: 'playlist-7:4:episode-10',
    item: { ratingKey: 'show-1', type: 'show' }
  });
}, /playable/i, 'non-playable containers must never reach playback');

assert.strictEqual(
  QueueSequenceContract.seriesScope({ seasonNumber: 0 }),
  'specials',
  'Specials origin must remain isolated'
);
assert.strictEqual(
  QueueSequenceContract.seriesScope({ seasonNumber: 2 }),
  'regular',
  'regular-season origin must exclude Specials'
);
assert.strictEqual(
  QueueSequenceContract.seasonInScope('specials', 0),
  true,
  'Specials traversal accepts season zero'
);
assert.strictEqual(
  QueueSequenceContract.seasonInScope('specials', 1),
  false,
  'Specials traversal never crosses into regular seasons'
);
assert.strictEqual(
  QueueSequenceContract.seasonInScope('regular', 0),
  false,
  'regular traversal excludes Specials completely'
);

console.log('Queue sequence contract checks passed');
