(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffSkipMarkerState = factory();
  }
}(this, function () {
  'use strict';

  function create() {
    return {
      marker: null,
      markerKey: '',
      visible: false,
      mode: 'hidden',
      deadline: 0,
      focusRequested: false,
      dismissed: false,
      consumed: false
    };
  }

  function copy(state) {
    return {
      marker: state.marker,
      markerKey: state.markerKey,
      visible: state.visible,
      mode: state.mode,
      deadline: state.deadline,
      focusRequested: state.focusRequested,
      dismissed: state.dismissed,
      consumed: state.consumed === true
    };
  }

  function activeMarker(markers, timeOffset) {
    var source = Object.prototype.toString.call(markers) === '[object Array]' ? markers : [];
    var current = Number(timeOffset);
    var index;
    if (!isFinite(current)) { return null; }
    for (index = 0; index < source.length; index += 1) {
      if (current >= Number(source[index].startTimeOffset) && current < Number(source[index].endTimeOffset)) {
        return source[index];
      }
    }
    return null;
  }

  function update(state, markers, timeOffset, now, durationSeconds, preserveConsumed) {
    var next = copy(state || create());
    var marker = activeMarker(markers, timeOffset);
    var duration = Number(durationSeconds);
    if (!marker) {
      if (next.consumed && preserveConsumed === true) {
        next.visible = false;
        next.mode = 'hidden';
        next.focusRequested = false;
        return next;
      }
      return create();
    }
    if (next.markerKey !== marker.key) {
      next.marker = marker;
      next.markerKey = marker.key;
      next.visible = true;
      next.mode = 'timed';
      next.deadline = Number(now) + (isFinite(duration) ? duration : 5) * 1000;
      next.focusRequested = true;
      next.dismissed = false;
      next.consumed = false;
      return next;
    }
    next.marker = marker;
    if (next.consumed) {
      next.visible = false;
      next.mode = 'hidden';
      next.focusRequested = false;
      return next;
    }
    if (next.mode === 'timed' && Number(now) >= next.deadline) {
      next.visible = false;
      next.mode = 'hidden';
      next.dismissed = true;
    }
    return next;
  }

  function showForControls(state, marker) {
    var next = copy(state || create());
    var requestFocus = !next.visible || next.mode !== 'controls';
    if (marker && next.markerKey !== marker.key) { next.consumed = false; }
    if (next.consumed && (marker || next.marker)) {
      next.marker = marker || next.marker;
      next.visible = false;
      next.mode = 'hidden';
      next.focusRequested = false;
      return next;
    }
    if (marker) {
      requestFocus = requestFocus || next.markerKey !== marker.key;
      next.marker = marker;
      next.markerKey = marker.key;
    }
    if (!next.marker) { return next; }
    next.visible = true;
    next.mode = 'controls';
    next.focusRequested = requestFocus;
    next.dismissed = false;
    return next;
  }

  function hideWithControls(state) {
    var next = copy(state || create());
    if (next.mode === 'controls') {
      next.visible = false;
      next.mode = 'hidden';
      next.focusRequested = false;
      next.dismissed = true;
    }
    return next;
  }

  function dismiss(state, consumed) {
    var next = copy(state || create());
    next.visible = false;
    next.mode = 'hidden';
    next.focusRequested = false;
    next.dismissed = true;
    next.consumed = next.consumed || consumed === true;
    return next;
  }

  function clearFocusRequest(state) {
    var next = copy(state || create());
    next.focusRequested = false;
    return next;
  }

  return {
    activeMarker: activeMarker,
    clearFocusRequest: clearFocusRequest,
    create: create,
    dismiss: dismiss,
    hideWithControls: hideWithControls,
    showForControls: showForControls,
    update: update
  };
}));
