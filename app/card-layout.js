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
  var profiles = {};

  function supportedScale(value) {
    var scale = Number(value);
    return SCALES.indexOf(scale) === -1 ? 100 : scale;
  }

  function scaled(value, factor) {
    return Math.max(1, Math.round(value * factor));
  }

  function previewSize(width, height) {
    var scale = 96 / Math.max(width, height);
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale))
    };
  }

  function freeze(value) {
    return typeof Object.freeze === 'function' ? Object.freeze(value) : value;
  }

  function buildProfile(scale) {
    var factor = scale / 100;
    var imageHeight = scaled(BASE.imageHeight, factor);
    var captionHeight = scaled(BASE.captionHeight, factor);
    var wideImageHeight = scaled(BASE.wideImageHeight, factor);
    var metrics = freeze({
      width: scaled(BASE.width, factor),
      imageHeight: imageHeight,
      captionHeight: captionHeight,
      height: imageHeight + captionHeight,
      columnStep: scaled(BASE.columnStep, factor),
      rowStep: scaled(BASE.rowStep, factor)
    });
    var wideMetrics = freeze({
      width: scaled(BASE.wideWidth, factor),
      imageHeight: wideImageHeight,
      captionHeight: captionHeight,
      height: wideImageHeight + captionHeight
    });
    var posterPreview = previewSize(metrics.width, metrics.imageHeight);
    var widePreview = previewSize(wideMetrics.width, wideMetrics.imageHeight);
    return freeze({
      scale: scale,
      metrics: metrics,
      wideMetrics: wideMetrics,
      poster: freeze({
        width: metrics.width,
        height: metrics.imageHeight,
        previewWidth: posterPreview.width,
        previewHeight: posterPreview.height
      }),
      widePoster: freeze({
        width: wideMetrics.width,
        height: wideMetrics.imageHeight,
        previewWidth: widePreview.width,
        previewHeight: widePreview.height
      }),
      posterGap: Math.max(7, metrics.columnStep - metrics.width),
      titleFont: Math.max(20, Math.round(23 * scale / 100)),
      metaFont: Math.max(20, Math.round(20 * scale / 100))
    });
  }

  function profile(value) {
    var scale = supportedScale(value);
    if (!profiles[scale]) { profiles[scale] = buildProfile(scale); }
    return profiles[scale];
  }

  function metrics(value) {
    return profile(value).metrics;
  }

  function wideMetrics(value) {
    return profile(value).wideMetrics;
  }

  function columns(containerWidth, value) {
    return Math.max(1, Math.floor(Math.max(1, Number(containerWidth) || 1) / profile(value).metrics.columnStep));
  }

  return {
    SCALES: SCALES.slice(),
    columns: columns,
    metrics: metrics,
    profile: profile,
    supportedScale: supportedScale,
    wideMetrics: wideMetrics
  };
}));
