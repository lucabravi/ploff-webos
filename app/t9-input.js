(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffT9Input = factory(); }
}(this, function () {
  'use strict';

  var MAP = {
    '1': ".,?!'-",
    '2': 'abc',
    '3': 'def',
    '4': 'ghi',
    '5': 'jkl',
    '6': 'mno',
    '7': 'pqrs',
    '8': 'tuv',
    '9': 'wxyz'
  };

  function create(options) {
    var values = options || {};
    var timer = null;
    var digit = '';
    var index = 0;
    var pending = '';
    var delay = Number(values.delay || 700);

    function clearTimer() {
      values.root.clearTimeout(timer);
      timer = null;
    }

    function preview(character) {
      pending = character || '';
      if (values.onPreview) { values.onPreview(pending); }
    }

    function flush() {
      var character = pending;
      clearTimer();
      digit = '';
      index = 0;
      preview('');
      if (character && values.onCommit) { values.onCommit(character); }
      return character;
    }

    function schedule() {
      clearTimer();
      timer = values.root.setTimeout(flush, delay);
    }

    function normalize(value) {
      var number = Number(value);
      if (typeof value === 'string' && /^[0-9]$/.test(value)) { return value; }
      if (number >= 48 && number <= 57) { return String(number - 48); }
      if (number >= 96 && number <= 105) { return String(number - 96); }
      return '';
    }

    function inputKeyCode(value) {
      var nextDigit = normalize(value);
      var characters;
      if (!nextDigit) { return false; }
      if (nextDigit === '0') {
        flush();
        if (values.onCommit) { values.onCommit(' '); }
        return true;
      }
      characters = MAP[nextDigit];
      if (digit && digit !== nextDigit) { flush(); }
      if (digit === nextDigit) { index = (index + 1) % characters.length; }
      else { digit = nextDigit; index = 0; }
      preview(characters.charAt(index));
      schedule();
      return true;
    }

    function backspace() {
      if (!pending) { return false; }
      clearTimer();
      digit = '';
      index = 0;
      preview('');
      return true;
    }

    function cancel() {
      clearTimer();
      digit = '';
      index = 0;
      preview('');
    }

    return {
      backspace: backspace,
      cancel: cancel,
      flush: flush,
      inputKeyCode: inputKeyCode,
      snapshot: function () { return { digit: digit, pending: pending, index: index }; }
    };
  }

  return { MAP: MAP, create: create };
}));
