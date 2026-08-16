'use strict';

var assert = require('assert');
var MediaInfoDialogController = require('../app/coordinator/media-info-dialog-controller');

function createHarness() {
  var calls = [];
  var closed = [];
  var closeButton = { onclick: null };
  var applyButton = { onclick: null };
  var prevButton = { onclick: null };
  var nextButton = { onclick: null };
  var scrollResults = [];
  var viewState = { open: false, origin: '' };
  var view = {
    open: function (model, origin) {
      calls.push(['open', model, origin]);
      if (!model || model.reject) { return false; }
      viewState.open = true;
      viewState.origin = String(origin || '');
      return true;
    },
    openVersions: function (frame) { calls.push(['open-versions', frame.label, frame.index, frame.count, frame.active, frame.showApply, frame.focus]); viewState.open = true; return true; },
    updateVersions: function (frame) { calls.push(['update-versions', frame.label, frame.index, frame.count, frame.active, frame.showApply, frame.focus]); },
    focusVersion: function (focus, showApply) { calls.push(['focus-version', focus, showApply]); },
    close: function () { calls.push(['close']); viewState.open = false; viewState.origin = ''; },
    scroll: function (direction) { calls.push(['scroll', direction]); return scrollResults.length ? scrollResults.shift() : true; },
    snapshot: function () { return { open: viewState.open, origin: viewState.origin }; }
  };
  var creates = 0;
  var controller = MediaInfoDialogController.create({
    document: {
      getElementById: function (id) {
        if (id === 'media-info-dialog-close') { return closeButton; }
        if (id === 'media-info-dialog-apply') { return applyButton; }
        if (id === 'media-info-dialog-version-prev') { return prevButton; }
        if (id === 'media-info-dialog-version-next') { return nextButton; }
        return null;
      }
    },
    MediaInfoView: {
      create: function () { creates += 1; return view; }
    },
    t: function (key) { return key; },
    onClosed: function (origin) { closed.push(origin); }
  });
  return { controller: controller, calls: calls, closed: closed, closeButton: closeButton, applyButton: applyButton, prevButton: prevButton, nextButton: nextButton, scrollResults: scrollResults, creates: function () { return creates; } };
}

(function ownsOneViewAndRejectsInvalidModels() {
  var h = createHarness();
  assert.strictEqual(h.creates(), 1, 'the controller must own exactly one MediaInfoView');
  assert.deepStrictEqual(h.controller.snapshot(), { open: false, origin: '', destroyed: false });
  assert.strictEqual(h.controller.open(null, 'detail'), false, 'missing models must not open the dialog');
  assert.strictEqual(h.controller.open({ reject: true }, 'detail'), false, 'view rejection must not publish an open state');
  assert.deepStrictEqual(h.controller.snapshot(), { open: false, origin: '', destroyed: false });
}());

(function versionBrowserPreviewsWithoutApplyingAndKeepsFooterReachable() {
  var h = createHarness();
  var applied = [];
  var choices = [
    { value: 'auto', label: 'Automatic · 1080p', model: { sections: [] } },
    { value: '1:0', label: '4K · HEVC', model: { sections: [] } },
    { value: '2:0', label: '1080p · H264', model: { sections: [] } }
  ];
  assert.strictEqual(h.controller.openVersions({ choices: choices, selectedValue: 'auto', apply: function (choice) { applied.push(choice.value); } }, 'detail'), true);
  assert.deepStrictEqual(h.controller.snapshot(), { open: true, origin: 'detail', destroyed: false, mode: 'versions', previewIndex: 0, focus: 'selector' });
  h.controller.handleKey({ keyCode: 39, preventDefault: function () {} }, 'right');
  assert.strictEqual(h.controller.snapshot().previewIndex, 1, 'Right must preview the next version without applying it');
  assert.deepStrictEqual(applied, [], 'preview movement must not mutate the selected version');
  assert.deepStrictEqual(h.calls[h.calls.length - 1].slice(0, 3), ['update-versions', '4K · HEVC', 1], 'technical preview must refresh immediately');
  h.controller.handleKey({ keyCode: 40, preventDefault: function () {} }, 'down');
  assert.strictEqual(h.controller.snapshot().focus, 'content', 'Down from the selector must enter the technical content');
  h.scrollResults.push(false);
  h.controller.handleKey({ keyCode: 40, preventDefault: function () {} }, 'down');
  assert.strictEqual(h.controller.snapshot().focus, 'cancel', 'an extra Down at the content bottom must reach the safe Cancel action');
  h.controller.handleKey({ keyCode: 39, preventDefault: function () {} }, 'right');
  assert.strictEqual(h.controller.snapshot().focus, 'apply', 'Right in the footer must reach Use this version');
  h.controller.handleKey({ keyCode: 13, preventDefault: function () {} }, '');
  assert.deepStrictEqual(applied, ['1:0'], 'OK on the apply action must commit the previewed version exactly once');
  assert.strictEqual(h.controller.snapshot().open, false);
}());

(function versionBrowserCancelAndSingleFileBehavior() {
  var h = createHarness();
  var applied = [];
  assert.strictEqual(h.controller.openVersions({ choices: [{ value: 'only', label: '1080p', model: { sections: [] } }], selectedValue: 'only', apply: function (choice) { applied.push(choice.value); } }, 'detail'), true);
  h.controller.handleKey({ keyCode: 40, preventDefault: function () {} }, 'down');
  h.scrollResults.push(false);
  h.controller.handleKey({ keyCode: 40, preventDefault: function () {} }, 'down');
  assert.strictEqual(h.controller.snapshot().focus, 'cancel', 'single-file details must still reach Cancel with arrows');
  h.controller.handleKey({ keyCode: 39, preventDefault: function () {} }, 'right');
  assert.strictEqual(h.controller.snapshot().focus, 'cancel', 'single-file details must not expose an unavailable apply focus');
  h.controller.handleKey({ keyCode: 13, preventDefault: function () {} }, '');
  assert.deepStrictEqual(applied, [], 'closing single-file technical information must not create a fake version override');

  h.controller.openVersions({ choices: [{ value: 'a', label: 'A', model: { sections: [] } }, { value: 'b', label: 'B', model: { sections: [] } }], selectedValue: 'a', apply: function (choice) { applied.push(choice.value); } }, 'detail');
  h.controller.handleKey({ keyCode: 39, preventDefault: function () {} }, 'right');
  h.controller.handleKey({ keyCode: 461, preventDefault: function () {} }, '');
  assert.deepStrictEqual(applied, [], 'Back must cancel a preview without applying it');
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
  assert.strictEqual(h.applyButton.onclick, null, 'destroy must remove the version-apply handler');
  assert.strictEqual(h.prevButton.onclick, null, 'destroy must remove the previous-version handler');
  assert.strictEqual(h.nextButton.onclick, null, 'destroy must remove the next-version handler');
  assert.deepStrictEqual(h.closed, [], 'teardown must not publish a user close transition');
  assert.deepStrictEqual(h.controller.snapshot(), { open: false, origin: '', destroyed: true });
  assert.strictEqual(h.controller.open({ sections: [] }, 'detail'), false, 'destroyed controllers must not reopen');
}());

console.log('Media info dialog controller checks passed');
