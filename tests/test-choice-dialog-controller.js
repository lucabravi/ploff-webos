'use strict';

var assert = require('assert');
var ChoiceDialogController = require('../app/coordinator/choice-dialog-controller');

function createHarness() {
  var calls = [];
  var state = { open: false, index: 0, choices: [] };
  var view = {
    open: function (title, choices, selectedValue, variant, previewOptions) {
      var index;
      calls.push(['open', title, selectedValue, variant, previewOptions]);
      state.open = true;
      state.choices = choices.slice();
      state.index = 0;
      for (index = 0; index < state.choices.length; index += 1) {
        if (String(state.choices[index].value) === String(selectedValue)) { state.index = index; break; }
      }
    },
    close: function () { calls.push(['close']); state.open = false; },
    move: function (direction) {
      state.index = Math.max(0, Math.min(state.choices.length, state.index + direction));
      calls.push(['move', direction]);
    },
    focus: function (index) { state.index = index; calls.push(['focus', index]); },
    selected: function () { return state.choices[state.index] || null; },
    snapshot: function () { return { open: state.open, index: state.index, choices: state.choices.slice() }; }
  };
  var creates = 0;
  var controller = ChoiceDialogController.create({
    document: {},
    ChoiceDialogView: {
      create: function () { creates += 1; return view; }
    }
  });
  return { controller: controller, calls: calls, creates: function () { return creates; } };
}

(function ownsOneViewAndRejectsEmptyChoices() {
  var h = createHarness();
  assert.strictEqual(h.creates(), 1, 'the controller must own exactly one ChoiceDialogView');
  assert.deepStrictEqual(h.controller.snapshot(), { open: false, index: 0, title: '', choices: [], destroyed: false });
  assert.strictEqual(h.controller.open({ title: 'Empty', choices: [] }), false, 'an empty picker must not open');
  assert.strictEqual(h.calls.length, 0, 'empty choices must not touch the view');
}());

(function forwardsVisualPreviewContextToTheView() {
  var h = createHarness();
  h.controller.open({
    title: 'Artwork quality',
    choices: [{ value: 90, label: '90%' }],
    selectedValue: 90,
    variant: 'artwork-quality',
    previewOptions: { cardScale: 120 }
  });
  assert.deepStrictEqual(h.calls[0], ['open', 'Artwork quality', 90, 'artwork-quality', { cardScale: 120 }], 'visual preview context must reach the reusable view unchanged');
}());

(function remoteAndPointerInputApplyOrCancelExactlyOnce() {
  var h = createHarness();
  var applied = [];
  var returned = 0;
  var closed = [];
  var prevented = 0;
  assert.strictEqual(h.controller.open({
    title: 'Audio',
    choices: [{ value: 'a', label: 'English' }, { value: 'b', label: 'Italiano' }],
    selectedValue: 'b',
    apply: function (choice) { applied.push(choice.value); },
    returnFocus: function () { returned += 1; },
    onClose: function (didApply, choice) { closed.push([didApply, choice && choice.value]); }
  }), true);
  assert.strictEqual(h.controller.snapshot().index, 1, 'opening must focus the current value');
  h.controller.handleKey({ keyCode: 38, preventDefault: function () { prevented += 1; } }, 'up');
  assert.strictEqual(h.controller.snapshot().index, 0, 'Up must move to the previous choice');
  h.controller.pointerFocus(1);
  assert.strictEqual(h.controller.snapshot().index, 1, 'pointer focus must move without applying');
  h.controller.pointerFocus(0);
  h.controller.handleKey({ keyCode: 13, preventDefault: function () {} }, '');
  assert.deepStrictEqual(applied, ['a'], 'semantic OK must apply the pointer-focused choice once');
  assert.strictEqual(returned, 1, 'closing must restore focus once');
  assert.deepStrictEqual(closed, [[true, 'a']], 'close callback must identify an applied selection');
  assert.strictEqual(h.controller.snapshot().open, false);
  assert.strictEqual(prevented, 1, 'handled remote input must be consumed');

  h.controller.open({
    title: 'Subtitles',
    choices: [{ value: '', label: 'Off' }],
    selectedValue: '',
    apply: function () { applied.push('unexpected'); },
    returnFocus: function () { returned += 1; },
    onClose: function (didApply, choice) { closed.push([didApply, choice && choice.value]); }
  });
  h.controller.handleKey({ keyCode: 461, preventDefault: function () { prevented += 1; } }, '');
  assert.deepStrictEqual(applied, ['a'], 'Back must cancel without applying');
  assert.strictEqual(returned, 2, 'cancel must still restore focus');
  assert.deepStrictEqual(closed[1], [false, ''], 'cancel callback must receive the selected value without applying it');
}());


(function visibleCancelUsesTheSameCloseCommandAsBack() {
  var h = createHarness();
  var applied = 0;
  var closed = [];
  h.controller.open({
    title: 'Quality',
    choices: [{ value: 'original', label: 'Original' }],
    selectedValue: 'original',
    apply: function () { applied += 1; },
    onClose: function (didApply) { closed.push(didApply); }
  });
  h.controller.pointerFocus(1);
  h.controller.handleKey({ keyCode: 13, preventDefault: function () {} }, '');
  assert.strictEqual(applied, 0, 'OK on the visible Cancel action must not apply a value');
  assert.deepStrictEqual(closed, [false], 'visible Cancel and Back must share cancellation semantics');
}());

(function reentrantApplyKeepsTheNewDialogOpen() {
  var h = createHarness();
  h.controller.open({
    title: 'First',
    choices: [{ value: 'first', label: 'First' }],
    selectedValue: 'first',
    apply: function () {
      h.controller.open({
        title: 'Second',
        choices: [{ value: 'second', label: 'Second' }],
        selectedValue: 'second'
      });
    }
  });
  h.controller.close(true);
  assert.strictEqual(h.controller.snapshot().open, true, 'a dialog opened by an apply callback must not be cleared by the previous close');
  assert.strictEqual(h.controller.snapshot().title, 'Second');
}());

(function reentrantCloseDoesNotRestoreFocusBehindTheNewDialog() {
  var h = createHarness();
  var firstReturns = 0;
  var secondReturns = 0;
  h.controller.open({
    title: 'First',
    choices: [{ value: 'first', label: 'First' }],
    selectedValue: 'first',
    returnFocus: function () { firstReturns += 1; },
    apply: function () {
      h.controller.open({
        title: 'Second',
        choices: [{ value: 'second', label: 'Second' }],
        selectedValue: 'second',
        returnFocus: function () { secondReturns += 1; }
      });
    }
  });
  h.controller.close(true);
  assert.strictEqual(firstReturns, 0, 'the replaced dialog must not restore focus behind its successor');
  assert.strictEqual(h.controller.snapshot().title, 'Second');
  h.controller.close(false);
  assert.strictEqual(secondReturns, 1, 'the active dialog must restore focus when it actually closes');
}());

(function destroyIsIdempotentAndBlocksFutureWork() {
  var h = createHarness();
  h.controller.open({ title: 'One', choices: [{ value: '1', label: 'One' }] });
  h.controller.destroy();
  h.controller.destroy();
  assert.strictEqual(h.controller.snapshot().destroyed, true);
  assert.strictEqual(h.controller.snapshot().open, false);
  assert.strictEqual(h.controller.open({ title: 'Two', choices: [{ value: '2', label: 'Two' }] }), false, 'destroyed controllers must not reopen');
}());

console.log('Choice dialog controller checks passed');
