(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffPresentationServices = factory(); }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var document = values.document;
    var I18n = values.I18n;
    var MediaLabels = values.MediaLabels;

    function currentSettings() {
      return typeof values.settings === 'function' ? (values.settings() || {}) : (values.settings || {});
    }

    function t(key, parameters) {
      var settings = currentSettings();
      if (I18n && typeof I18n.t === 'function') { return I18n.t(settings.uiLanguage || 'en', key, parameters); }
      return String(key || '');
    }

    function element(tagName, className, text) {
      var node = document && document.createElement ? document.createElement(tagName) : null;
      if (!node) { return null; }
      node.className = className || '';
      if (typeof text === 'string' && document.createTextNode) { node.appendChild(document.createTextNode(text)); }
      return node;
    }

    function updateNodeText(node, value) {
      if (!node) { return; }
      node.innerHTML = '';
      if (document && document.createTextNode) { node.appendChild(document.createTextNode(value || '')); }
      else { node.textContent = value || ''; }
    }

    function setText(id, value) {
      var node = document && document.getElementById ? document.getElementById(id) : null;
      updateNodeText(node, value);
    }

    function mediaKey(item) {
      item = item || {};
      return String(item.ratingKey || item.key || item.image || item.title || '');
    }

    function mediaTitle(item) { return MediaLabels ? MediaLabels.title(item, t) : String(item && item.title || ''); }
    function mediaMeta(item) { return MediaLabels ? MediaLabels.meta(item, t) : String(item && item.meta || ''); }
    function mediaDetail(item) { return MediaLabels ? MediaLabels.detail(item, t) : String(item && item.detail || ''); }
    function mediaCardMeta(item) { return MediaLabels ? MediaLabels.cardMeta(item, t) : String(item && item.meta || ''); }
    function mediaCardDetail(item) { return MediaLabels ? MediaLabels.cardDetail(item, t) : String(item && item.detail || ''); }

    function artworkUrl(item) {
      var source = item && (item.art || item.image) || '';
      return String(source).replace('/400/600', '/1280/720').replace('/640/360', '/1280/720');
    }

    return {
      artworkUrl: artworkUrl,
      element: element,
      mediaCardDetail: mediaCardDetail,
      mediaCardMeta: mediaCardMeta,
      mediaDetail: mediaDetail,
      mediaKey: mediaKey,
      mediaMeta: mediaMeta,
      mediaTitle: mediaTitle,
      setText: setText,
      t: t,
      updateText: updateNodeText
    };
  }

  return { create: create };
}));
