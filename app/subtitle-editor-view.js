(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffSubtitleEditorView = factory(); }
}(this, function () {
  'use strict';
  function create(options) {
    var values = options || {};
    var documentRef = values.document;
    function node(id) { return documentRef.getElementById(id); }
    function controls() { return documentRef.querySelectorAll('[data-subtitle-editor]'); }
    function text(value) {
      return String(value || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    }
    function setText(id, value) { if (values.setText) { values.setText(id, value); } else { node(id).textContent = String(value || ''); } }
    function signedOffset(value) { var offset = Math.round(Number(value || 0)); return (offset > 0 ? '+' : '') + offset + ' ms'; }
    function renderOverlay(cues, absoluteMs, offsetMs, size) {
      var overlay = node('subtitle-preview-overlay');
      var active = values.SubtitleSync.active(cues || [], absoluteMs, offsetMs || 0);
      var lines = [];
      overlay.innerHTML = '';
      active.forEach(function (cue) { text(cue.text).split('\n').forEach(function (line) { lines.push(line); }); });
      var textContainer = documentRef.createElement('span');
      textContainer.className = 'subtitle-preview-text';
      lines.forEach(function (line, index) {
        if (index > 0) { textContainer.appendChild(documentRef.createElement('br')); }
        textContainer.appendChild(documentRef.createTextNode(line));
      });
      if (lines.length) { overlay.appendChild(textContainer); }
      overlay.style.fontSize = Math.round(42 * Number(size || 100) / 100) + 'px';
      overlay.className = 'subtitle-preview-overlay' + (lines.length ? '' : ' is-hidden');
    }
    function hideOverlay() { node('subtitle-preview-overlay').className = 'subtitle-preview-overlay is-hidden'; }
    function setOpen(open) { var editor = node('subtitle-editor'); editor.className = 'subtitle-editor' + (open ? '' : ' is-hidden'); editor.setAttribute('aria-hidden', open ? 'false' : 'true'); }
    function render(model) {
      var data = model || {};
      var list = controls();
      var name;
      var baseClass;
      var index;
      setText('subtitle-editor-status', data.status || '');
      setText('subtitle-editor-track', data.track || '');
      setText('subtitle-editor-size', Number(data.size || 100) + '%');
      setText('subtitle-editor-offset', signedOffset(data.offsetMs));
      setText('subtitle-editor-current-time', data.currentTime || '0:00');
      setText('subtitle-editor-duration', data.duration || '0:00');
      node('subtitle-editor-timeline-progress').style.width = Math.max(0, Math.min(100, Number(data.progress || 0))) + '%';
      for (index = 0; index < list.length; index += 1) {
        name = list[index].getAttribute('data-subtitle-editor');
        baseClass = name === 'track' || name === 'size' ? 'subtitle-editor-row is-cycle' :
          (name === 'minus' || name === 'plus' ? 'subtitle-offset-button' :
            (name === 'timeline' ? 'subtitle-editor-timeline-button' : 'subtitle-editor-action' + (name === 'apply' ? ' is-primary' : '')));
        list[index].className = baseClass + (index === data.index ? ' is-focused' : '') +
          (name === 'loop' && data.loop ? ' is-active' : '');
      }
      if (!data.pointerActive && list[data.index] && list[data.index].focus) { list[data.index].focus(); }
    }
    return { controls: controls, renderOverlay: renderOverlay, hideOverlay: hideOverlay, setOpen: setOpen, render: render };
  }
  return { create: create };
}));
