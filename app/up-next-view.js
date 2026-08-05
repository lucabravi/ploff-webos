(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffUpNextView = factory();
  }
}(this, function () {
  'use strict';

  function create(options) {
    var documentRef = options.document;
    var ProgressiveImages = options.ProgressiveImages;
    var resolveImageUrl = options.resolveImageUrl;
    var rootNode = documentRef.getElementById('autoplay-prompt');
    var titleNode = documentRef.getElementById('autoplay-title');
    var seriesNode = documentRef.getElementById('autoplay-series');
    var imageNode = documentRef.getElementById('autoplay-image');
    var progressNode = documentRef.getElementById('autoplay-progress');
    var playButton = documentRef.getElementById('autoplay-play');
    var cancelButton = documentRef.getElementById('autoplay-cancel');
    var lastVisible = false;
    var lastFocus = -1;
    var lastProgressKey = '';

    function text(value) { return value || ''; }

    function progressKey(item, snapshot) {
      return String(item.ratingKey || item.key || item.imageSource || item.imageUrl || item.title || '') + '|' + String(snapshot.total || '');
    }

    function forceLayout(node) {
      if (node) { return node.offsetWidth; }
      return 0;
    }

    function resetProgress() {
      progressNode.style.transition = 'none';
      progressNode.style.width = '0%';
      lastProgressKey = '';
    }

    function renderProgress(snapshot, item) {
      var key = progressKey(item, snapshot);
      var remaining = Math.max(0, Number(snapshot.seconds || 0));
      if (lastVisible && key === lastProgressKey) { return; }
      progressNode.style.transition = 'none';
      progressNode.style.width = Math.round(Number(snapshot.progress || 0) * 100) + '%';
      forceLayout(progressNode);
      progressNode.style.transition = 'width ' + Math.round(remaining * 1000) + 'ms linear';
      progressNode.style.width = '0%';
      lastProgressKey = key;
    }

    function renderFocus(snapshot) {
      var buttons = [cancelButton, playButton];
      var target = buttons[snapshot.focus] || playButton;
      var index;
      for (index = 0; index < buttons.length; index += 1) {
        buttons[index].className = index === snapshot.focus ? 'is-focused' : '';
      }
      if ((!lastVisible || lastFocus !== snapshot.focus) && target && target.focus) { target.focus(); }
      lastVisible = true;
      lastFocus = snapshot.focus;
    }

    function renderImage(item, layout) {
      var source = text(item.imageSource || '');
      var fallbackWidth = layout === 'bottom-panel' ? 164 : 136;
      var fallbackHeight = layout === 'bottom-panel' ? 104 : 184;
      var size;
      if (source && ProgressiveImages && ProgressiveImages.renderedSize && typeof resolveImageUrl === 'function') {
        size = ProgressiveImages.renderedSize(imageNode, fallbackWidth, fallbackHeight);
        imageNode.src = text(resolveImageUrl(source, size.width, size.height));
      } else if (item.imageUrl || item.thumb) { imageNode.src = text(item.imageUrl || item.thumb); }
      else { imageNode.removeAttribute('src'); }
      imageNode.alt = '';
    }

    function render(snapshot, labels) {
      var item = snapshot.item || {};
      if (!snapshot.visible) {
        rootNode.className = 'autoplay-prompt is-hidden';
        rootNode.setAttribute('aria-hidden', 'true');
        playButton.className = '';
        cancelButton.className = '';
        if (rootNode.contains(documentRef.activeElement) && documentRef.activeElement.blur) { documentRef.activeElement.blur(); }
        lastVisible = false;
        lastFocus = -1;
        resetProgress();
        return;
      }
      rootNode.className = 'autoplay-prompt is-' + snapshot.layout + (item.action === 'home' ? ' is-home-target' : '');
      rootNode.setAttribute('aria-hidden', 'false');
      titleNode.textContent = text(item.title);
      seriesNode.textContent = text(item.grandparentTitle || item.parentTitle);
      renderImage(item, snapshot.layout);
      renderProgress(snapshot, item);
      documentRef.getElementById('autoplay-countdown').textContent = labels.countdown;
      playButton.textContent = labels.play || playButton.textContent;
      cancelButton.textContent = labels.cancel || cancelButton.textContent;
      renderFocus(snapshot);
    }

    return { render: render };
  }

  return { create: create };
}));
