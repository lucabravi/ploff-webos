(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./vendor/qrcode-generator'));
  } else {
    root.PloffSupportQr = factory(root.qrcode);
  }
}(this, function (qrcode) {
  'use strict';

  var MAX_INPUT = 2800;

  function create(value) {
    var text = String(value || '');
    var generator;
    var size;
    var modules;
    var row;
    var column;
    if (!qrcode || typeof qrcode !== 'function') { throw new Error('QR encoder unavailable'); }
    if (!text || text.length > MAX_INPUT) { throw new Error('QR payload too large'); }
    generator = qrcode(0, 'L');
    generator.addData(text, 'Byte');
    generator.make();
    size = generator.getModuleCount();
    modules = [];
    for (row = 0; row < size; row += 1) {
      modules[row] = [];
      for (column = 0; column < size; column += 1) { modules[row][column] = generator.isDark(row, column); }
    }
    return { version: (size - 17) / 4, size: size, modules: modules };
  }

  function render(target, qr, options) {
    var values = options || {};
    var margin = Number(values.margin === undefined ? 4 : values.margin);
    var pixels = Number(values.pixels || 420);
    var context;
    var cell;
    var row;
    var column;
    var table;
    var tr;
    var td;
    if (!target || !qr || !qr.modules) { return false; }
    margin = Math.max(2, margin);
    pixels = Math.max(160, pixels);
    context = target.getContext && target.getContext('2d');
    if (context) {
      target.width = pixels;
      target.height = pixels;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, pixels, pixels);
      cell = pixels / (qr.size + margin * 2);
      context.fillStyle = '#000000';
      for (row = 0; row < qr.size; row += 1) {
        for (column = 0; column < qr.size; column += 1) {
          if (qr.modules[row][column]) { context.fillRect((column + margin) * cell, (row + margin) * cell, cell + 0.5, cell + 0.5); }
        }
      }
      return true;
    }
    if (!target.ownerDocument || !target.ownerDocument.createElement) { return false; }
    table = target.ownerDocument.createElement('table');
    table.className = 'support-qr-table';
    table.setAttribute('role', 'img');
    table.setAttribute('aria-label', values.label || 'Ploff support QR code');
    table.style.borderCollapse = 'collapse';
    table.style.backgroundColor = '#fff';
    table.style.padding = margin + 'px';
    for (row = -margin; row < qr.size + margin; row += 1) {
      tr = target.ownerDocument.createElement('tr');
      for (column = -margin; column < qr.size + margin; column += 1) {
        td = target.ownerDocument.createElement('td');
        td.style.width = '6px';
        td.style.height = '6px';
        td.style.padding = '0';
        td.style.backgroundColor = row >= 0 && column >= 0 && row < qr.size && column < qr.size && qr.modules[row][column] ? '#000' : '#fff';
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }
    target.innerHTML = '';
    target.appendChild(table);
    return true;
  }

  return { MAX_INPUT: MAX_INPUT, create: create, render: render };
}));
