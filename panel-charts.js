/* EYA-28 · Gráficos SVG · réplica SPSS (Gráficos) · cero dependencias */
'use strict';
/* ================================================================
   Réplica de IBM SPSS Statistics v32 — Graphs > Legacy Dialogs:
   - Histogram ............................. svgHistogram()
   - Bar Chart ............................. svgBar()
   - Scatterplot ........................... svgScatter()
   - Boxplot ............................... svgBoxplot()
   Todos retornan string SVG autocontenido, listo para insertar.
   ================================================================ */

function svgBase(w, h, inner) {
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px;background:#fff;border:1px solid #E2E8F0;border-radius:8px" role="img">${inner}</svg>`;
}
function svgText(x, y, s, o) {
  o = o || {};
  return `<text x="${x}" y="${y}" font-size="${o.fs || 11}" fill="${o.fill || '#1E293B'}" text-anchor="${o.a || 'middle'}"${o.b ? ' font-weight="700"' : ''}>${s}</text>`;
}
function niceNum(x, round) {
  const exp = Math.floor(Math.log10(x)), f = x / Math.pow(10, exp);
  let nf = f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10;
  return (round ? nf : nf) * Math.pow(10, exp);
}

/* ---------- Histograma ---------- */
function svgHistogram(values, title, bins) {
  const v = values.filter(x => x != null && isFinite(x));
  if (!v.length) return '<p class="muted">Sin datos</p>';
  bins = bins || Math.min(20, Math.max(5, Math.round(Math.sqrt(v.length))));
  const mn = Math.min(...v), mx = Math.max(...v);
  const w = (mx - mn) / bins || 1;
  const counts = new Array(bins).fill(0);
  v.forEach(x => { counts[Math.min(bins - 1, Math.floor((x - mn) / w))]++; });
  const cmax = Math.max(...counts);
  const W = 480, H = 300, ml = 46, mb = 44, mt = 34, mr = 12;
  const pw = W - ml - mr, ph = H - mt - mb;
  let s = svgText(W / 2, 20, title, { b: 1, fs: 13 });
  // Ejes
  s += `<line x1="${ml}" y1="${mt + ph}" x2="${ml + pw}" y2="${mt + ph}" stroke="#64748B"/>`;
  s += `<line x1="${ml}" y1="${mt}" x2="${ml}" y2="${mt + ph}" stroke="#64748B"/>`;
  // Barras
  const bw = pw / bins;
  counts.forEach((c, i) => {
    const bh = ph * c / cmax;
    const x = ml + i * bw + 1, y = mt + ph - bh;
    s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${bh.toFixed(1)}" fill="#2563EB" opacity="0.85" rx="2"><title>${(mn + i * w).toFixed(1)}–${(mn + (i + 1) * w).toFixed(1)}: ${c}</title></rect>`;
  });
  // Etiquetas eje X (5 marcas)
  for (let i = 0; i <= 4; i++) {
    const xv = mn + (mx - mn) * i / 4;
    s += svgText(ml + pw * i / 4, mt + ph + 16, xv.toFixed(1), { fs: 10, fill: '#64748B' });
  }
  s += svgText(ml - 30, mt + ph / 2, 'n', { fs: 10, fill: '#64748B' });
  return svgBase(W, H, s);
}

/* ---------- Diagrama de barras (categóricas) ---------- */
function svgBar(cats, title) {
  // cats: [[etiqueta, n],...]
  if (!cats.length) return '<p class="muted">Sin datos</p>';
  const cmax = Math.max(...cats.map(c => c[1]));
  const W = 480, H = 300, ml = 120, mb = 30, mt = 34, mr = 16;
  const pw = W - ml - mr, ph = H - mt - mb;
  const bh = Math.min(34, ph / cats.length - 6);
  let s = svgText(W / 2, 20, title, { b: 1, fs: 13 });
  s += `<line x1="${ml}" y1="${mt}" x2="${ml}" y2="${mt + ph}" stroke="#64748B"/>`;
  s += `<line x1="${ml}" y1="${mt + ph}" x2="${ml + pw}" y2="${mt + ph}" stroke="#64748B"/>`;
  cats.forEach((c, i) => {
    const y = mt + 8 + i * (ph / cats.length);
    const bw = pw * c[1] / cmax;
    s += svgText(ml - 8, y + bh / 2 + 4, String(c[0]).slice(0, 18), { a: 'end', fs: 11 });
    s += `<rect x="${ml}" y="${y}" width="${bw.toFixed(1)}" height="${bh}" fill="#2563EB" opacity="0.85" rx="3"><title>${c[0]}: ${c[1]}</title></rect>`;
    s += svgText(ml + bw + 6, y + bh / 2 + 4, c[1], { a: 'start', fs: 10, fill: '#64748B' });
  });
  return svgBase(W, H, s);
}

/* ---------- Dispersión ---------- */
function svgScatter(x, y, title, xl, yl) {
  const pts = x.map((xi, i) => [xi, y[i]]).filter(p => p[0] != null && p[1] != null && isFinite(p[0]) && isFinite(p[1]));
  if (!pts.length) return '<p class="muted">Sin datos</p>';
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const W = 480, H = 320, ml = 52, mb = 44, mt = 34, mr = 14;
  const pw = W - ml - mr, ph = H - mt - mb;
  const X = v => ml + pw * (v - x0) / ((x1 - x0) || 1);
  const Y = v => mt + ph - ph * (v - y0) / ((y1 - y0) || 1);
  let s = svgText(W / 2, 20, title, { b: 1, fs: 13 });
  s += `<line x1="${ml}" y1="${mt + ph}" x2="${ml + pw}" y2="${mt + ph}" stroke="#64748B"/>`;
  s += `<line x1="${ml}" y1="${mt}" x2="${ml}" y2="${mt + ph}" stroke="#64748B"/>`;
  // Línea de tendencia (mínimos cuadrados simple)
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0, sxx = 0;
  xs.forEach((xi, i) => { sxy += (xi - mx) * (ys[i] - my); sxx += (xi - mx) ** 2; });
  if (sxx > 0) {
    const b = sxy / sxx, a = my - b * mx;
    s += `<line x1="${X(x0)}" y1="${Y(a + b * x0)}" x2="${X(x1)}" y2="${Y(a + b * x1)}" stroke="#DC2626" stroke-width="1.6"/>`;
  }
  const step = Math.min(400, pts.length);
  for (let i = 0; i < pts.length; i += Math.ceil(pts.length / step)) {
    s += `<circle cx="${X(pts[i][0]).toFixed(1)}" cy="${Y(pts[i][1]).toFixed(1)}" r="3" fill="#2563EB" opacity="0.45"/>`;
  }
  s += svgText(ml + pw / 2, H - 8, xl || 'X', { fs: 11, fill: '#64748B' });
  s += svgText(14, mt + ph / 2, yl || 'Y', { fs: 11, fill: '#64748B' });
  return svgBase(W, H, s);
}

/* ---------- Boxplot ---------- */
function svgBoxplot(groups, title) {
  // groups: [[etiqueta, [valores]],...]
  const stats = groups.map(g => {
    const v = g[1].filter(x => x != null && isFinite(x)).sort((a, b) => a - b);
    if (!v.length) return null;
    const q = p => v[Math.min(v.length - 1, Math.floor(p * (v.length - 1)))];
    const q1 = q(0.25), med = q(0.5), q3 = q(0.75);
    const iqr = q3 - q1;
    const lo = Math.max(v[0], q1 - 1.5 * iqr), hi = Math.min(v[v.length - 1], q3 + 1.5 * iqr);
    const out = v.filter(x => x < lo || x > hi);
    return { lab: g[0], q1, med, q3, lo, hi, out, n: v.length };
  }).filter(Boolean);
  if (!stats.length) return '<p class="muted">Sin datos</p>';
  const all = stats.flatMap(s => [s.lo, s.hi]);
  const mn = Math.min(...all), mx = Math.max(...all);
  const W = 480, H = 300, ml = 52, mb = 44, mt = 34, mr = 14;
  const pw = W - ml - mr, ph = H - mt - mb;
  const Y = v => mt + ph - ph * (v - mn) / ((mx - mn) || 1);
  const cw = Math.min(64, pw / stats.length - 16);
  let s = svgText(W / 2, 20, title, { b: 1, fs: 13 });
  s += `<line x1="${ml}" y1="${mt}" x2="${ml}" y2="${mt + ph}" stroke="#64748B"/>`;
  s += `<line x1="${ml}" y1="${mt + ph}" x2="${ml + pw}" y2="${mt + ph}" stroke="#64748B"/>`;
  stats.forEach((st, i) => {
    const cx = ml + pw * (i + 0.5) / stats.length;
    // Bigotes
    s += `<line x1="${cx}" y1="${Y(st.hi)}" x2="${cx}" y2="${Y(st.lo)}" stroke="#1E293B" stroke-width="1.4"/>`;
    s += `<line x1="${cx - cw / 3}" y1="${Y(st.hi)}" x2="${cx + cw / 3}" y2="${Y(st.hi)}" stroke="#1E293B" stroke-width="1.4"/>`;
    s += `<line x1="${cx - cw / 3}" y1="${Y(st.lo)}" x2="${cx + cw / 3}" y2="${Y(st.lo)}" stroke="#1E293B" stroke-width="1.4"/>`;
    // Caja
    s += `<rect x="${cx - cw / 2}" y="${Y(st.q3)}" width="${cw}" height="${Math.max(2, Y(st.q1) - Y(st.q3))}" fill="#EFF6FF" stroke="#2563EB" stroke-width="1.6"><title>${st.lab}: n=${st.n}, mediana=${st.med.toFixed(1)}</title></rect>`;
    // Mediana
    s += `<line x1="${cx - cw / 2}" y1="${Y(st.med)}" x2="${cx + cw / 2}" y2="${Y(st.med)}" stroke="#DC2626" stroke-width="2"/>`;
    // Atípicos
    st.out.slice(0, 30).forEach(o => { s += `<circle cx="${cx}" cy="${Y(o).toFixed(1)}" r="2.6" fill="#DC2626" opacity="0.7"/>`; });
    s += svgText(cx, mt + ph + 18, String(st.lab).slice(0, 14), { fs: 10 });
  });
  return svgBase(W, H, s);
}

/* ---------- Renderizado: gestión de datos + gráficos ---------- */
function renderGestionGraficos(validos) {
  const host = document.getElementById('p-out');
  if (!host || typeof recode === 'undefined') return;
  let h = '';

  // ===== 1. GESTIÓN DE DATOS (Datos/Transformar) =====
  h += '<div class="sec"><h3>Gestión y preparación de datos (réplica SPSS: Datos / Transformar)</h3>';

  // Recodificar EDAD en rangos
  const rec = recode(validos, 'EDAD', [[17, 25, '18-25'], [26, 35, '26-35']], 'EDAD_G');
  const frG = {};
  rec.forEach(r => { frG[r.EDAD_G] = (frG[r.EDAD_G] || 0) + 1; });
  h += '<h4>Recodificar: EDAD → grupos (Transform > Recode)</h4>';
  h += spssTable('EDAD_G (recodificada)',
    ['Grupo de edad', 'n', '%'],
    Object.keys(frG).sort().map(k => [k, frG[k], f2(frG[k] / rec.length * 100) + '%']),
    ['Recodificación: 17–25 → "18-25", 26–35 → "26-35".']);

  // Segmentar por sexo: medias por grupo
  h += '<h4>Segmentar archivo por sexo (Data > Split File)</h4>';
  const seg = splitFile(validos, 'SEXO');
  const segRows = Object.keys(seg).sort().map(k => {
    const g = seg[k];
    const m = mean(g.map(c => c.EYA_TOTAL));
    const lab = (typeof DEMO_LABELS !== 'undefined' && DEMO_LABELS.SEXO && DEMO_LABELS.SEXO[k]) || k;
    return [lab, g.length, f2(m), f2(sd(g.map(c => c.EYA_TOTAL)))];
  });
  h += spssTable('EYA_TOTAL por sexo (archivo segmentado)',
    ['Sexo', 'n', 'Media', 'DE'], segRows,
    ['El análisis se repite automáticamente dentro de cada grupo.']);

  // Valores perdidos
  const vars = ['EDAD', 'SEXO', 'CARRERA', 'EYA_01', 'EYA_15', 'EYA_28'];
  const ms = missingSummary(validos, vars);
  h += '<h4>Valores perdidos por variable</h4>';
  h += spssTable('Resumen de perdidos',
    ['Variable', 'n', 'Perdidos', '%'],
    ms.map(m => [m.variable, m.n, m.perdidos, f2(m.pct) + '%']));
  h += '</div>';

  // ===== 2. GRÁFICOS (Gráficos) =====
  h += '<div class="sec"><h3>Gráficos (réplica SPSS: Gráficos)</h3>';

  // Histograma EYA_TOTAL
  h += '<h4>Histograma: EYA_TOTAL</h4>';
  h += svgHistogram(validos.map(c => c.EYA_TOTAL), 'Distribución de EYA_TOTAL (n=' + validos.length + ')');
  h += '<p class="muted">El histograma muestra la forma de la distribución: simétrica sugiere normalidad; asimetría indica sesgo.</p>';

  // Barras: carrera
  const frC = {};
  validos.forEach(c => { frC[c.CARRERA] = (frC[c.CARRERA] || 0) + 1; });
  const barData = Object.keys(frC).sort().map(k => [
    (typeof DEMO_LABELS !== 'undefined' && DEMO_LABELS.CARRERA && DEMO_LABELS.CARRERA[k]) || k, frC[k]]);
  h += '<h4>Diagrama de barras: Carrera</h4>';
  h += svgBar(barData, 'Participantes por carrera');

  // Dispersión D1 vs D2
  h += '<h4>Dispersión: D1 Cognitiva vs D2 Afectiva</h4>';
  h += svgScatter(validos.map(c => c.D1_COGNITIVA), validos.map(c => c.D2_AFECTIVA),
    'D1 vs D2 (línea de tendencia en rojo)', 'D1 Cognitiva', 'D2 Afectiva');
  h += '<p class="muted">Cada punto es un participante. La nube ascendente indica correlación positiva.</p>';

  // Boxplot por sexo
  const sexos = [...new Set(validos.map(c => c.SEXO).filter(v => v != null))].sort();
  if (sexos.length >= 2) {
    h += '<h4>Boxplot: EYA_TOTAL por sexo</h4>';
    h += svgBoxplot(sexos.map(sx => [
      (typeof DEMO_LABELS !== 'undefined' && DEMO_LABELS.SEXO && DEMO_LABELS.SEXO[sx]) || sx,
      validos.filter(c => c.SEXO === sx).map(c => c.EYA_TOTAL)]),
      'EYA_TOTAL por sexo (línea roja = mediana, puntos rojos = atípicos)');
    h += '<p class="muted">La caja cubre el 50% central (Q1–Q3); los bigotes llegan a 1.5×IQR; puntos fuera son atípicos.</p>';
  }
  h += '</div>';

  host.insertAdjacentHTML('beforeend', h);
}
