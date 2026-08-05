(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffQueueGapView = factory();
  }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var documentRef = values.document;
    var ProgressiveImages = values.ProgressiveImages;
    var resolveImageUrl = values.resolveImageUrl;
    var rootNode = documentRef.getElementById('queue-gap-dialog');
    var titleNode = documentRef.getElementById('queue-gap-title');
    var bodyNode = documentRef.getElementById('queue-gap-body');
    var imageNode = documentRef.getElementById('queue-gap-image');
    var targetTitleNode = documentRef.getElementById('queue-gap-target-title');
    var targetMetaNode = documentRef.getElementById('queue-gap-target-meta');
    var stayButton = documentRef.getElementById('queue-gap-stay');
    var proceedButton = documentRef.getElementById('queue-gap-continue');
    var lastOpen = false;
    var lastFocus = -1;
    var lastArtworkUrl = '';

    function text(value) { return String(value || ''); }
    function setText(node,value){value=text(value);if(node.textContent!==value){node.textContent=value;}}

    function clearAttribute(target, name) {
      if (target && target.removeAttribute) { target.removeAttribute(name); }
    }

    function renderArtwork(confirmation) {
      var source=text(confirmation&&confirmation.artwork),size,url='';
      if(source&&ProgressiveImages&&ProgressiveImages.renderedSize&&typeof resolveImageUrl==='function'){
        size=ProgressiveImages.renderedSize(imageNode,142,213);
        url=text(resolveImageUrl(source,size.width,size.height));
        if(url!==lastArtworkUrl){lastArtworkUrl=url;imageNode.src=url;}
      }else if(lastArtworkUrl){
        lastArtworkUrl='';
        if(imageNode&&imageNode.removeAttribute){imageNode.removeAttribute('src');}
        else if(imageNode){imageNode.src='';}
      }
      if(imageNode){imageNode.alt='';}
    }

    function renderFocus(focus) {
      var buttons = [stayButton, proceedButton];
      var selected = Number(focus) === 1 ? 1 : 0;
      var index;
      for (index = 0; index < buttons.length; index += 1) {
        if (buttons[index]) { buttons[index].className = index === selected ? 'is-focused' : ''; }
      }
      if ((!lastOpen || selected !== lastFocus) && buttons[selected] && buttons[selected].focus) { buttons[selected].focus(); }
      lastFocus = selected;
    }

    function hide() {
      renderArtwork(null);
      rootNode.className = 'queue-gap-dialog is-hidden';
      rootNode.setAttribute('aria-hidden', 'true');
      clearAttribute(rootNode, 'data-confirmation-token');
      clearAttribute(rootNode, 'data-target-occurrence');
      if (stayButton) { stayButton.className = ''; }
      if (proceedButton) { proceedButton.className = ''; }
      if (rootNode.contains && rootNode.contains(documentRef.activeElement) && documentRef.activeElement && documentRef.activeElement.blur) {
        documentRef.activeElement.blur();
      }
      lastOpen = false;
      lastFocus = -1;
    }

    function render(snapshot, labels) {
      var state = snapshot || {};
      var confirmation = state.confirmation || {};
      labels = labels || {};
      if (!state.open) { hide(); return; }
      rootNode.className = 'queue-gap-dialog is-open';
      rootNode.setAttribute('aria-hidden', 'false');
      rootNode.setAttribute('data-confirmation-token', text(confirmation.token));
      rootNode.setAttribute('data-target-occurrence', text(confirmation.targetOccurrenceId || confirmation.target && confirmation.target.occurrenceId));
      setText(titleNode,labels.title);
      setText(bodyNode,labels.body);
      setText(targetTitleNode,confirmation.title||confirmation.target&&confirmation.target.item&&confirmation.target.item.title);
      setText(targetMetaNode,labels.targetMeta);
      setText(stayButton,labels.stay);
      setText(proceedButton,labels.proceed);
      renderArtwork(confirmation);
      renderFocus(state.focus);
      lastOpen = true;
    }

    return { render: render };
  }

  return { create: create };
}));
