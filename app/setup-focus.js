(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffSetupFocus = factory(); }
}(this, function () {
  'use strict';
  function create(options) {
    var values = options || {};
    function apply(index) {
      var buttons = values.buttons();
      var cursor;
      var buttonIndex;
      if (!buttons.length) { return 0; }
      cursor = Math.max(0, Math.min(Number(index) || 0, buttons.length - 1));
      for (buttonIndex = 0; buttonIndex < buttons.length; buttonIndex += 1) {
        buttons[buttonIndex].className = buttons[buttonIndex].className.replace(/\s*is-focused/g, '');
      }
      buttons[cursor].className += ' is-focused';
      if (!values.isPointerSelectionActive()) { buttons[cursor].focus(); }
      return cursor;
    }
    return { apply: apply };
  }
  return { create: create };
}));
