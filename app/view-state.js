(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffViewState = factory();
  }
}(this, function () {
  'use strict';

  function model(kind, scope) {
    var stateKind = kind === 'loading' || kind === 'empty' ? kind : 'error';
    return {
      kind: stateKind,
      titleKey: 'state.' + stateKind,
      messageKey: 'state.' + scope + (stateKind === 'loading' ? 'Loading' : (stateKind === 'empty' ? 'Empty' : 'Error')),
      actions: stateKind === 'loading' ? [] : (stateKind === 'empty' ? ['back'] : ['retry', 'back'])
    };
  }

  function focusIndex(current, length, direction) {
    return Math.max(0, Math.min(Math.max(0, length - 1), Number(current || 0) + Number(direction || 0)));
  }

  return { focusIndex: focusIndex, model: model };
}));
