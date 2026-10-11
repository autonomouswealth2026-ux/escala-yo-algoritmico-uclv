// Web Worker v2: genera DOCX y PDF sin bloquear
// Normaliza caracteres especiales para PDF (ASCII seguro)

function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function norm(s) {
  var t = String(s);
  var out = '';
  for (var i = 0; i < t.length; i++) {
    var c = t.charCodeAt(i);
    var r = null;
    if (c === 225 || c === 233 || c === 237 || c === 243 || c === 250) r = 'aeiou'.charAt([225,233,237,243,250].indexOf(c));
    else if (c === 193 || c === 201 || c === 205 || c === 211 || c === 218) r = 'AEIOU'.charAt([193,201,205,211,218].indexOf(c));
    else if (c === 241) r = 'n';
    else if (c === 209) r = 'N';
    else if (c === 252) r = 'u';
    else if (c === 220) r = 'U';
    else if (c === 191) r = '?';
    else if (c === 161) r = '!';
    else if (c === 945) r = 'a';
    else if (c === 969) r = 'w';
    else if (c === 947) r = 'g';
    else if (c === 8804) r = '<=';
    else if (c === 8805) r = '>=';
    else if (c === 8594) r = '->';
    else if (c === 215) r = 'x';
    else if (c === 8211 || c === 8212) r = '-';
    else if (c < 32 || c > 126) r = '?';
    out += (r !== null ? r : t[i]);
  }
  return out;
}

function crc32(data) {
  if (!crc32.t) {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    crc32.t = t;
  }
  var crc = 0xFFFFFFFF;
  for (var i = 0; i < data.length; i++) crc = crc32.t[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function buildZip(files) {
  var enc = new TextEncoder();
  var offset = 0, parts = [], central = [];
  for (var fi = 0; fi < files.length; fi++) {
    var f = files[fi];
    var nb = enc.encode(f.name);
    var db = typeof f.content === 'string' ? enc.encode(f.content) : f.content;
    var crc = crc32(db);
    var lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, db.length, true); lh.setUint32(22, db.length, true);
    lh.setUint16(26, nb.length, true);
    parts.push(new Uint8Array(lh.buffer), nb, db);
    central.push({nb: nb, crc: crc, sz: db.length, off: offset});
    offset += 30 + nb.length + db.length;
  }
  var cdStart = offset, cdSize = 0;
  for (var ci = 0; ci < central.length; ci++) {
    var e = central[ci];
    var ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
    ch.setUint32(16, e.crc, true); ch.setUint32(20, e.sz, true); ch.setUint32(24, e.sz, true);
    ch.setUint16(28, e.nb.length, true); ch.setUint32(42, e.off, true);
    parts.push(new Uint8Array(ch.buffer), e.nb);
    cdSize += 46 + e.nb.length;
  }
  var end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, central.length, true); end.setUint16(10, central.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, cdStart, true);
  parts.push(new Uint8Array(end.buffer));
  var total = 0;
  for (var pi = 0; pi < parts.length; pi++) total += parts[pi].length;
  var out = new Uint8Array(total), o = 0;
  for (var qi = 0; qi < parts.length; qi++) { out.set(parts[qi], o); o += parts[qi].length; }
  return out;
}

function genDocx(secs) {
  var body = '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="44"/><w:color w:val="1E3A8A"/></w:rPr><w:t>INFORME EYA-28</w:t></w:r></w:p>';
  body += '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/><w:color w:val="64748B"/></w:rPr><w:t>Escala del Yo Algoritmico - UCLV</w:t></w:r></w:p>';
  body += '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="20"/><w:color w:val="64748B"/></w:rPr><w:t>Generado: ' + escXml(new Date().toLocaleString('es-ES')) + '</w:t></w:r></w:p>';
  for (var si = 0; si < secs.length; si++) {
    var s = secs[si];
    body += '<w:p><w:pPr><w:shd w:fill="2563EB" w:val="clear"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="28"/></w:rPr><w:t>' + escXml(s.titulo) + '</w:t></w:r></w:p>';
    var ps = s.parrafos || [];
    for (var pi = 0; pi < ps.length; pi++) {
      body += '<w:p><w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>' + escXml(ps[pi]) + '</w:t></w:r></w:p>';
    }
    var tbs = s.tablas || [];
    for (var ti = 0; ti < tbs.length; ti++) {
      var tb = tbs[ti];
      if (!tb.length) continue;
      body += '<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="6" w:color="CBD5E1"/><w:left w:val="single" w:sz="6" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="6" w:color="CBD5E1"/><w:right w:val="single" w:sz="6" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="6" w:color="CBD5E1"/><w:insideV w:val="single" w:sz="6" w:color="CBD5E1"/></w:tblBorders></w:tblPr>';
      for (var ri = 0; ri < tb.length; ri++) {
        body += '<w:tr>';
        if (ri === 0) body += '<w:trPr><w:tblHeader/></w:trPr>';
        var row = tb[ri];
        for (var ci = 0; ci < row.length; ci++) {
          var isH = ri === 0;
          body += '<w:tc><w:tcPr><w:shd w:fill="' + (isH ? '1E293B' : 'F8FAFC') + '" w:val="clear"/></w:tcPr><w:p><w:r><w:rPr>' + (isH ? '<w:b/><w:color w:val="FFFFFF"/>' : '<w:color w:val="1E293B"/>') + '<w:sz w:val="20"/></w:rPr><w:t>' + escXml(row[ci]) + '</w:t></w:r></w:p></w:tc>';
        }
        body += '</w:tr>';
      }
      body += '</w:tbl><w:p><w:r><w:t></w:t></w:r></w:p>';
    }
  }
  var dx = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>';
  var ct = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
  var rl = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
  return buildZip([{name:'[Content_Types].xml',content:ct},{name:'_rels/.rels',content:rl},{name:'word/document.xml',content:dx}]);
}

function pdfEsc(s) {
  var t = norm(s);
  return t.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').substring(0, 180);
}

function genPDF(secs) {
  var enc = new TextEncoder();
  var pages = [], content = '', y = 800;
  function np() { if (content) pages.push(content); content = ''; y = 800; }
  function tx(t, sz, bold, col) {
    var words = String(t).split(' '), line = '', maxC = Math.floor(500 / (sz * 0.55));
    var lines = [];
    for (var wi = 0; wi < words.length; wi++) {
      var test = line ? line + ' ' + words[wi] : words[wi];
      if (test.length > maxC && line) { lines.push(line); line = words[wi]; } else line = test;
    }
    if (line) lines.push(line);
    if (!lines.length) lines = [''];
    for (var li = 0; li < lines.length; li++) {
      if (y < 50) np();
      content += 'BT /F' + (bold ? '2' : '1') + ' ' + sz + ' Tf ' + (col || '0 0 0') + ' rg 50 ' + y + ' Td (' + pdfEsc(lines[li]) + ') Tj ET\n';
      y -= sz + 3;
    }
  }
  function tbl(rows) {
    if (!rows.length) return;
    var nc = 0;
    for (var i = 0; i < rows.length; i++) nc = Math.max(nc, rows[i].length);
    if (!nc) return;
    var cw = 500 / nc;
    for (var ri = 0; ri < rows.length; ri++) {
      if (y < 60) np();
      var h = 18;
      if (ri === 0) content += '0.12 0.16 0.23 rg 50 ' + (y - h) + ' 500 ' + h + ' re f\n';
      for (var ci = 0; ci < rows[ri].length; ci++) {
        var x = 50 + ci * cw;
        content += '0.8 0.84 0.88 RG 0.5 w ' + x.toFixed(1) + ' ' + (y - h) + ' ' + cw.toFixed(1) + ' ' + h + ' re S\n';
        var cell = String(rows[ri][ci]).substring(0, Math.max(1, Math.floor(cw / 5)));
        content += 'BT /F' + (ri === 0 ? '2' : '1') + ' 8 Tf ' + (ri === 0 ? '1 1 1' : '0 0 0') + ' rg ' + (x + 3).toFixed(1) + ' ' + (y - 13) + ' Td (' + pdfEsc(cell) + ') Tj ET\n';
      }
      y -= h;
    }
    y -= 10;
  }
  np();
  y = 700;
  tx('INFORME EYA-28', 28, true, '0.12 0.23 0.54'); y -= 10;
  tx('Escala del Yo Algoritmico - UCLV', 14, false, '0.4 0.45 0.55');
  tx('Generado: ' + new Date().toLocaleString('es-ES'), 10, false, '0.4 0.45 0.55');
  y -= 20;
  for (var si = 0; si < secs.length; si++) {
    var s = secs[si];
    if (y < 100) np();
    tx(s.titulo, 16, true, '0.15 0.39 0.92'); y -= 5;
    var ps = s.parrafos || [];
    for (var pi = 0; pi < ps.length; pi++) { tx(ps[pi], 10, false); y -= 3; }
    var tbs = s.tablas || [];
    for (var ti = 0; ti < tbs.length; ti++) tbl(tbs[ti]);
    y -= 10;
  }
  if (content) pages.push(content);
  var pdf = '%PDF-1.4\n', offs = [0], n = 1;
  offs[n] = pdf.length; pdf += n + ' 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'; n++;
  var pgs = n++;
  offs[n] = pdf.length; pdf += n + ' 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'; var f1 = n++;
  offs[n] = pdf.length; pdf += n + ' 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n'; var f2 = n++;
  var pgn = [];
  for (var qi = 0; qi < pages.length; qi++) {
    var cn = n++;
    offs[cn] = pdf.length;
    var cb = enc.encode(pages[qi]);
    pdf += cn + ' 0 obj\n<< /Length ' + cb.length + ' >>\nstream\n' + pages[qi] + '\nendstream\nendobj\n';
    var pn = n++;
    offs[pn] = pdf.length;
    pdf += pn + ' 0 obj\n<< /Type /Page /Parent ' + pgs + ' 0 R /MediaBox [0 0 595 842] /Contents ' + cn + ' 0 R /Resources << /Font << /F1 ' + f1 + ' 0 R /F2 ' + f2 + ' 0 R >> >> >>\nendobj\n';
    pgn.push(pn);
  }
  offs[pgs] = pdf.length;
  pdf += pgs + ' 0 obj\n<< /Type /Pages /Kids [' + pgn.map(function(x){return x+' 0 R';}).join(' ') + '] /Count ' + pgn.length + ' >>\nendobj\n';
  var xr = pdf.length;
  pdf += 'xref\n0 ' + n + '\n0000000000 65535 f \n';
  for (var xi = 1; xi < n; xi++) pdf += String(offs[xi] || 0).padStart(10, '0') + ' 00000 n \n';
  pdf += 'trailer\n<< /Size ' + n + ' /Root 1 0 R >>\nstartxref\n' + xr + '\n%%EOF';
  return enc.encode(pdf);
}

function b64(b) {
  var s = '';
  for (var i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
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
    self.postMessage({status: 'done', docxB64: b(db), pdfB64: b(pb), spsB64: sb});
  } catch (err) {
    self.postMessage({status: 'error', message: String(err && err.message || err)});
  }
};
