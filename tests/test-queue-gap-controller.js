'use strict';

var assert = require('assert');
var Controller;

try {
  Controller = require('../app/coordinator/queue-gap-controller');
} catch (error) {
  Controller = null;
}

assert.ok(Controller, 'the queue gap controller module must exist');

function confirmation(token) {
  return {
    kind: 'combined',
    token: token || 'gap-1',
    generation: 4,
    direction: 1,
    missingSeasons: { start: 3, end: 3 },
    missingEpisodes: { start: 1, end: 2 },
    targetOccurrenceId: 'series:s4:e3:episode-43',
    target: {
      occurrenceId: 'series:s4:e3:episode-43',
      seasonNumber: 4,
      episodeNumber: 3,
      item: { ratingKey: 'episode-43', type: 'episode', title: 'Return', image: '/return.jpg' }
    }
  };
}

(function opensOnceMovesAndCancelsSafely() {
  var states = [];
  var cancellations = [];
  var controller = Controller.create({
    isValid: function () { return true; },
    onState: function (state) { states.push(state); },
    onCancel: function (value) { cancellations.push(value.token); }
  });
  assert.strictEqual(controller.open(confirmation()), true);
  assert.strictEqual(controller.snapshot().focus, 0, 'gap confirmation must default to the non-destructive action');
  assert.strictEqual(controller.open(confirmation()), false, 'opening the same token twice must not duplicate the modal');
  assert.strictEqual(states.length, 1, 'repeated activation must not publish another modal state');
  controller.move(-1);
  assert.strictEqual(states.length, 1, 'moving toward the already-selected action must not republish modal state');
  controller.move(1);
  assert.strictEqual(controller.snapshot().focus, 1);
  controller.move(-1);
  assert.strictEqual(controller.snapshot().focus, 0);
  assert.strictEqual(controller.activate(), 'cancel');
  assert.deepStrictEqual(cancellations, ['gap-1']);
  assert.strictEqual(controller.snapshot().open, false);
}());

(function confirmsOnlyTheStillValidTarget() {
  var valid = true;
  var confirmed = [];
  var controller = Controller.create({
    isValid: function (value) { return valid && value.token === 'gap-confirm'; },
    onConfirm: function (target, value) { confirmed.push([target.occurrenceId, value.token]); }
  });
  controller.open(confirmation('gap-confirm'));
  controller.move(1);
  assert.strictEqual(controller.activate(), 'confirm');
  assert.deepStrictEqual(confirmed, [['series:s4:e3:episode-43', 'gap-confirm']]);
  assert.strictEqual(controller.snapshot().open, false);

  valid = false;
  controller.open(confirmation('gap-stale'));
  controller.move(1);
  assert.strictEqual(controller.activate(), false, 'stale confirmation must not publish a playback target');
  assert.strictEqual(confirmed.length, 1);
  assert.strictEqual(controller.snapshot().open, false, 'stale state must be dismissed');
}());

(function handlesRemoteKeysAndInvalidation() {
  var cancelled = 0;
  var controller = Controller.create({
    isValid: function () { return true; },
    onCancel: function () { cancelled += 1; }
  });
  controller.open(confirmation('keys'));
  assert.strictEqual(controller.handleKey({ keyCode: 39 }, 'right'), true);
  assert.strictEqual(controller.snapshot().focus, 1);
  assert.strictEqual(controller.handleKey({ keyCode: 37 }, 'left'), true);
  assert.strictEqual(controller.snapshot().focus, 0);
  assert.strictEqual(controller.handleKey({ keyCode: 461 }, ''), true);
  assert.strictEqual(cancelled, 1);

  controller.open(confirmation('invalidated'));
  controller.invalidate();
  assert.strictEqual(controller.snapshot().open, false);
  assert.strictEqual(cancelled, 1, 'origin invalidation must close silently rather than acting as a user cancellation');
  controller.destroy();
  controller.destroy();
  assert.strictEqual(controller.open(confirmation('after-destroy')), false);
}());

console.log('Queue gap controller checks passed');
