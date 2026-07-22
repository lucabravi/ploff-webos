(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffPlayerChaptersView = factory(); }
}(this, function () {
  'use strict';
  function create(options) {
    var values = options || {};
    var documentRef = values.document;
    function node(id) { return documentRef.getElementById(id); }
    function element(tagName, className, text) {
      var result = values.element ? values.element(tagName, className, text) : documentRef.createElement(tagName);
      if (!values.element) { result.className = className || ''; if (text !== undefined) { result.textContent = String(text); } }
      return result;
    }
    function title(chapter, index) { return chapter.title || values.t('player.chapter') + ' ' + String(index + 1); }
    function setOpenClass(open) {
      var view = node('player-view');
      view.className = view.className.replace(/\s*has-chapters-open/g, '') + (open ? ' has-chapters-open' : '');
    }
    function loadImage(image, chapter, priority) {
      var rect = image.getBoundingClientRect ? image.getBoundingClientRect() : null;
      var width = Math.ceil(rect && rect.width || image.clientWidth || 300);
      var height = Math.ceil(rect && rect.height || image.clientHeight || 132);
      var preview = values.ProgressiveImages.previewSize(width, height, 96);
      values.posterLoader.load(image, { source: chapter.thumb, previewWidth: preview.width, previewHeight: preview.height, width: width, height: height, priority: priority, scope: 'chapters' });
    }
    function ensureVisible(card) {
      var list = node('player-chapters-list');
      var left;
      var right;
      if (!card || !list) { return; }
      left = card.offsetLeft;
      right = left + card.offsetWidth;
      if (left < list.scrollLeft) { list.scrollLeft = Math.max(0, left - 5); }
      else if (right > list.scrollLeft + list.clientWidth) { list.scrollLeft = right - list.clientWidth + 5; }
    }
    function updateFocus(index, open) {
      var cards = documentRef.querySelectorAll('[data-chapter-index]');
      var card;
      var image;
      var item;
      for (item = 0; item < cards.length; item += 1) { cards[item].className = 'chapter-card' + (open && item === index ? ' is-focused' : ''); }
      card = open && cards[index];
      if (!card) { return; }
      image = card.getElementsByTagName('img')[0];
      if (image && values.posterLoader.prioritize) { values.posterLoader.prioritize(image); }
      ensureVisible(card);
      if (!values.pointerActive() && card.focus) { card.focus(); }
    }
    function render(chapters, state) {
      var drawer = node('player-chapters-drawer');
      var list = node('player-chapters-list');
      var images = [];
      var index;
      var card;
      var image;
      var caption;
      if (!state.open || !chapters.length) { drawer.className = 'player-chapters-drawer is-hidden'; list.innerHTML = ''; return; }
      list.innerHTML = '';
      for (index = 0; index < chapters.length; index += 1) {
        card = element('button', 'chapter-card'); card.type = 'button'; card.setAttribute('data-chapter-index', index);
        image = element('img', 'chapter-card-image'); image.alt = '';
        caption = element('span', 'chapter-card-caption');
        caption.appendChild(element('span', 'chapter-card-title', title(chapters[index], index)));
        caption.appendChild(element('span', 'chapter-card-time', values.formatTime(chapters[index].startTimeOffset / 1000)));
        card.appendChild(image); card.appendChild(caption); list.appendChild(card); images.push(image);
      }
      drawer.className = 'player-chapters-drawer'; setOpenClass(true);
      loadImage(images[state.index], chapters[state.index], 0);
      for (index = 0; index < chapters.length; index += 1) { if (index !== state.index) { loadImage(images[index], chapters[index], 1); } }
      updateFocus(state.index, true);
    }
    function renderHint(visible, focused) {
      node('player-chapters-hint').className = 'player-chapters-hint' + (!visible ? ' is-hidden' : '') + (visible && focused ? ' is-focused' : '');
    }
    function close() {
      values.posterLoader.cancelScope('chapters');
      node('player-chapters-drawer').className = 'player-chapters-drawer is-hidden';
      node('player-chapters-list').innerHTML = '';
      setOpenClass(false);
    }
    function reset() { close(); node('player-chapters-hint').className = 'player-chapters-hint is-hidden'; }
    function markHintReturning() { node('player-chapters-hint').className += ' is-returning'; }
    return { render: render, renderHint: renderHint, updateFocus: updateFocus, close: close, reset: reset, markHintReturning: markHintReturning };
  }
  return { create: create };
}));
