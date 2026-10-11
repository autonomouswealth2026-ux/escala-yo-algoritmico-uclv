// Web Worker v3: jsPDF profesional + DOCX manual
importScripts('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');

var COL = {
  primary: [30, 58, 138],
  accent: [37, 99, 235],
  dark: [30, 41, 59],
  gray: [100, 116, 139],
  light: [248, 250, 252],
  white: [255, 255, 255]
};

function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ============ DOCX (manual, UTF-8 completo) ============
function crc32(d) {
  if (!crc32.t) {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
    crc32.t = t;
  }
  var r = 0xFFFFFFFF;
  for (var i = 0; i < d.length; i++) r = crc32.t[(r ^ d[i]) & 0xFF] ^ (r >>> 8);
  return (r ^ 0xFFFFFFFF) >>> 0;
}
function bzip(files) {
  var enc = new TextEncoder(), off = 0, parts = [], cent = [];
  files.forEach(function(f) {
    var nb = enc.encode(f.name), db = typeof f.content === 'string' ? enc.encode(f.content) : f.content;
    var cr = crc32(db), lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true);
    lh.setUint32(14, cr, true); lh.setUint32(18, db.length, true); lh.setUint32(22, db.length, true);
    lh.setUint16(26, nb.length, true);
    parts.push(new Uint8Array(lh.buffer), nb, db);
    cent.push({nb: nb, cr: cr, sz: db.length, off: off});
    off += 30 + nb.length + db.length;
  });
  var cs = off, csz = 0;
  cent.forEach(function(e) {
    var ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
    ch.setUint32(16, e.cr, true); ch.setUint32(20, e.sz, true); ch.setUint32(24, e.sz, true);
    ch.setUint16(28, e.nb.length, true); ch.setUint32(42, e.off, true);
    parts.push(new Uint8Array(ch.buffer), e.nb); csz += 46 + e.nb.length;
  });
  var en = new DataView(new ArrayBuffer(22));
  en.setUint32(0, 0x06054b50, true); en.setUint16(8, cent.length, true); en.setUint16(10, cent.length, true);
  en.setUint32(12, csz, true); en.setUint32(16, cs, true);
  parts.push(new Uint8Array(en.buffer));
  var tot = 0; parts.forEach(function(p) { tot += p.length; });
  var out = new Uint8Array(tot), o = 0;
  parts.forEach(function(p) { out.set(p, o); o += p.length; });
  return out;
}
function genDocx(secs) {
  var b = '';
  b += '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="120"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="52"/><w:color w:val="1E3A8A"/></w:rPr><w:t>INFORME EYA-28</w:t></w:r></w:p>';
  b += '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="60"/></w:pPr><w:r><w:rPr><w:sz w:val="26"/><w:color w:val="475569"/></w:rPr><w:t>Escala del Yo Algorítmico</w:t></w:r></w:p>';
  b += '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr><w:r><w:rPr><w:sz w:val="22"/><w:color w:val="64748B"/></w:rPr><w:t>Universidad Central "Marta Abreu" de Las Villas · Psicología</w:t></w:r></w:p>';
  b += '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="480"/></w:pPr><w:r><w:rPr><w:sz w:val="20"/><w:color w:val="94A3B8"/></w:rPr><w:t>Generado: ' + escXml(new Date().toLocaleString('es-ES')) + '</w:t></w:r></w:p>';
  secs.forEach(function(s) {
    b += '<w:p><w:pPr><w:shd w:fill="1E3A8A" w:val="clear"/><w:spacing w:before="360" w:after="180"/><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="30"/></w:rPr><w:t>' + escXml(s.titulo) + '</w:t></w:r></w:p>';
    (s.parrafos || []).forEach(function(p) {
      b += '<w:p><w:pPr><w:spacing w:after="120"/><w:jc w:val="both"/></w:pPr><w:r><w:rPr><w:sz w:val="22"/><w:color w:val="334155"/></w:rPr><w:t>' + escXml(p) + '</w:t></w:r></w:p>';
    });
    (s.tablas || []).forEach(function(tb) {
      if (!tb.length) return;
      b += '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="6" w:color="CBD5E1"/><w:left w:val="single" w:sz="6" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="6" w:color="CBD5E1"/><w:right w:val="single" w:sz="6" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="6" w:color="CBD5E1"/><w:insideV w:val="single" w:sz="6" w:color="CBD5E1"/></w:tblBorders><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr>';
      tb.forEach(function(row, ri) {
        b += '<w:tr>' + (ri === 0 ? '<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>' : '<w:trPr><w:cantSplit/></w:trPr>');
        row.forEach(function(cell) {
          var h = ri === 0;
          b += '<w:tc><w:tcPr><w:shd w:fill="' + (h ? '1E293B' : (ri % 2 ? 'F1F5F9' : 'FFFFFF')) + '" w:val="clear"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:r><w:rPr>' + (h ? '<w:b/><w:color w:val="FFFFFF"/>' : '<w:color w:val="1E293B"/>') + '<w:sz w:val="20"/></w:rPr><w:t>' + escXml(cell) + '</w:t></w:r></w:p></w:tc>';
        });
        b += '</w:tr>';
      });
      b += '</w:tbl><w:p><w:r><w:t></w:t></w:r></w:p>';
    });
  });
  var dx = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + b + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/><w:pgNumType/></w:sectPr></w:body></w:document>';
  var ct = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
  var rl = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
  return bzip([{name: '[Content_Types].xml', content: ct}, {name: '_rels/.rels', content: rl}, {name: 'word/document.xml', content: dx}]);
}

// ============ PDF con jsPDF ============
function genPDF(secs) {
  var doc = new jspdf.jsPDF({unit: 'mm', format: 'a4'});
  var W = 210, M = 15, CW = W - 2 * M, y = 0;

  function header() {
    doc.setFillColor(30, 58, 138); doc.rect(0, 0, W, 8, 'F');
    doc.setFontSize(7); doc.setTextColor(255, 255, 255);
    doc.text('EYA-28 · Escala del Yo Algorítmico · UCLV', M, 5.5);
  }
  function footer(pg) {
    doc.setFontSize(8); doc.setTextColor(148, 163, 184);
    doc.text('Página ' + pg, W - M, 292, {align: 'right'});
    doc.text('Generado: ' + new Date().toLocaleDateString('es-ES'), M, 292);
  }
  function check(h) { if (y + h > 275) { footer(doc.getNumberOfPages()); doc.addPage(); header(); y = 18; } }

  // Portada
  doc.setFillColor(30, 58, 138); doc.rect(0, 0, W, 70, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(30);
  doc.text('INFORME EYA-28', W / 2, 30, {align: 'center'});
  doc.setFontSize(13); doc.setFont('helvetica', 'normal');
  doc.text('Escala del Yo Algorítmico', W / 2, 42, {align: 'center'});
  doc.setFontSize(10); doc.setTextColor(191, 219, 254);
  doc.text('Universidad Central "Marta Abreu" de Las Villas · Psicología', W / 2, 52, {align: 'center'});
  doc.setTextColor(100, 116, 139); doc.setFontSize(9);
  doc.text('Generado: ' + new Date().toLocaleString('es-ES'), W / 2, 85, {align: 'center'});
  doc.setDrawColor(37, 99, 235); doc.setLineWidth(0.8); doc.line(W / 2 - 25, 90, W / 2 + 25, 90);
  y = 105; header();

  secs.forEach(function(s) {
    check(20);
    doc.setFillColor(30, 58, 138); doc.rect(M, y - 1, CW, 9, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    var tt = s.titulo.length > 80 ? s.titulo.substring(0, 77) + '...' : s.titulo;
    doc.text(tt, M + 3, y + 5.5); y += 14;
    (s.parrafos || []).forEach(function(p) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(51, 65, 85);
      var ls = doc.splitTextToSize(p, CW);
      ls.forEach(function(ln) { check(6); doc.text(ln, M, y); y += 5.2; });
      y += 3;
    });
    (s.tablas || []).forEach(function(tb) {
      if (!tb.length) return;
      var hd = tb[0].map(function(c) { return String(c); });
      var bd = tb.slice(1).map(function(r) { return r.map(function(c) { return String(c); }); });
      doc.autoTable({
        head: [hd], body: bd, startY: y, margin: {left: M, right: M},
        styles: {fontSize: 8, cellPadding: 2.2, textColor: [30, 41, 59], lineColor: [203, 213, 225], lineWidth: 0.15},
        headStyles: {fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', fontSize: 8.2},
        alternateRowStyles: {fillColor: [241, 245, 249]},
        didDrawPage: function() { header(); }
      });
      y = doc.lastAutoTable.finalY + 7;
    });
    y += 4;
  });
  var np = doc.getNumberOfPages();
  for (var i = 1; i <= np; i++) { doc.setPage(i); if (i > 1) header(); footer(i); }
  return doc.output('arraybuffer');
}

function b64(b) {
  var u = b instanceof Uint8Array ? b : new Uint8Array(b), s = '';
  for (var i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192));
  return btoa(s);
}

self.onmessage = function(e) {
  try {
    var d = e.data;
    self.postMessage({status: 'docx'});
    var db = genDocx(d.secciones);
    self.postMessage({status: 'pdf'});
    var pb = genPDF(d.secciones);
    self.postMessage({status: 'sps'});
    var sb = btoa(unescape(encodeURIComponent(d.sps)));
    self.postMessage({status: 'done', docxB64: b64(db), pdfB64: b64(pb), spsB64: sb});
  } catch (err) {
    self.postMessage({status: 'error', message: String((err && err.message) || err)});
  }
};
