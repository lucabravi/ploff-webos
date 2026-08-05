'use strict';

var assert = require('assert');
var MediaInfoDialogController = require('../app/coordinator/media-info-dialog-controller');

function createHarness() {
  var calls = [];
  var closed = [];
  var closeButton = { onclick: null };
  var viewState = { open: false, origin: '' };
  var view = {
    open: function (model, origin) {
      calls.push(['open', model, origin]);
      if (!model || model.reject) { return false; }
      viewState.open = true;
      viewState.origin = String(origin || '');
      return true;
    },
    close: function () { calls.push(['close']); viewState.open = false; viewState.origin = ''; },
    scroll: function (direction) { calls.push(['scroll', direction]); },
    snapshot: function () { return { open: viewState.open, origin: viewState.origin }; }
  };
  var creates = 0;
  var controller = MediaInfoDialogController.create({
    document: {
      getElementById: function (id) { return id === 'media-info-dialog-close' ? closeButton : null; }
    },
    MediaInfoView: {
      create: function () { creates += 1; return view; }
    },
    t: function (key) { return key; },
    onClosed: function (origin) { closed.push(origin); }
  });
  return { controller: controller, calls: calls, closed: closed, closeButton: closeButton, creates: function () { return creates; } };
}

(function ownsOneViewAndRejectsInvalidModels() {
  var h = createHarness();
  assert.strictEqual(h.creates(), 1, 'the controller must own exactly one MediaInfoView');
  assert.deepStrictEqual(h.controller.snapshot(), { open: false, origin: '', destroyed: false });
  assert.strictEqual(h.controller.open(null, 'detail'), false, 'missing models must not open the dialog');
  assert.strictEqual(h.controller.open({ reject: true }, 'detail'), false, 'view rejection must not publish an open state');
  assert.deepStrictEqual(h.controller.snapshot(), { open: false, origin: '', destroyed: false });
}());

(function remoteInputScrollsAndClosesWithOrigin() {
  var h = createHarness();
  var prevented = 0;
  var model = { sections: [{ title: 'Video', rows: [] }] };
  assert.strictEqual(h.controller.open(model, 'player'), true);
  assert.deepStrictEqual(h.controller.snapshot(), { open: true, origin: 'player', destroyed: false });
  h.controller.handleKey({ keyCode: 38, preventDefault: function () { prevented += 1; } }, 'up');
  h.controller.handleKey({ keyCode: 40, preventDefault: function () { prevented += 1; } }, 'down');
  assert.strictEqual(h.controller.scroll(1), true, 'features may request semantic dialog scrolling');
  assert.deepStrictEqual(h.calls.slice(-3), [['scroll', -1], ['scroll', 1], ['scroll', 1]], 'remote and semantic scrolling must use the owned view');
  h.controller.handleKey({ keyCode: 13, preventDefault: function () { prevented += 1; } }, '');
  assert.strictEqual(prevented, 3, 'handled dialog input must be consumed');
  assert.deepStrictEqual(h.closed, ['player'], 'closing must report the captured origin exactly once');
  assert.strictEqual(h.controller.snapshot().open, false);
}());

(function closeButtonUsesTheSameClosePath() {
  var h = createHarness();
  h.controller.open({ sections: [] }, 'detail');
  assert.strictEqual(typeof h.closeButton.onclick, 'function', 'the controller must own the close button');
  h.closeButton.onclick();
  assert.deepStrictEqual(h.closed, ['detail']);
  assert.strictEqual(h.controller.snapshot().open, false);
  assert.strictEqual(h.controller.close(), false, 'closing an already closed dialog must be a no-op');
}());

(function destroyIsIdempotentAndRemovesTheOwnedHandler() {
  var h = createHarness();
  h.controller.open({ sections: [] }, 'player');
  h.controller.destroy();
  h.controller.destroy();
  assert.strictEqual(h.closeButton.onclick, null, 'destroy must remove the close-button handler');
  assert.deepStrictEqual(h.closed, [], 'teardown must not publish a user close transition');
  assert.deepStrictEqual(h.controller.snapshot(), { open: false, origin: '', destroyed: true });
  assert.strictEqual(h.controller.open({ sections: [] }, 'detail'), false, 'destroyed controllers must not reopen');
}());

console.log('Media info dialog controller checks passed');
