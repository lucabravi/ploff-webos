(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffChapterState = factory();
  }
}(this, function () {
  'use strict';

  function create() {
    return { open: false, index: -1 };
  }

  function indexAt(chapters, timeOffset) {
    var values = chapters || [];
    var time = Math.max(0, Number(timeOffset || 0));
    var result = values.length ? 0 : -1;
    var index;
    for (index = 0; index < values.length; index += 1) {
      if (Number(values[index].startTimeOffset || 0) <= time) { result = index; }
      else { break; }
    }
    return result;
  }

  function open(state, chapters, timeOffset) {
    var index = indexAt(chapters, timeOffset);
    return { open: index !== -1, index: index };
  }

  function move(state, count, direction) {
    var maximum = Math.max(0, Number(count || 0) - 1);
    var current = Math.max(0, Number(state && state.index || 0));
    return {
      open: !!(state && state.open),
      index: Math.max(0, Math.min(maximum, current + (direction < 0 ? -1 : 1)))
    };
  }

  function close(state) {
    return { open: false, index: Number(state && state.index === -1 ? -1 : state && state.index || 0) };
  }

  function select(state, chapters) {
    var values = chapters || [];
    var index = Math.max(0, Math.min(values.length - 1, Number(state && state.index || 0)));
    var chapter = values[index] || null;
    return {
      state: close(state),
      chapter: chapter,
      seekSeconds: chapter ? Number(chapter.startTimeOffset || 0) / 1000 : null
    };
  }

  return { close: close, create: create, indexAt: indexAt, move: move, open: open, select: select };
}));
