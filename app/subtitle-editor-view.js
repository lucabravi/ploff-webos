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
    function alignmentClass(active) {
      var alignment;
      var index;
      var vertical;
      var horizontal;
      if (!active || !active.length || active[0].alignment === undefined) { return ''; }
      alignment = Number(active[0].alignment);
      if (!isFinite(alignment) || alignment < 1 || alignment > 9) { return ''; }
      for (index = 1; index < active.length; index += 1) {
        if (Number(active[index].alignment) !== alignment) { return ''; }
      }
      vertical = alignment > 6 ? 'top' : (alignment > 3 ? 'middle' : 'bottom');
      horizontal = alignment === 1 || alignment === 4 || alignment === 7 ? 'left' :
        (alignment === 3 || alignment === 6 || alignment === 9 ? 'right' : 'center');
      return ' srt-align-' + vertical + ' srt-align-' + horizontal;
    }
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
      overlay.className = 'subtitle-preview-overlay' + (lines.length ? alignmentClass(active) : '') + (lines.length ? '' : ' is-hidden');
    }
    function hideOverlay() { node('subtitle-preview-overlay').className = 'subtitle-preview-overlay is-hidden'; }
    function setOpen(open) { var editor = node('subtitle-editor'); editor.className = 'subtitle-editor' + (open ? '' : ' is-hidden'); editor.setAttribute('aria-hidden', open ? 'false' : 'true'); }
    function controlEnabled(data, name) {
      var capabilities = data && data.capabilities;
      var camelName;
      if (name === 'apply-season' && data && data.seasonAvailable !== true) { return false; }
      if (!capabilities) { return true; }
      if (Object.prototype.hasOwnProperty.call(capabilities, name)) { return capabilities[name] !== false; }
      camelName = name.replace(/-([a-z])/g, function (_match, letter) { return letter.toUpperCase(); });
      return !Object.prototype.hasOwnProperty.call(capabilities, camelName) || capabilities[camelName] !== false;
    }
    function render(model) {
      var data = model || {};
      var list = controls();
      var name;
      var baseClass;
      var enabled;
      var index;
      setText('subtitle-editor-status', data.status || '');
      setText('subtitle-editor-track', data.track || '');
      setText('subtitle-editor-size', Number(data.size || 100) + '%');
      setText('subtitle-editor-background', data.background || '');
      setText('subtitle-editor-edge', data.edge || '');
      setText('subtitle-editor-render-srt', data.renderSrtValue || '');
      setText('subtitle-editor-render-ass', data.renderAssValue || '');
      setText('subtitle-editor-offset', signedOffset(data.offsetMs));
      setText('subtitle-editor-current-time', data.currentTime || '0:00');
      setText('subtitle-editor-duration', data.duration || '0:00');
      node('subtitle-editor-timeline-progress').style.width = Math.max(0, Math.min(100, Number(data.progress || 0))) + '%';
      for (index = 0; index < list.length; index += 1) {
        name = list[index].getAttribute('data-subtitle-editor');
        baseClass = name === 'track' || name === 'size' || name === 'background' || name === 'edge' ? 'subtitle-editor-row subtitle-editor-choice-row' :
          (name === 'render-srt' || name === 'render-ass' ? 'subtitle-editor-row subtitle-editor-toggle-row' :
            (name === 'offset' ? 'subtitle-editor-row subtitle-editor-editable' :
              (name === 'loop' ? 'subtitle-editor-row subtitle-editor-loop-row' :
                (name === 'timeline' ? 'subtitle-editor-timeline-button subtitle-editor-editable' : 'subtitle-editor-action' + (name === 'apply' ? ' is-primary' : '')))));
        enabled = controlEnabled(data, name);
        list[index].className = baseClass + (index === data.index && enabled ? ' is-focused' : '') +
          (name === data.editing && enabled ? ' is-editing' : '') +
          (name === 'loop' && data.loop ? ' is-active' : '') +
          ((name === 'render-srt' && data.renderSrt) || (name === 'render-ass' && data.renderAss) ? ' is-checked' : '') +
          (enabled ? '' : ' is-disabled');
        list[index].disabled = !enabled;
        list[index].tabIndex = enabled ? 0 : -1;
        list[index].setAttribute('aria-disabled', enabled ? 'false' : 'true');
        if (name === 'apply-season') {
          list[index].className += data.seasonAvailable ? '' : ' is-hidden';
        }
        if (name === 'render-srt') { list[index].setAttribute('aria-pressed', data.renderSrt ? 'true' : 'false'); }
        if (name === 'render-ass') { list[index].setAttribute('aria-pressed', data.renderAss ? 'true' : 'false'); }
        if (name === 'loop') { list[index].setAttribute('aria-pressed', data.loop ? 'true' : 'false'); }
        if (name === 'offset' || name === 'timeline') { list[index].setAttribute('aria-pressed', name === data.editing && enabled ? 'true' : 'false'); }
      }
      if (!data.pointerActive && list[data.index] && !list[data.index].disabled && list[data.index].focus) { list[data.index].focus(); }
    }
    return { controls: controls, renderOverlay: renderOverlay, hideOverlay: hideOverlay, setOpen: setOpen, render: render };
  }
  return { create: create };
}));
