(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffCardLayout = factory();
  }
}(this, function () {
  'use strict';

  var SCALES = [70, 80, 90, 100, 110, 120, 130];
  var BASE = {
    width: 248,
    imageHeight: 370,
    captionHeight: 104,
    columnStep: 272,
    rowStep: 494,
    wideWidth: 338,
    wideImageHeight: 190
  };

  function supportedScale(value) {
    var scale = Number(value);
    return SCALES.indexOf(scale) === -1 ? 100 : scale;
  }

  function scaled(value, factor) {
    return Math.max(1, Math.round(value * factor));
  }

  function metrics(value) {
    var scale = supportedScale(value);
    var factor = scale / 100;
    var imageHeight = scaled(BASE.imageHeight, factor);
    var captionHeight = scaled(BASE.captionHeight, factor);
    return {
      width: scaled(BASE.width, factor),
      imageHeight: imageHeight,
      captionHeight: captionHeight,
      height: imageHeight + captionHeight,
      columnStep: scaled(BASE.columnStep, factor),
      rowStep: scaled(BASE.rowStep, factor)
    };
  }

  function wideMetrics(value) {
    var factor = supportedScale(value) / 100;
    var imageHeight = scaled(BASE.wideImageHeight, factor);
    var captionHeight = scaled(BASE.captionHeight, factor);
    return {
      width: scaled(BASE.wideWidth, factor),
      imageHeight: imageHeight,
      captionHeight: captionHeight,
      height: imageHeight + captionHeight
    };
  }

  function columns(containerWidth, value) {
    return Math.max(1, Math.floor(Math.max(1, Number(containerWidth) || 1) / metrics(value).columnStep));
  }

  return {
    SCALES: SCALES.slice(),
    columns: columns,
    metrics: metrics,
    supportedScale: supportedScale,
    wideMetrics: wideMetrics
  };
}));
