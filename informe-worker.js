// Web Worker: genera DOCX y PDF sin bloquear el hilo principal
// Recibe: { secciones, sps } | Devuelve: { docxB64, pdfB64, spsB64 }

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============ DOCX ============
function buildDocx(files) {
  // Implementación mínima de ZIP (store, sin compresión) para DOCX
  const enc = new TextEncoder();
  let offset = 0;
  const central = [];
  const parts = [];
  for (const f of files) {
    const nameB = enc.encode(f.name);
    const dataB = typeof f.content === 'string' ? enc.encode(f.content) : f.content;
    const crc = crc32(dataB);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0, true);
    lh.setUint16(8, 0, true);
    lh.setUint16(10, 0, true);
    lh.setUint16(12, 0, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, dataB.length, true);
    lh.setUint32(22, dataB.length, true);
    lh.setUint16(26, nameB.length, true);
    lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), nameB, dataB);
    central.push({ nameB, crc, size: dataB.length, offset });
    offset += 30 + nameB.length + dataB.length;
  }
  const cdStart = offset;
  let cdSize = 0;
  for (const e of central) {
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0, true);
    ch.setUint16(10, 0, true);
    ch.setUint16(12, 0, true);
    ch.setUint16(14, 0, true);
    ch.setUint32(16, e.crc, true);
    ch.setUint32(20, e.size, true);
    ch.setUint32(24, e.size, true);
    ch.setUint16(28, e.nameB.length, true);
    ch.setUint16(30, 0, true);
    ch.setUint16(32, 0, true);
    ch.setUint16(34, 0, true);
    ch.setUint16(36, 0, true);
    ch.setUint32(38, 0, true);
    ch.setUint32(42, e.offset, true);
    parts.push(new Uint8Array(ch.buffer), e.nameB);
    cdSize += 46 + e.nameB.length;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, central.length, true);
  end.setUint16(10, central.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, cdStart, true);
  parts.push(new Uint8Array(end.buffer));
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function crc32(data) {
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function generarDocx(secs) {
  let body = '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="44"/><w:color w:val="1E3A8A"/></w:rPr><w:t>INFORME EYA-28</w:t></w:r></w:p>';
  body += '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/><w:color w:val="64748B"/></w:rPr><w:t>Escala del Yo Algoritmico — UCLV</w:t></w:r></w:p>';
  body += '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="20"/><w:color w:val="64748B"/></w:rPr><w:t>Generado: ' + esc(new Date().toLocaleString('es-ES')) + '</w:t></w:r></w:p>';
  for (const s of secs) {
    body += '<w:p><w:pPr><w:shd w:fill="2563EB" w:val="clear"/><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="28"/></w:rPr><w:t>' + esc(s.titulo) + '</w:t></w:r></w:p>';
    for (const p of (s.parrafos || [])) {
      body += '<w:p><w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>' + esc(p) + '</w:t></w:r></w:p>';
    }
    for (const tb of (s.tablas || [])) {
      if (!tb.length) continue;
      body += '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="6" w:color="CBD5E1"/><w:left w:val="single" w:sz="6" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="6" w:color="CBD5E1"/><w:right w:val="single" w:sz="6" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="6" w:color="CBD5E1"/><w:insideV w:val="single" w:sz="6" w:color="CBD5E1"/></w:tblBorders></w:tblPr>';
      tb.forEach((row, ri) => {
        body += '<w:tr>';
        if (ri === 0) body += '<w:trPr><w:tblHeader/></w:trPr>';
        row.forEach(cell => {
          const isH = ri === 0;
          body += '<w:tc><w:tcPr><w:shd w:fill="' + (isH ? '1E293B' : 'F8FAFC') + '" w:val="clear"/><w:tcW w:w="0" w:type="auto"/></w:tcPr><w:p><w:r><w:rPr>' + (isH ? '<w:b/><w:color w:val="FFFFFF"/>' : '<w:color w:val="1E293B"/>') + '<w:sz w:val="20"/></w:rPr><w:t>' + esc(cell) + '</w:t></w:r></w:p></w:tc>';
        });
        body += '</w:tr>';
      });
      body += '</w:tbl>';
      body += '<w:p><w:r><w:t></w:t></w:r></w:p>';
    }
  }
  const docXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>';
  const ctXml = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
  const relsXml = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
  return buildDocx([
    { name: '[Content_Types].xml', content: ctXml },
    { name: '_rels/.rels', content: relsXml },
    { name: 'word/document.xml', content: docXml }
  ]);
}

// ============ PDF (generador mínimo profesional) ============
function generarPDF(secs) {
  // PDF 1.4 mínimo con texto y tablas simples
  const enc = new TextEncoder();
  let objs = [];
  let content = '';
  let y = 800;
  const PH = 842; // A4 alto en puntos

  function nuevaPagina() {
    if (content) objs.push({ type: 'content', data: content });
    content = 'BT /F1 10 Tf ET\n';
    y = 800;
  }
  function texto(t, size, bold, color) {
    const lines = wrapText(String(t), size);
    for (const ln of lines) {
      if (y < 50) nuevaPagina();
      const c = color || '0 0 0';
      content += 'BT /F' + (bold ? '2' : '1') + ' ' + size + ' Tf ' + c + ' rg 50 ' + y + ' Td (' + pdfEsc(ln) + ') Tj ET\n';
      y -= size + 3;
    }
  }
  function wrapText(t, size) {
    const maxChars = Math.floor(500 / (size * 0.55));
    const words = t.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (test.length > maxChars && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }
  function tabla(rows) {
    if (!rows.length) return;
    const colW = 500 / Math.max(...rows.map(r => r.length));
    for (let ri = 0; ri < rows.length; ri++) {
      if (y < 60) nuevaPagina();
      const row = rows[ri];
      const h = 18;
      // Fondo cabecera
      if (ri === 0) {
        content += '0.12 0.16 0.23 rg 50 ' + (y - h) + ' 500 ' + h + ' re f\n';
      }
      // Bordes y texto
      for (let ci = 0; ci < row.length; ci++) {
        const x = 50 + ci * colW;
        content += '0.8 0.84 0.88 RG 0.5 w ' + x + ' ' + (y - h) + ' ' + colW + ' ' + h + ' re S\n';
        const tc = ri === 0 ? '1 1 1' : '0 0 0';
        const cellT = String(row[ci]).substring(0, Math.floor(colW / 5));
        content += 'BT /F' + (ri === 0 ? '2' : '1') + ' 8 Tf ' + tc + ' rg ' + (x + 3) + ' ' + (y - 13) + ' Td (' + pdfEsc(cellT) + ') Tj ET\n';
      }
      y -= h;
    }
    y -= 10;
  }
  const WINANSI = {};
  WINANSI['\u00e1']='\\341'; WINANSI['\u00e9']='\\351'; WINANSI['\u00ed']='\\355';
  WINANSI['\u00f3']='\\363'; WINANSI['\u00fa']='\\372'; WINANSI['\u00f1']='\\361';
  WINANSI['\u00c1']='\\301'; WINANSI['\u00c9']='\\311'; WINANSI['\u00cd']='\\315';
  WINANSI['\u00d3']='\\323'; WINANSI['\u00da']='\\332'; WINANSI['\u00d1']='\\321';
  WINANSI['\u00bf']='\\277'; WINANSI['\u00a1']='\\241'; WINANSI['\u00b0']='\\260';
  function pdfEsc(s) {
    let t = String(s);
    let out = '';
    for (let i = 0; i < t.length && out.length < 180; i++) {
      const ch = t[i];
      if (WINANSI[ch]) out += WINANSI[ch];
      else if (ch === '\\') out += '\\\\';
      else if (ch === '(') out += '\\(';
      else if (ch === ')') out += '\\)';
      else if (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) > 126) out += '?';
      else out += ch;
    }
    return out;
  }

  nuevaPagina();
  // Portada
  y = 700;
  texto('INFORME EYA-28', 28, true, '0.12 0.23 0.54');
  y -= 10;
  texto('Escala del Yo Algoritmico — UCLV', 14, false, '0.4 0.45 0.55');
  texto('Generado: ' + new Date().toLocaleString('es-ES'), 10, false, '0.4 0.45 0.55');
  y -= 20;

  for (const s of secs) {
    if (y < 100) nuevaPagina();
    texto(s.titulo, 16, true, '0.15 0.39 0.92');
    y -= 5;
    for (const p of (s.parrafos || [])) {
      // Dividir párrafos largos en líneas
      const words = p.split(' ');
      let line = '';
      for (const w of words) {
        if ((line + ' ' + w).length > 95) {
          texto(line, 10, false);
          line = w;
        } else {
          line = line ? line + ' ' + w : w;
        }
      }
      if (line) texto(line, 10, false);
      y -= 3;
    }
    for (const tb of (s.tablas || [])) {
      tabla(tb);
    }
    y -= 10;
  }
  if (content) objs.push({ type: 'content', data: content });

  // Construir PDF
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  let objNum = 1;

  // Catálogo
  offsets[objNum] = pdf.length;
  pdf += objNum + ' 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  objNum++;

  // Páginas (placeholder, se llena después)
  const pagesObj = objNum++;

  // Fuentes
  offsets[objNum] = pdf.length;
  pdf += objNum + ' 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';
  const f1 = objNum++;
  offsets[objNum] = pdf.length;
  pdf += objNum + ' 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n';
  const f2 = objNum++;

  // Contenidos y páginas
  const pageObjs = [];
  for (const o of objs) {
    const cNum = objNum++;
    offsets[cNum] = pdf.length;
    const cb = enc.encode(o.data);
    pdf += cNum + ' 0 obj\n<< /Length ' + cb.length + ' >>\nstream\n' + o.data + '\nendstream\nendobj\n';
    const pNum = objNum++;
    offsets[pNum] = pdf.length;
    pdf += pNum + ' 0 obj\n<< /Type /Page /Parent ' + pagesObj + ' 0 R /MediaBox [0 0 595 842] /Contents ' + cNum + ' 0 R /Resources << /Font << /F1 ' + f1 + ' 0 R /F2 ' + f2 + ' 0 R >> >> >>\nendobj\n';
    pageObjs.push(pNum);
  }

  offsets[pagesObj] = pdf.length;
  pdf += pagesObj + ' 0 obj\n<< /Type /Pages /Kids [' + pageObjs.map(n => n + ' 0 R').join(' ') + '] /Count ' + pageObjs.length + ' >>\nendobj\n';

  const xref = pdf.length;
  pdf += 'xref\n0 ' + objNum + '\n';
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < objNum; i++) {
    pdf += String(offsets[i] || 0).padStart(10, '0') + ' 00000 n \n';
  }
  pdf += 'trailer\n<< /Size ' + objNum + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
  return enc.encode(pdf);
}

function b64encode(bytes) {
  let s = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

self.onmessage = function(e) {
  const { secciones, sps } = e.data;
  try {
    self.postMessage({ status: 'docx' });
    const docxBytes = generarDocx(secciones);
    const docxB64 = b64encode(docxBytes);
    self.postMessage({ status: 'pdf' });
    const pdfBytes = generarPDF(secciones);
    const pdfB64 = b64encode(pdfBytes);
    self.postMessage({ status: 'sps' });
    const spsB64 = btoa(unescape(encodeURIComponent(sps)));
    self.postMessage({ status: 'done', docxB64, pdfB64, spsB64 });
  } catch (err) {
    self.postMessage({ status: 'error', message: err.message });
  }
};
