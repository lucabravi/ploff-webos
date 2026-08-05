(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffApplicationSession = factory();
  }
}(this, function () {
  'use strict';

  var FIELDS = [
    'view',
    'returnView',
    'settings',
    'config',
    'activeServer',
    'activeProfile',
    'selectedItem',
    'playbackIdentity'
  ];

  function defaultState() {
    return {
      view: 'home',
      returnView: 'home',
      settings: {},
      config: {},
      activeServer: null,
      activeProfile: null,
      selectedItem: null,
      playbackIdentity: null
    };
  }

  function copyValue(value, sources, copies) {
    var result;
    var key;
    var index;
    if (!value || typeof value !== 'object') { return value; }
    sources = sources || [];
    copies = copies || [];
    index = sources.indexOf(value);
    if (index !== -1) { return copies[index]; }
    if (Object.prototype.toString.call(value) === '[object Array]') {
      result = [];
      sources.push(value);
      copies.push(result);
      for (index = 0; index < value.length; index += 1) {
        result.push(copyValue(value[index], sources, copies));
      }
      return result;
    }
    result = {};
    sources.push(value);
    copies.push(result);
    for (key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) { result[key] = copyValue(value[key], sources, copies); }
    }
    return result;
  }

  function copyState(state) {
    var result = {};
    FIELDS.forEach(function (field) {
      result[field] = copyValue(state[field]);
    });
    return result;
  }

  function sameValue(left, right, seenLeft, seenRight) {
    var leftKeys;
    var rightKeys;
    var index;
    var key;
    var leftIsArray;
    var rightIsArray;
    if (left === right) { return true; }
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object') { return false; }
    seenLeft = seenLeft || [];
    seenRight = seenRight || [];
    index = seenLeft.indexOf(left);
    if (index !== -1) { return seenRight[index] === right; }
    seenLeft.push(left);
    seenRight.push(right);
    leftIsArray = Object.prototype.toString.call(left) === '[object Array]';
    rightIsArray = Object.prototype.toString.call(right) === '[object Array]';
    if (leftIsArray || rightIsArray) {
      if (!leftIsArray || !rightIsArray || left.length !== right.length) { return false; }
      for (index = 0; index < left.length; index += 1) {
        if (!sameValue(left[index], right[index], seenLeft, seenRight)) { return false; }
      }
      return true;
    }
    leftKeys = Object.keys(left);
    rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) { return false; }
    for (index = 0; index < leftKeys.length; index += 1) {
      key = leftKeys[index];
      if (!Object.prototype.hasOwnProperty.call(right, key) || !sameValue(left[key], right[key], seenLeft, seenRight)) { return false; }
    }
    return true;
  }

  function create(initial) {
    var state = defaultState();
    var listeners = [];
    var destroyed = false;

    function apply(values) {
      FIELDS.forEach(function (field) {
        if (values && Object.prototype.hasOwnProperty.call(values, field)) { state[field] = copyValue(values[field]); }
      });
    }

    /** @returns {PloffApplicationSessionSnapshot} */
    function snapshot() {
      return /** @type {PloffApplicationSessionSnapshot} */ (copyState(state));
    }

    function view() {
      return state.view;
    }

    function update(patch) {
      var changed = false;
      var next;
      var published;

      FIELDS.forEach(function (field) {
        if (patch && Object.prototype.hasOwnProperty.call(patch, field) && !sameValue(state[field], patch[field])) {
          state[field] = copyValue(patch[field]);
          changed = true;
        }
      });

      next = snapshot();
      if (!changed || destroyed) {
        return next;
      }

      published = listeners.slice();
      published.forEach(function (listener) {
        listener(snapshot());
      });
      return next;
    }

    function subscribe(listener) {
      var active = true;
      if (destroyed || typeof listener !== 'function') {
        return function () {};
      }
      listeners.push(listener);
      return function () {
        var index;
        if (!active) { return; }
        active = false;
        index = listeners.indexOf(listener);
        if (index >= 0) {
          listeners.splice(index, 1);
        }
      };
    }

    function destroy() {
      if (destroyed) { return; }
      destroyed = true;
      listeners = [];
    }

    apply(initial || {});

    return {
      snapshot: snapshot,
      view: view,
      update: update,
      subscribe: subscribe,
      destroy: destroy
    };
  }

  return {
    create: create
  };
}));
