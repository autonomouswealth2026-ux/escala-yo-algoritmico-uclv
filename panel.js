/* EYA-28 · Panel del investigador · réplica completa del pipeline SPSS en JS vanilla */
'use strict';

const ITEMS = Array.from({length: 28}, (_, i) => 'EYA_' + String(i + 1).padStart(2, '0'));
const INVERTIDOS = ['EYA_01', 'EYA_04'];
const ESCALAS = {
  D1_COGNITIVA: ['EYA_01_R', 'EYA_02', 'EYA_03', 'EYA_04_R', 'EYA_05', 'EYA_06', 'EYA_07'],
  D2_AFECTIVA: ['EYA_08', 'EYA_09', 'EYA_10', 'EYA_11', 'EYA_12', 'EYA_13', 'EYA_14'],
  D3_CONDUCTUAL: ['EYA_16', 'EYA_17', 'EYA_18', 'EYA_19', 'EYA_20', 'EYA_21'],
  D4_IDENTITARIA: ['EYA_22', 'EYA_23', 'EYA_24', 'EYA_25', 'EYA_26', 'EYA_27', 'EYA_28']
};
const RANGOS = { D1_COGNITIVA: [7, 35], D2_AFECTIVA: [7, 35], D3_CONDUCTUAL: [6, 30], D4_IDENTITARIA: [7, 35] };
const DEMO_LABELS = {
  SEXO: {1: 'Masculino', 2: 'Femenino'},
  CARRERA: {1: 'Ingeniería Industrial', 2: 'Sociología', 3: 'Otra'},
  ANO_ACADEMICO: {1: '1ro', 2: '2do', 3: '3ro', 4: '4to', 5: '5to'},
  USO_IA_FREQ: {1: 'Rara vez/Nunca', 2: '1-2 veces/sem', 3: '3-4 veces/sem', 4: '5+ veces/sem'}
};
const DEMO_NAMES = { SEXO: 'Sexo', CARRERA: 'Carrera', ANO_ACADEMICO: 'Año académico', USO_IA_FREQ: 'Frecuencia de uso de IA', EDAD: 'Edad' };

let DB = null; // base procesada

/* ---------- utilidades estadísticas ---------- */
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const variance = a => { const m = mean(a); return a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1); };
const sd = a => Math.sqrt(variance(a));
const f2 = n => (Math.round(n * 100) / 100).toFixed(2);
const f1 = n => (Math.round(n * 10) / 10).toFixed(1);
const f3 = n => (Math.round(n * 1000) / 1000).toFixed(3);
/* NOTA: fmtP se define en panel-tables.js (function fmtP). No duplicar aquí:
   un 'const fmtP' en este archivo rompería el parseo de panel-tables.js
   (SyntaxError: Identifier 'fmtP' has already been declared) y dejaría
   sin definir spssTable, escHtml, renderCrosstab, etc. */

/* spssTable + escHtml duplicados aquí como garantía de disponibilidad:
   si panel-tables.js fallara al cargar, las secciones diferidas del panel
   (post-hoc, multivariado) seguirían funcionando. function+function entre
   scripts clásicos no genera SyntaxError; la última definición gana. */
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function spssTable(title, headers, rows, footnotes) {
  let h = '<div class="spss-pivot">';
  if (title) h += '<div class="spss-title">' + escHtml(title) + '</div>';
  h += '<table class="spss-table"><thead><tr>';
  headers.forEach((x, xi) => {
    h += xi === 0 ? '<th class="rowlab">' + x + '</th>' : '<th>' + x + '</th>';
  });
  h += '</tr></thead><tbody>';
  rows.forEach(r => {
    h += '<tr>';
    r.forEach((c, ci) => {
      h += ci === 0 ? '<td class="rowlab">' + c + '</td>' : '<td>' + c + '</td>';
    });
    h += '</tr>';
  });
  h += '</tbody></table>';
  if (footnotes && footnotes.length) {
    h += '<div class="spss-notes">' + footnotes.map((f, i) =>
      '<div><sup>' + String.fromCharCode(97 + i) + '</sup> ' + escHtml(f) + '</div>').join('') + '</div>';
  }
  return h + '</div>';
}

// Alfa de Cronbach: α = (k/(k-1)) · (1 − Σσ²ᵢ/σ²ₜ)
function cronbach(matrix) {
  const k = matrix[0].length;
  if (k < 2) return NaN;
  const itemVars = [];
  for (let j = 0; j < k; j++) itemVars.push(variance(matrix.map(r => r[j])));
  const totals = matrix.map(r => r.reduce((s, v) => s + v, 0));
  const totalVar = variance(totals);
  if (totalVar === 0) return NaN;
  return (k / (k - 1)) * (1 - itemVars.reduce((s, v) => s + v, 0) / totalVar);
}

function pearson(x, y) {
  const mx = mean(x), my = mean(y);
  const num = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0);
  const den = Math.sqrt(x.reduce((s, v) => s + (v - mx) ** 2, 0) * y.reduce((s, v) => s + (v - my) ** 2, 0));
  return den === 0 ? NaN : num / den;
}

// Spearman: correlación de Pearson aplicada a rangos promedio.
// Los empates reciben el rango medio de sus posiciones, como en SPSS.
function averageRanks(values) {
  const indexed = values.map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value || a.index - b.index);
  const ranks = Array(values.length);
  for (let i = 0; i < indexed.length;) {
    let j = i + 1;
    while (j < indexed.length && indexed[j].value === indexed[i].value) j++;
    const averageRank = ((i + 1) + j) / 2; // posiciones 1..n
    for (let k = i; k < j; k++) ranks[indexed[k].index] = averageRank;
    i = j;
  }
  return ranks;
}

function spearman(x, y) {
  if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length) return NaN;
  const pairs = [];
  for (let i = 0; i < x.length; i++) {
    if (x[i] == null || y[i] == null || x[i] === '' || y[i] === '') continue;
    const xi = Number(x[i]), yi = Number(y[i]);
    if (Number.isFinite(xi) && Number.isFinite(yi)) pairs.push([xi, yi]);
  }
  if (pairs.length < 2) return NaN;
  const rx = averageRanks(pairs.map(p => p[0]));
  const ry = averageRanks(pairs.map(p => p[1]));
  return pearson(rx, ry);
}

/* ---------- parseo CSV ---------- */
function parseCSV(text) {
  const rows = [];
  let cur = [''], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cur[cur.length - 1] += '"'; i++; } else inQ = false; }
      else cur[cur.length - 1] += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') cur.push('');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      rows.push(cur); cur = [''];
    }
    else cur[cur.length - 1] += c;
  }
  if (cur.length > 1 || cur[0] !== '') rows.push(cur);
  return rows;
}

/* ---------- pipeline principal ---------- */
function procesar(rows) {
  const header = rows[0].map(h => h.trim());
  const idx = {};
  header.forEach((h, i) => { idx[h] = i; });
  // Tolerar columna "Marca temporal" al inicio (la agrega Apps Script)

  const faltantes = ['ID_SUJETO', 'EDAD', ...ITEMS, 'RT_TOTAL_MS', 'FLAG_RAPIDEZ', 'IMC_CONTROL']
    .filter(c => !(c in idx));
  if (faltantes.length) throw new Error('Columnas faltantes en el CSV: ' + faltantes.join(', '));

  const casos = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.every(c => c.trim() === '')) continue;
    const g = c => (row[idx[c]] || '').trim();
    const caso = { ID_SUJETO: g('ID_SUJETO'), _fila: r + 1 };
    ['EDAD', 'SEXO', 'CARRERA', 'ANO_ACADEMICO', 'USO_IA_FREQ', 'RT_TOTAL_MS', 'FLAG_RAPIDEZ', 'IMC_CONTROL']
      .forEach(c => { caso[c] = g(c) === '' ? null : +g(c); });
    let valido = true;
    ITEMS.forEach(it => {
      const v = +g(it);
      if (!(v >= 1 && v <= 5)) valido = false;
      caso[it] = v;
    });
    caso._valido = valido;
    // Recodificar invertidos
    INVERTIDOS.forEach(it => { caso[it + '_R'] = 6 - caso[it]; });
    // Subescalas
    for (const esc in ESCALAS) {
      caso[esc] = ESCALAS[esc].reduce((s, it) => s + caso[it], 0);
    }
    caso.EYA_TOTAL = caso.D1_COGNITIVA + caso.D2_AFECTIVA + caso.D3_CONDUCTUAL + caso.D4_IDENTITARIA;
    // Filtros de calidad
    caso.CALIDAD_OK = (caso.IMC_CONTROL === 1 && caso.FLAG_RAPIDEZ === 0 && (caso.RT_TOTAL_MS || 0) >= 90000 && valido) ? 1 : 0;
    casos.push(caso);
  }

  const validos = casos.filter(c => c.CALIDAD_OK === 1);
  // No guardamos 'casos' completos (ahorra memoria); solo válidos + conteo
  return { validos, total: casos.length, nValidos: validos.length, nExcluidos: casos.length - validos.length };
}

/* ---------- render de resultados ---------- */
function tabla(headers, rows) {
  return '<table class="res"><thead><tr>' + headers.map(h => `<th>${h}</th>`).join('') +
    '</tr></thead><tbody>' + rows.map(r => '<tr>' + r.map(c => `<td>${c}</td>`).join('') + '</tr>').join('') +
    '</tbody></table>';
}

function render(db) {
  const { casos, validos, total, nValidos } = db;
  const excluidos = total - nValidos;
  let h = '';

  // Resumen
  h += `<div class="sec"><h3>Resumen de la muestra</h3><div class="card-body">`;
  h += `<p>Casos importados: <strong>${total}</strong> · Válidos: <strong>${nValidos}</strong> · Excluidos por calidad: <strong>${excluidos}</strong></p>`;
  h += `<p class="muted">Criterios de exclusión: falló el control atencional (IMC), respuestas a velocidad imposible (&lt;1200 ms × 3), tiempo total &lt; 90 s, o valores fuera de rango.</p>`;
  h += `</div></div>`;

  if (!nValidos) {
    h += `<div class="sec"><div class="card-body"><p class="err">No hay casos válidos para analizar.</p></div></div>`;
    document.getElementById('p-out').innerHTML = h;
    return;
  }

  // Descriptivos de subescalas
  const escRows = Object.keys(ESCALAS).map(esc => {
    const v = validos.map(c => c[esc]);
    const [mn, mx] = RANGOS[esc];
    return [esc.replace('_', ' '), nValidos, f2(mean(v)), f2(sd(v)), Math.min(...v), Math.max(...v), `${mn}–${mx}`];
  });
  const vt = validos.map(c => c.EYA_TOTAL);
  escRows.push(['EYA TOTAL', nValidos, f2(mean(vt)), f2(sd(vt)), Math.min(...vt), Math.max(...vt), '27–135']);
  h += `<div class="sec"><h3>Descriptivos por subescala</h3>` +
    tabla(['Escala', 'n', 'Media', 'DE', 'Mín', 'Máx', 'Rango posible'], escRows) + `</div>`;

  // Fiabilidad
  const relRows = Object.keys(ESCALAS).map(esc => {
    const m = validos.map(c => ESCALAS[esc].map(it => c[it]));
    const a = cronbach(m);
    const k = ESCALAS[esc].length;
    const cls = a >= 0.7 ? 'ok' : 'bad';
    return [`${esc.replace('_', ' ')} (k=${k})`, `<span class="badge ${cls}">${isNaN(a) ? 'n/d' : f2(a)}</span>`];
  });
  h += `<div class="sec"><h3>Fiabilidad — Alfa de Cronbach</h3>` +
    tabla(['Subescala', 'α'], relRows) +
    `<p class="muted">Referencia: α ≥ .70 aceptable, α ≥ .80 bueno.</p></div>`;

  // Análisis avanzado (réplica SPSS v32)
  if (typeof renderAvanzado === 'function') {
    try { h += renderAvanzado(validos); }
    catch (e) { h += `<div class="sec"><p class="muted">Análisis avanzado no disponible: ${e.message}</p></div>`; }
  }

  // CFA/SEM + Bayes + Red neuronal (réplica AMOS) — ejecución automática
  if (typeof renderSEM === 'function') {
    try {
      h += renderSEM(validos);
      if (typeof window !== 'undefined') {
        window.__cfaValid = validos;
        setTimeout(function() { if (typeof window.__runCfaMlp === 'function') window.__runCfaMlp(); }, 2000);
      }
    }
    catch (e) { h += `<div class="sec"><p class="muted">SEM no disponible: ${e.message}</p></div>`; }
  }

  // Tablas estilo SPSS + Crosstabs + Post-hoc (Fase 4A)
  if (typeof renderCrosstab === 'function') {
    try {
      // SEXO × CARRERA
      const sx = validos.map(c => c.SEXO), cr = validos.map(c => c.CARRERA);
      if (sx.some(v => v != null) && cr.some(v => v != null)) {
        const ct = crosstab(sx, cr);
        h += renderCrosstab(ct, 'Sexo', 'Carrera');
      }
    } catch (e) { h += `<div class="sec"><p class="muted">Crosstabs no disponible: ${e.message}</p></div>`; }
  }

  // Post-hoc tras ANOVA por carrera
  if (typeof tukeyHSD === 'function') {
    try {
      const carreras = [...new Set(validos.map(c => c.CARRERA).filter(v => v != null))].sort();
      if (carreras.length >= 3) {
        h += `<div class="sec"><h3>Post-hoc (réplica SPSS: ONEWAY Post Hoc)</h3>`;
        h += `<p class="muted">Comparaciones por pares tras ANOVA. Tukey HSD (varianzas iguales) y Games-Howell (varianzas desiguales).</p>`;
        h += `<div id="posthoc-tables"><p class="muted">Calculando…</p></div></div>`;
        if (typeof window !== 'undefined') {
          window.__phValid = validos;
          // Ejecución automática tras el renderizado
          setTimeout(function() {
            try {
              const vv = window.__phValid;
              const cars = [...new Set(vv.map(c => c.CARRERA).filter(v => v != null))].sort();
              const labels = cars.map(c => (DEMO_LABELS.CARRERA && DEMO_LABELS.CARRERA[c]) || c);
              let ph = '';
              ['EYA_TOTAL'].forEach(esc => {
                const groups = cars.map(car => vv.filter(c => c.CARRERA === car).map(c => c[esc]));
                const tk = tukeyHSD(groups, labels);
                ph += renderTukey(tk, esc.replace('_', ' '));
                const gh = gamesHowell(groups, labels);
                ph += renderGamesHowell(gh, esc.replace('_', ' '));
              });
              const el = document.getElementById('posthoc-tables');
              if (el) el.innerHTML = ph;
            } catch (err) {
              const el = document.getElementById('posthoc-tables');
              if (el) el.innerHTML = '<p class="muted">Error: ' + err.message + '</p>';
            }
          }, 100);
        }
      }
    } catch (e) { /* silencioso */ }
  }

  // MANOVA + Clustering + Mediación (Fase 4B) — ejecución automática
  if (typeof manova === 'function') {
    try {
      h += `<div class="sec"><h3>Análisis multivariado (réplica SPSS: GLM / Classify / Mediation)</h3>`;
      h += `<p class="muted" id="multiv-result">Calculando…</p>`;
      h += `<div id="multiv-tables"></div></div>`;
      if (typeof window !== 'undefined') {
        window.__mvValid = validos;
        // Ejecución automática tras el renderizado (sin botón)
        setTimeout(function() {
          try {
            const vv = window.__mvValid;
            const cars = [...new Set(vv.map(c => c.CARRERA).filter(v => v != null))].sort();
            let mh = '';
            // MANOVA: 4 subescalas por carrera
            if (cars.length >= 2) {
              const groups = cars.map(car => vv.filter(c => c.CARRERA === car)
                .map(c => [c.D1_COGNITIVA, c.D2_AFECTIVA, c.D3_CONDUCTUAL, c.D4_IDENTITARIA]));
              const mv = manova(groups, ['D1', 'D2', 'D3', 'D4']);
              if (!mv.error) {
                const prow = (name, s) => ['Carrera', name, f2(s.value), f2(s.F), s.df1, s.df2, s.p < 0.001 ? '< .001' : f2(s.p)];
                mh += spssTable('Multivariate Tests (MANOVA)',
                  ['Efecto', 'Estadístico', 'Valor', 'F', 'gl hip.', 'gl error', 'p'],
                  [prow('Lambda de Wilks', mv.wilks),
                   prow('Traza de Pillai', mv.pillai),
                   prow('Hotelling-Lawley', mv.hotelling),
                   prow('Raíz de Roy', mv.roy)]);
              } else mh += '<p class="muted">MANOVA: ' + mv.error + '</p>';
            }
            // K-means en subescalas
            const Xkm = vv.map(c => [c.D1_COGNITIVA, c.D2_AFECTIVA, c.D3_CONDUCTUAL, c.D4_IDENTITARIA]);
            if (Xkm.length >= 10) {
              const km = kmeans(Xkm, Math.min(3, cars.length || 2));
              mh += spssTable('K-Means Cluster (k=' + km.k + ')',
                ['Cluster', 'n', 'Centroide D1', 'D2', 'D3', 'D4'],
                km.centroids.map((cen, i) => ['Cluster ' + (i + 1), km.sizes[i]].concat(cen.map(f2))));
              mh += '<p class="muted">WCSS = ' + f2(km.wcss) + '. Réplica de Analyze → Classify → K-Means.</p>';
            }
            const mtEl = document.getElementById('multiv-tables');
            if (mtEl) mtEl.innerHTML = mh;
            // Mediación: D1 → D2 → EYA_TOTAL (asíncrona, con progreso)
            const nBoot = vv.length > 2000 ? 200 : 500;
            const resEl = document.getElementById('multiv-result');
            const mx = vv.map(c => c.D1_COGNITIVA), mm = vv.map(c => c.D2_AFECTIVA), my = vv.map(c => c.EYA_TOTAL);
            runMediationAsync(mx, mm, my, nBoot, resEl, function(med) {
              let mh2 = mtEl ? mtEl.innerHTML : '';
              if (!med.error) {
                mh2 += spssTable('Mediation Analysis (D1 → D2 → Total)',
                  ['Efecto', 'Estimación', 'p / IC 95%'],
                  [['Total (c)', f2(med.c), med.cP < 0.001 ? '< .001' : f2(med.cP)],
                   ['Directo (c′)', f2(med.cPrime), med.cPrimeP < 0.001 ? '< .001' : f2(med.cPrimeP)],
                   ['Indirecto (a·b)', f2(med.indirect), 'IC boot [' + f2(med.bootCI[0]) + ', ' + f2(med.bootCI[1]) + ']'],
                   ['Sobel z', f2(med.sobelZ), 'p=' + (med.sobelP < 0.001 ? '< .001' : f2(med.sobelP))]]);
              }
              if (mtEl) mtEl.innerHTML = mh2;
              if (resEl) resEl.textContent = 'Completado';
            });
          } catch (err) {
            const resEl = document.getElementById('multiv-result');
            if (resEl) resEl.textContent = 'Error: ' + err.message;
          }
        }, 150);
      }
    } catch (e) { /* silencioso */ }
  }

  // Correlaciones inter-escala
  const escKeys = Object.keys(ESCALAS);
  const corrRows = escKeys.map(a =>
    [a.replace('_', ' ')].concat(escKeys.map(b => {
      const r = pearson(validos.map(c => c[a]), validos.map(c => c[b]));
      return isNaN(r) ? '—' : f2(r);
    }))
  );
  h += `<div class="sec"><h3>Correlaciones entre subescalas (Pearson)</h3>` +
    tabla([''].concat(escKeys.map(k => k.split('_')[0])), corrRows) + `</div>`;

  const spearRows = escKeys.map(a =>
    [a.replace('_', ' ')].concat(escKeys.map(b => {
      const rho = spearman(validos.map(c => c[a]), validos.map(c => c[b]));
      return isNaN(rho) ? '—' : f2(rho);
    }))
  );
  h += `<div class="sec"><h3>Correlaciones entre subescalas (Spearman, rangos promedio para empates)</h3>` +
    tabla([''].concat(escKeys.map(k => k.split('_')[0])), spearRows) + `</div>`;

  // Frecuencias demográficas
  ['SEXO', 'CARRERA', 'ANO_ACADEMICO', 'USO_IA_FREQ'].forEach(d => {
    const fr = {};
    validos.forEach(c => { const v = c[d]; if (v != null) fr[v] = (fr[v] || 0) + 1; });
    const rows = Object.keys(fr).sort().map(v => {
      const lab = (DEMO_LABELS[d] && DEMO_LABELS[d][v]) || v;
      return [lab, fr[v], f2(fr[v] / nValidos * 100) + '%'];
    });
    if (rows.length) h += `<div class="sec"><h3>${DEMO_NAMES[d]}</h3>` + tabla(['Categoría', 'n', '%'], rows) + `</div>`;
  });

  // Edad
  const edades = validos.map(c => c.EDAD).filter(v => v != null);
  if (edades.length) {
    h += `<div class="sec"><h3>Edad</h3>` +
      tabla(['n', 'Media', 'DE', 'Mín', 'Máx'],
        [[edades.length, f2(mean(edades)), f2(sd(edades)), Math.min(...edades), Math.max(...edades)]]) + `</div>`;
  }

  document.getElementById('p-out').innerHTML = h;
  document.getElementById('p-title').textContent = `Base procesada · n = ${nValidos} válidos`;
  // Gráficos y gestión diferidos para no bloquear el scroll inicial
  if (typeof renderGestionGraficos === 'function') {
    setTimeout(function() {
      try { renderGestionGraficos(validos); } catch (e) { /* silencioso */ }
    }, 400);
  }
}

/* ---------- exportaciones ---------- */

// ===== Generador .docx mínimo (JS puro, sin dependencias) =====
// Crea un .docx válido con entradas ZIP STORED (sin compresión)
function crc32(str) {
  const table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })();
  let crc = 0xFFFFFFFF;
  const bytes = new TextEncoder().encode(str);
  for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function buildDocx(files) {
  // files: [{name, content}]
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const dataBytes = enc.encode(f.content);
    const crc = crc32(f.content);
    // Local file header
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0, true);
    lh.setUint16(8, 0, true); // stored
    lh.setUint16(10, 0, true); lh.setUint16(12, 0, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, dataBytes.length, true);
    lh.setUint32(22, dataBytes.length, true);
    lh.setUint16(26, nameBytes.length, true);
    lh.setUint16(28, 0, true);
    chunks.push(new Uint8Array(lh.buffer), nameBytes, dataBytes);
    central.push({ name: nameBytes, crc, size: dataBytes.length, offset });
    offset += 30 + nameBytes.length + dataBytes.length;
  }
  const cdStart = offset;
  for (const e of central) {
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
    ch.setUint16(8, 0, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, 0, true); ch.setUint16(14, 0, true);
    ch.setUint32(16, e.crc, true);
    ch.setUint32(20, e.size, true); ch.setUint32(24, e.size, true);
    ch.setUint16(28, e.name.length, true);
    ch.setUint16(30, 0, true); ch.setUint16(32, 0, true);
    ch.setUint16(34, 0, true); ch.setUint16(36, 0, true);
    ch.setUint32(38, 0, true);
    ch.setUint32(42, e.offset, true);
    chunks.push(new Uint8Array(ch.buffer), e.name);
    offset += 46 + e.name.length;
  }
  const cdSize = offset - cdStart;
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(4, 0, true); eocd.setUint16(6, 0, true);
  eocd.setUint16(8, central.length, true); eocd.setUint16(10, central.length, true);
  eocd.setUint32(12, cdSize, true); eocd.setUint32(16, cdStart, true);
  eocd.setUint16(20, 0, true);
  chunks.push(new Uint8Array(eocd.buffer));
  const total = chunks.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const ch of chunks) { out.set(ch, pos); pos += ch.length; }
  return out;
}

// ===== Cargador dinámico de librerías de informes =====
async function loadLib(url, globalName) {
  if (window[globalName]) return window[globalName];
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = url; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar ' + url));
    document.head.appendChild(s);
  });
  return window[globalName];
}
async function ensurePdfMake() {
  if (!window.pdfMake) {
    await loadLib('https://cdn.jsdelivr.net/npm/pdfmake@0.2.18/build/pdfmake.min.js', 'pdfMake');
    await loadLib('https://cdn.jsdelivr.net/npm/pdfmake@0.2.18/build/vfs_fonts.js', 'pdfMake');
  }
  return window.pdfMake;
}
async function ensureDocx() {
  if (!window.docx) {
    await loadLib('https://cdn.jsdelivr.net/npm/docx@9.5.1/dist/index.iife.js', 'docx');
  }
  return window.docx;
}


// ===== Generador PDF profesional (pdfmake) =====
async function generarPDFProfesional() {
  const btn = document.getElementById('btn-pdf');
  const orig = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Generando PDF…'; }
  try {
    const pdfMake = await ensurePdfMake();
    // Esperar secciones asíncronas
    await esperarAnalisis();
    const host = document.getElementById('p-out');
    const title = document.getElementById('p-title').textContent;
    
    const SLATE = '#1E293B', BLUE = '#2563EB', LIGHT = '#F8FAFC', GRAY = '#64748B';
    
    const content = [
      // Portada
      { text: 'INFORME EYA-28', style: 'portada', margin: [0, 60, 0, 8] },
      { text: 'Escala del Yo Algorítmico', style: 'subportada', margin: [0, 0, 0, 20] },
      { text: title, style: 'titulo2', margin: [0, 0, 0, 8] },
      { text: 'Generado: ' + new Date().toLocaleString('es-ES'), style: 'muted', margin: [0, 0, 0, 4] },
      { text: 'Universidad Central "Marta Abreu" de Las Villas · Carrera de Psicología', style: 'muted', margin: [0, 0, 0, 30] },
      { text: '', pageBreak: 'after' },
    ];
    
    // Recorrer secciones
    host.querySelectorAll('.sec').forEach(sec => {
      const h3 = sec.querySelector('h3');
      if (h3) {
        content.push({ text: h3.textContent.trim(), style: 'seccion', margin: [0, 16, 0, 8] });
      }
      sec.querySelectorAll(':scope > h4').forEach(h4 => {
        content.push({ text: h4.textContent.trim(), style: 'subseccion', margin: [0, 10, 0, 4] });
      });
      sec.querySelectorAll(':scope > p').forEach(p => {
        const t = p.textContent.trim();
        if (t && !t.includes('Calculando') && !t.includes('Entrenando')) {
          content.push({ text: t, style: 'parrafo', margin: [0, 2, 0, 4] });
        }
      });
      // Tablas con pdfmake (cabeceras repetidas, filas no partibles)
      sec.querySelectorAll(':scope table').forEach(tbl => {
        const rows = Array.from(tbl.querySelectorAll('tr')).map(tr =>
          Array.from(tr.querySelectorAll('th,td')).map(td => td.textContent.trim()));
        if (!rows.length) return;
        const headerRow = rows[0].map(h => ({ text: h, style: 'th' }));
        const bodyRows = rows.slice(1).map(r => r.map(cell => ({ text: cell, style: 'td' })));
        content.push({
          table: { headerRows: 1, widths: Array(rows[0].length).fill('*'), body: [headerRow, ...bodyRows] },
          layout: {
            fillColor: (ri) => ri === 0 ? SLATE : (ri % 2 === 0 ? LIGHT : null),
            hLineColor: () => '#94A3B8', vLineColor: () => '#94A3B8',
          },
          margin: [0, 8, 0, 12],
        });
      });
    });
    
    const docDef = {
      content,
      styles: {
        portada: { fontSize: 28, bold: true, color: SLATE, alignment: 'center' },
        subportada: { fontSize: 16, color: BLUE, alignment: 'center' },
        titulo2: { fontSize: 13, bold: true, color: SLATE, alignment: 'center' },
        muted: { fontSize: 9, color: GRAY, alignment: 'center' },
        seccion: { fontSize: 14, bold: true, color: '#FFFFFF', background: BLUE, margin: [0,0,0,0] },
        subseccion: { fontSize: 12, bold: true, color: BLUE },
        parrafo: { fontSize: 10, color: SLATE },
        th: { fontSize: 9, bold: true, color: '#FFFFFF' },
        td: { fontSize: 9, color: SLATE },
      },
      defaultStyle: { font: 'Roboto' },
      footer: (cp, pc) => ({ text: `Página ${cp} de ${pc} · EYA-28`, alignment: 'center', fontSize: 8, color: GRAY, margin: [0, 10, 0, 0] }),
    };
    pdfMake.createPdf(docDef).download('informe-eya28.pdf');
  } catch (e) {
    alert('Error al generar PDF: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = orig; }
  }
}
// Barrera asíncrona: espera MLP, post-hoc, MANOVA
async function esperarAnalisis() {
  for (let i = 0; i < 30; i++) {
    const mlp = document.getElementById('mlp-status');
    const ph = document.getElementById('posthoc-tables');
    const mv = document.getElementById('multiv-result');
    const done = (!mlp || !mlp.textContent.includes('Entrenando'))
      && (!ph || !ph.textContent.includes('Calculando'))
      && (!mv || !mv.textContent.includes('Calculando'));
    if (done) return;
    await new Promise(r => setTimeout(r, 1000));
  }
}


// ===== Generador Word profesional (librería docx) =====
async function generarWordProfesional() {
  const btn = document.getElementById('btn-word');
  const orig = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Generando Word…'; }
  try {
    const DX = await ensureDocx();
    await esperarAnalisis();
    const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
            HeadingLevel, AlignmentType, ShadingType, WidthType } = DX;
    const host = document.getElementById('p-out');
    const title = document.getElementById('p-title').textContent;
    
    const children = [
      new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: 'INFORME EYA-28', bold: true, color: '1E293B', size: 56 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: 'Escala del Yo Algorítmico', color: '2563EB', size: 28 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: title, bold: true, size: 22 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: 'Generado: ' + new Date().toLocaleString('es-ES'), color: '64748B', size: 18 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: 'Universidad Central "Marta Abreu" de Las Villas · Psicología', color: '64748B', size: 18 })] }),
    ];
    
    host.querySelectorAll('.sec').forEach(sec => {
      const h3 = sec.querySelector('h3');
      if (h3) {
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: h3.textContent.trim(), bold: true, color: 'FFFFFF', size: 26 })],
          shading: { type: ShadingType.CLEAR, fill: '2563EB' },
        }));
      }
      sec.querySelectorAll(':scope > h4').forEach(h4 => {
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: h4.textContent.trim(), bold: true, color: '2563EB', size: 24 })] }));
      });
      sec.querySelectorAll(':scope > p').forEach(p => {
        const t = p.textContent.trim();
        if (t && !t.includes('Calculando') && !t.includes('Entrenando')) {
          children.push(new Paragraph({ children: [new TextRun({ text: t, size: 20 })] }));
        }
      });
      sec.querySelectorAll(':scope table').forEach(tbl => {
        const rows = Array.from(tbl.querySelectorAll('tr')).map(tr =>
          Array.from(tr.querySelectorAll('th,td')).map(td => td.textContent.trim()));
        if (!rows.length) return;
        const tableRows = rows.map((r, ri) => new TableRow({
          cantSplit: true,
          tableHeader: ri === 0,
          children: r.map(cell => new TableCell({
            shading: { type: ShadingType.CLEAR, fill: ri === 0 ? '1E293B' : (ri % 2 === 0 ? 'F8FAFC' : 'FFFFFF') },
            children: [new Paragraph({ children: [
              new TextRun({ text: cell, bold: ri === 0, color: ri === 0 ? 'FFFFFF' : '1E293B', size: 18 })
            ]})],
          })),
        }));
        children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows }));
      });
    });
    
    const doc = new Document({ sections: [{ children }] });
    const blob = await Packer.toBlob(doc);
    descargar('informe-eya28.docx', blob, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  } catch (e) {
    alert('Error al generar Word: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = orig; }
  }
}

function generarDocx(rows, title) {
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  // Paleta profesional: Slate 800 #1E293B, Royal Blue #2563EB, Slate 50 #F8FAFC
  let body = `<w:p><w:pPr><w:shd w:fill="EFF6FF" w:val="clear"/><w:spacing w:after="240"/></w:pPr>`
    + `<w:r><w:rPr><w:b/><w:color w:val="1E293B"/><w:sz w:val="44"/></w:rPr><w:t>${esc(title)}</w:t></w:r></w:p>`;
  body += `<w:p><w:r><w:rPr><w:color w:val="64748B"/><w:sz w:val="20"/></w:rPr><w:t>Universidad Central "Marta Abreu" de Las Villas · Psicología</w:t></w:r></w:p>`;
  body += `<w:p><w:r><w:rPr><w:color w:val="64748B"/><w:sz w:val="20"/></w:rPr><w:t>Generado: ${new Date().toLocaleString('es-ES')}</w:t></w:r></w:p>`;
  for (const sec of rows) {
    // Título de sección con color
    body += `<w:p><w:pPr><w:shd w:fill="1E293B" w:val="clear"/><w:spacing w:before="240" w:after="120"/>`
      + `<w:pBdr><w:bottom w:val="single" w:sz="12" w:color="2563EB"/></w:pBdr></w:pPr>`
      + `<w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="28"/></w:rPr><w:t>${esc(sec.seccion)}</w:t></w:r></w:p>`;
    // Detectar si es tabla (múltiples columnas) o párrafos
    const esTabla = sec.filas.length > 1 && sec.filas[0].length > 1;
    if (esTabla) {
      body += `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>`
        + `<w:top w:val="single" w:sz="4" w:color="94A3B8"/><w:left w:val="single" w:sz="4" w:color="94A3B8"/>`
        + `<w:bottom w:val="single" w:sz="4" w:color="94A3B8"/><w:right w:val="single" w:sz="4" w:color="94A3B8"/>`
        + `<w:insideH w:val="single" w:sz="4" w:color="94A3B8"/><w:insideV w:val="single" w:sz="4" w:color="94A3B8"/>`
        + `</w:tblBorders></w:tblPr>`;
      sec.filas.forEach((fila, ri) => {
        // w:cantSplit evita que la fila se parta entre páginas
        body += '<w:tr><w:trPr><w:cantSplit/></w:trPr>';
        fila.forEach((celda, ci) => {
          const esCabecera = ri === 0;
          const bg = esCabecera ? '1E293B' : (ri % 2 === 0 ? 'F8FAFC' : 'FFFFFF');
          const color = esCabecera ? 'FFFFFF' : '1E293B';
          const bold = esCabecera ? '<w:b/>' : '';
          body += `<w:tc><w:tcPr><w:shd w:fill="${bg}" w:val="clear"/></w:tcPr>`
            + `<w:p><w:r><w:rPr>${bold}<w:color w:val="${color}"/><w:sz w:val="20"/></w:rPr>`
            + `<w:t>${esc(celda)}</w:t></w:r></w:p></w:tc>`;
        });
        body += '</w:tr>';
      });
      body += '</w:tbl>';
    } else {
      // Párrafos
      for (const fila of sec.filas) {
        const t = fila[0] || '';
        if (t) body += `<w:p><w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>${esc(t)}</w:t></w:r></w:p>`;
      }
    }
  }
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`;
  const ctXml = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
  const relsXml = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  return buildDocx([
    { name: '[Content_Types].xml', content: ctXml },
    { name: '_rels/.rels', content: relsXml },
    { name: 'word/document.xml', content: docXml }
  ]);
}

function descargar(nombre, contenido, tipo) {
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo });
  const reader = new FileReader();
  reader.onload = function() {
    const a = document.createElement('a');
    a.href = reader.result;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { if (a.parentNode) document.body.removeChild(a); }, 4000);
  };
  reader.readAsDataURL(blob);
}

function exportCSV() {
  if (!DB) return;
  const cols = ['ID_SUJETO', 'EDAD', 'SEXO', 'CARRERA', 'ANO_ACADEMICO', 'USO_IA_FREQ',
    ...ITEMS, 'EYA_01_R', 'EYA_04_R', 'D1_COGNITIVA', 'D2_AFECTIVA', 'D3_CONDUCTUAL',
    'D4_IDENTITARIA', 'EYA_TOTAL', 'RT_TOTAL_MS', 'FLAG_RAPIDEZ', 'IMC_CONTROL', 'CALIDAD_OK'];
  const lines = [cols.join(',')];
  DB.validos.forEach(c => lines.push(cols.map(k => c[k] == null ? '' : c[k]).join(',')));
  descargar('eya28_limpio.csv', '﻿' + lines.join('\n'), 'text/csv;charset=utf-8');
}

function generarSPS() {
  if (!DB) { alert('Procesa primero una base de datos para generar la sintaxis.'); return; }
  try {
  let s = `* EYA-28 · Sintaxis generada automáticamente por el panel del investigador.\n` +
    `* n válido = ${DB.nValidos} de ${DB.total} casos importados.\n` +
    `* Los datos ya vienen procesados en el CSV limpio; esta sintaxis reproduce\n` +
    `* etiquetas, recodificación y cómputos para verificación en IBM SPSS.\n\n`;
  s += `GET DATA /TYPE=TXT\n  /FILE='eya28_limpio.csv'\n  /DELIMITERS=","\n  /QUALIFIER='"'\n  /FIRSTCASE=2\n  /VARIABLES=\n    ID_SUJETO A20 EDAD F2.0 SEXO F1.0 CARRERA F1.0 ANO_ACADEMICO F1.0 USO_IA_FREQ F1.0\n`;
  ITEMS.forEach(it => { s += `    ${it} F1.0\n`; });
  s += `    EYA_01_R F1.0 EYA_04_R F1.0\n    D1_COGNITIVA F2.0 D2_AFECTIVA F2.0 D3_CONDUCTUAL F2.0 D4_IDENTITARIA F2.0 EYA_TOTAL F3.0\n` +
    `    RT_TOTAL_MS F10.0 FLAG_RAPIDEZ F1.0 IMC_CONTROL F1.0 CALIDAD_OK F1.0\n  .\nCACHE.\nEXECUTE.\n\n`;
  s += `VALUE LABELS\n  SEXO 1 'Masculino' 2 'Femenino'\n  /CARRERA 1 'Ingeniería Industrial' 2 'Sociología' 3 'Otra'\n` +
    `  /USO_IA_FREQ 1 'Rara vez/Nunca' 2 '1-2 veces/sem' 3 '3-4 veces/sem' 4 '5+ veces/sem'\n` +
    `  /EYA_01 TO EYA_28 1 'Totalmente en desacuerdo' 2 'En desacuerdo' 3 'Ni de acuerdo ni en desacuerdo' 4 'De acuerdo' 5 'Totalmente de acuerdo'\n` +
    `  /CALIDAD_OK 0 'Excluir' 1 'Incluir'.\nEXECUTE.\n\n`;
  for (const esc in ESCALAS) {
    s += `RELIABILITY\n  /VARIABLES=${ESCALAS[esc].join(' ')}\n  /SCALE('${esc}') ALL\n  /MODEL=ALPHA\n  /STATISTICS=DESCRIPTIVE CORR\n  /SUMMARY=TOTAL.\n\n`;
  }
  s += `DESCRIPTIVES VARIABLES=D1_COGNITIVA D2_AFECTIVA D3_CONDUCTUAL D4_IDENTITARIA EYA_TOTAL\n  /STATISTICS=MEAN STDDEV MIN MAX.\n`;
  return s;
  } catch (e) {
    alert('Error al generar la sintaxis: ' + e.message);
  }
}

/* ---------- eventos ---------- */
function mostrar(id) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo({ top: 0 });
}

async function cargar() {
  const err = document.getElementById('p-err');
  err.hidden = true;
  try {
    const file = document.getElementById('csv-file').files[0];
    let text;
    if (file) {
      text = await file.text();
    } else {
      const url = document.getElementById('csv-url').value.trim();
      if (!url) throw new Error('Pegue la URL del CSV o seleccione un archivo.');
      const r = await fetch(url);
      if (!r.ok) throw new Error('No se pudo descargar el CSV (HTTP ' + r.status + '). Verifique que esté publicado.');
      text = await r.text();
    }
    const rows = parseCSV(text);
    if (rows.length < 2) throw new Error('El CSV no contiene datos.');
    DB = procesar(rows);
    render(DB);
    mostrar('p-results');
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
  }
}

document.getElementById('btn-procesar').addEventListener('click', cargar);
document.getElementById('btn-demo').addEventListener('click', async () => {
  const err = document.getElementById('p-err');
  err.hidden = true;
  const btn = document.getElementById('btn-demo');
  btn.disabled = true; btn.textContent = 'Cargando demo…';
  try {
    const r = await fetch('demo5000.csv');
    if (!r.ok) throw new Error('No se pudo cargar la demo (HTTP ' + r.status + ').');
    let text = await r.text();
    const rows = parseCSV(text);
    text = null; // Liberar memoria del CSV crudo
    DB = procesar(rows);
    render(DB);
    mostrar('p-results');
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
  }
  btn.disabled = false; btn.textContent = 'Cargar datos demo (n=5000)';
});
document.getElementById('btn-volver').addEventListener('click', () => mostrar('p-load'));
/* ---------- copiar informe completo ---------- */
function buildTextReport() {
  const host = document.getElementById('p-out');
  if (!host) return '';
  const clone = host.cloneNode(true);
  // Convertir tablas a texto alineado
  clone.querySelectorAll('table').forEach(tbl => {
    const rows = Array.from(tbl.querySelectorAll('tr')).map(tr =>
      Array.from(tr.querySelectorAll('th,td')).map(c => c.textContent.trim()));
    if (!rows.length) return;
    const widths = rows[0].map((_, i) => Math.max(...rows.map(r => (r[i] || '').length)));
    const lines = rows.map((r, ri) => {
      const line = r.map((c, i) => (c || '').padEnd(widths[i])).join(' | ');
      return ri === 0 ? line + '\n' + widths.map(w => '-'.repeat(w)).join('-+-') : line;
    });
    const pre = document.createElement('pre');
    pre.textContent = '\n' + lines.join('\n') + '\n';
    tbl.replaceWith(pre);
  });
  // SVG → descripción
  clone.querySelectorAll('svg').forEach(svg => {
    const p = document.createElement('p');
    p.textContent = '[Gráfico: ' + (svg.querySelector('text') ? svg.querySelector('text').textContent : 'visualización') + ']';
    svg.replaceWith(p);
  });
  let txt = 'INFORME EYA-28 · ' + document.getElementById('p-title').textContent + '\n';
  txt += 'Generado: ' + new Date().toLocaleString('es-ES') + '\n';
  txt += '='.repeat(60) + '\n\n';
  // Recorrer secciones
  clone.querySelectorAll('.sec').forEach(sec => {
    const h3 = sec.querySelector('h3');
    if (h3) txt += '\n## ' + h3.textContent.trim() + '\n' + '-'.repeat(50) + '\n';
    sec.querySelectorAll('h4,p,pre').forEach(el => {
      if (el.closest('table')) return;
      const t = el.textContent.trim();
      if (t) txt += (el.tagName === 'H4' ? '\n### ' : '') + t + '\n';
    });
    txt += '\n';
  });
  return txt.replace(/\n{3,}/g, '\n\n').trim();
}
document.getElementById('btn-copy').addEventListener('click', async () => {
  const btn = document.getElementById('btn-copy');
  const txt = buildTextReport();
  try {
    await navigator.clipboard.writeText(txt);
    btn.textContent = '¡Copiado!';
  } catch (e) {
    // Fallback para navegadores sin clipboard API
    const ta = document.createElement('textarea');
    ta.value = txt;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); btn.textContent = '¡Copiado!'; }
    catch (err) { btn.textContent = 'Error al copiar'; }
    document.body.removeChild(ta);
  }
  setTimeout(() => { btn.textContent = 'Copiar informe'; }, 2500);
});
/* ---------- descargar PDF (vía impresión) ---------- */
document.getElementById('btn-pdf').addEventListener('click', generarPDFProfesional);
/* ---------- descargar Word (.doc y .docx) — VERSIÓN CON TABLAS ---------- */
function wordHtmlContent() {
  const title = document.getElementById('p-title').textContent;
  const host = document.getElementById('p-out');
  let html = '<style>'
    + 'body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#1E293B;line-height:1.5}'
    + 'h1{color:#1E293B;font-size:22pt;border-bottom:3px solid #2563EB;padding-bottom:8px;margin-bottom:4px}'
    + 'h2{color:#1E293B;font-size:14pt;border-bottom:2px solid #2563EB;padding-bottom:4px;margin-top:24px;page-break-after:avoid}'
    + 'h3{color:#2563EB;font-size:12pt;margin-top:16px;page-break-after:avoid}'
    + 'table{border-collapse:collapse;margin:12px 0;width:100%;page-break-inside:avoid}'
    + 'tr{page-break-inside:avoid}'
    + 'th,td{border:1px solid #94A3B8;padding:6px 10px;text-align:left;font-size:10pt}'
    + 'th{background:#1E293B;color:#FFFFFF;font-weight:bold}'
    + 'tr:nth-child(even) td{background:#F8FAFC}'
    + 'p{margin:6px 0}'
    + '.muted{color:#64748B;font-size:10pt}'
    + '.cover{background:#EFF6FF;border:1px solid #2563EB;border-radius:8px;padding:20px;margin:16px 0}'
    + '</style>';
  html += '<div class="cover"><h1>Informe EYA-28 — Escala del Yo Algorítmico</h1>'
    + '<p><strong>' + escXml(title) + '</strong></p>'
    + '<p>Generado: ' + new Date().toLocaleString('es-ES') + '</p>'
    + '<p class="muted">Universidad Central "Marta Abreu" de Las Villas · Carrera de Psicología</p></div>';

  // Recorrer secciones directamente (sin clonar todo el DOM)
  host.querySelectorAll('.sec').forEach(sec => {
    const h3 = sec.querySelector('h3');
    if (h3) html += '<h2>' + escXml(h3.textContent.trim()) + '</h2>';
    sec.querySelectorAll(':scope > h4, :scope > p').forEach(el => {
      const t = el.textContent.trim();
      if (!t) return;
      if (el.tagName === 'H4') html += '<h3>' + escXml(t) + '</h3>';
      else html += '<p>' + escXml(t) + '</p>';
    });
    // Tablas: copiar estructura real
    sec.querySelectorAll(':scope table').forEach(tbl => {
      html += '<table>';
      tbl.querySelectorAll('tr').forEach((tr, ri) => {
        html += '<tr>';
        tr.querySelectorAll('th,td').forEach(cell => {
          const tag = cell.tagName.toLowerCase();
          html += `<${tag}>${escXml(cell.textContent.trim())}</${tag}>`;
        });
        html += '</tr>';
      });
      html += '</table>';
    });
  });
  return html;
}
// ZIP mínimo (almacenado, sin compresión) para .docx
function crc32(str) {
  const tbl = crc32.t || (crc32.t = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
    return t;
  })());
  let c = 0xFFFFFFFF;
  const bytes = typeof str === 'string' ? new TextEncoder().encode(str) : str;
  for (let i = 0; i < bytes.length; i++) c = tbl[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function zipStore(files) {
  // files: [[nombre, Uint8Array|string],...] → Uint8Array del ZIP
  const enc = new TextEncoder();
  let offset = 0;
  const central = [];
  const parts = [];
  const w16 = v => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v, true); return b; };
  const w32 = v => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v, true); return b; };
  files.forEach(([name, data]) => {
    const nb = enc.encode(name);
    const db = typeof data === 'string' ? enc.encode(data) : data;
    const crc = crc32(db);
    const lh = new Uint8Array(30);
    lh.set([0x50, 0x4B, 0x03, 0x04]); lh.set(w16(20), 4); lh.set(w16(0), 8);
    lh.set(w32(crc), 14); lh.set(w32(db.length), 18); lh.set(w32(db.length), 22);
    lh.set(w16(nb.length), 26); lh.set(w16(0), 28);
    parts.push(lh, nb, db);
    central.push({ nb, crc, len: db.length, offset });
    offset += 30 + nb.length + db.length;
  });
  const cdStart = offset;
  let cdSize = 0;
  central.forEach(c => {
    const ch = new Uint8Array(46);
    ch.set([0x50, 0x4B, 0x01, 0x02]); ch.set(w16(20), 6); ch.set(w16(20), 8);
    ch.set(w32(c.crc), 16); ch.set(w32(c.len), 20); ch.set(w32(c.len), 24);
    ch.set(w16(c.nb.length), 28); ch.set(w32(c.offset), 42);
    parts.push(ch, c.nb);
    cdSize += 46 + c.nb.length;
  });
  const end = new Uint8Array(22);
  end.set([0x50, 0x4B, 0x05, 0x06]); end.set(w16(central.length), 8); end.set(w16(central.length), 10);
  end.set(w32(cdSize), 12); end.set(w32(cdStart), 16);
  parts.push(end);
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  parts.forEach(p => { out.set(p, o); o += p.length; });
  return out;
}
function escXml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function docxCellXml(text, isHeader) {
  const shd = isHeader ? '<w:tcPr><w:shd w:val="clear" w:fill="EFF6FF"/></w:tcPr>' : '';
  const b = isHeader ? '<w:b/>' : '';
  return `<w:tc>${shd}<w:p><w:r>${b}<w:t xml:space="preserve">${escXml(text)}</w:t></w:r></w:p></w:tc>`;
}
function docxTableXml(tbl) {
  const rows = Array.from(tbl.querySelectorAll('tr'));
  if (!rows.length) return '';
  const nCols = Math.max(1, ...rows.map(r => r.querySelectorAll('th,td').length));
  const borderTags = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'];
  let xml = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>' +
    borderTags.map(e => `<w:${e} w:val="single" w:sz="4" w:space="0" w:color="94A3B8"/>`).join('') +
    '</w:tblBorders></w:tblPr><w:tblGrid>';
  for (let i = 0; i < nCols; i++) xml += `<w:gridCol w:w="${Math.floor(9000 / nCols)}"/>`;
  xml += '</w:tblGrid>';
  rows.forEach(tr => {
    xml += '<w:tr>';
    tr.querySelectorAll('th,td').forEach(cell => {
      xml += docxCellXml(cell.textContent.trim(), cell.tagName.toLowerCase() === 'th');
    });
    xml += '</w:tr>';
  });
  return xml + '</w:tbl>';
}
function htmlToDocxParagraphs(html) {
  // Convierte el HTML del informe a WordprocessingML preservando
  // secciones, encabezados y TABLAS REALES (w:tbl), en orden de documento.
  const div = document.createElement('div');
  div.innerHTML = html;
  let xml = '';
  const para = (t, bold) => {
    if (!t) return;
    xml += `<w:p><w:r>${bold ? '<w:b/>' : ''}<w:t xml:space="preserve">${escXml(t)}</w:t></w:r></w:p>`;
  };
  div.querySelectorAll('h1,h2,h3,h4,p,table').forEach(el => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'table') {
      // Omitir tablas anidadas (ya incluidas en la exterior)
      if (el.parentElement && el.parentElement.closest('table')) return;
      xml += docxTableXml(el);
      return;
    }
    // Omitir texto que vive dentro de una tabla (ya va en celdas)
    if (el.closest('table')) return;
    const t = el.textContent.trim();
    if (!t) return;
    if (tag === 'h1' || tag === 'h2') para(t, true);
    else if (tag === 'h3' || tag === 'h4') para(t, true);
    else para(t);
  });
  return xml;
}
async function buildDocxBlob() {
  const content = wordHtmlContent();
  const bodyXml = htmlToDocxParagraphs(content);
  const docXml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`;
  const files = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`],
    ['word/document.xml', docXml]
  ];
  const zip = zipStore(files);
  return new Blob([zip], {type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}
async function buildDocBlob() {
  const html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8">' + wordHtmlContent() + '</body></html>';
  return new Blob(['\ufeff' + html], {type: 'application/msword;charset=utf-8'});
}
document.getElementById('btn-word').addEventListener('click', generarWordProfesional);
document.getElementById('btn-csv').addEventListener('click', exportCSV);
document.getElementById('btn-sps').addEventListener('click', () => {
  if (!DB) return;
  descargar('eya28_panel.sps', generarSPS(), 'text/csv;charset=utf-8');
});

// ===== Envío por correo vía EmailJS =====

// Extrae secciones estructuradas del DOM para el informe profesional
function extraerSecciones() {
  const host = document.getElementById('p-out');
  const secs = [];
  host.querySelectorAll('.sec').forEach(sec => {
    const h3 = sec.querySelector('h3');
    const titulo = h3 ? h3.textContent.trim() : 'Sección';
    const parrafos = [];
    sec.querySelectorAll(':scope > p').forEach(p => {
      const t = p.textContent.trim();
      if (t && !t.includes('Calculando') && !t.includes('Entrenando')) parrafos.push(t);
    });
    const tablas = [];
    sec.querySelectorAll(':scope table').forEach(tbl => {
      const rows = Array.from(tbl.querySelectorAll('tr')).map(tr =>
        Array.from(tr.querySelectorAll('th,td')).map(td => td.textContent.trim()));
      if (rows.length) tablas.push(rows);
    });
    if (parrafos.length || tablas.length) secs.push({ titulo, parrafos, tablas });
  });
  return secs;
}

async function enviarPorCorreo() {
  if (!DB) { alert('Procesa primero una base de datos.'); return; }
  const email = await new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
    ov.innerHTML = '<div style="background:#fff;padding:24px;border-radius:12px;max-width:90vw;width:380px;">'
      + '<h3 style="margin:0 0 12px">Enviar por correo</h3>'
      + '<p style="margin:0 0 12px;color:#666;font-size:14px">Se enviara el informe completo (sintaxis SPSS, PDF y Word).</p>'
      + '<input id="email-dest" type="email" value="carlosmiguelvaldesrodriguez@gmail.com" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;margin-bottom:12px;box-sizing:border-box;">'
      + '<div style="display:flex;gap:8px;justify-content:flex-end;">'
      + '<button id="email-cancel" style="padding:10px 16px;border:1px solid #ccc;border-radius:8px;background:#f5f5f5;cursor:pointer;">Cancelar</button>'
      + '<button id="email-ok" style="padding:10px 16px;border:none;border-radius:8px;background:#2563EB;color:#fff;cursor:pointer;">Enviar</button>'
      + '</div></div>';
    document.body.appendChild(ov);
    const inp = ov.querySelector('#email-dest');
    inp.focus(); inp.select();
    ov.querySelector('#email-cancel').onclick = () => { ov.remove(); resolve(null); };
    ov.querySelector('#email-ok').onclick = () => { const v = inp.value.trim(); ov.remove(); resolve(v || null); };
    inp.onkeydown = (e) => { if (e.key === 'Enter') ov.querySelector('#email-ok').click(); };
  });
  if (!email) return;
  const btn = document.getElementById('btn-email');
  const orig = btn ? btn.textContent : '';
  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Preparando…'; }
    await esperarAnalisis();
    // Extraer secciones (rápido, solo DOM)
    const secs = extraerSecciones();
    const sps = generarSPS();
    if (btn) btn.textContent = 'Generando archivos…';
    // Web Worker: genera DOCX + PDF sin bloquear
    const result = await new Promise((resolve, reject) => {
      const worker = new Worker('informe-worker.js?v=46');
      worker.onmessage = (e) => {
        const d = e.data;
        if (d.status === 'docx' && btn) btn.textContent = 'Generando Word…';
        else if (d.status === 'pdf' && btn) btn.textContent = 'Generando PDF…';
        else if (d.status === 'sps' && btn) btn.textContent = 'Finalizando…';
        else if (d.status === 'done') { worker.terminate(); resolve(d); }
        else if (d.status === 'error') { worker.terminate(); reject(new Error(d.message)); }
      };
      worker.onerror = (e) => { worker.terminate(); reject(new Error('Worker: ' + e.message)); };
      worker.postMessage({ secciones: secs, sps });
    });
    if (btn) btn.textContent = 'Enviando…';
    await fetch('https://script.google.com/macros/s/AKfycby3wCGgV5RYWNh-chLsvWgJwdncSFeNf-mv1FecaB5gQva82vD3uRd71WL4EQ5SZuCw/exec', {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'sendFilesPro', to: email, spsB64: result.spsB64, docxB64: result.docxB64, pdfB64: result.pdfB64 })
    }).catch(() => {});
    alert('Solicitud enviada. Revisa tu correo en 1-2 minutos.');
  } catch (e) {
    alert('Error: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = orig; }
  }
}
// Solicita el informe profesional generado por el asistente
async function solicitarInformePro() {
  if (!DB) { alert('Procesa primero una base de datos.'); return; }
  const email = await new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
    ov.innerHTML = '<div style="background:#fff;padding:24px;border-radius:12px;max-width:90vw;width:400px;">'
      + '<h3 style="margin:0 0 12px">Informe profesional</h3>'
      + '<p style="margin:0 0 12px;color:#666;font-size:14px">El asistente generará el informe completo (PDF, Word, SPSS y CSV) con calidad editorial y lo enviará por correo.</p>'
      + '<label style="font-size:13px;color:#666">Correo principal:</label>'
      + '<input id="email1" type="email" value="carlosmiguelvaldesrodriguez@gmail.com" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;margin:6px 0 12px;box-sizing:border-box;">'
      + '<label style="font-size:13px;color:#666">Correo adicional (opcional):</label>'
      + '<input id="email2" type="email" placeholder="colega@ejemplo.com" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;margin:6px 0 12px;box-sizing:border-box;">'
      + '<div style="display:flex;gap:8px;justify-content:flex-end;">'
      + '<button id="sc-cancel" style="padding:10px 16px;border:1px solid #ccc;border-radius:8px;background:#f5f5f5;cursor:pointer;">Cancelar</button>'
      + '<button id="sc-ok" style="padding:10px 16px;border:none;border-radius:8px;background:#7C3AED;color:#fff;cursor:pointer;">Solicitar</button>'
      + '</div></div>';
    document.body.appendChild(ov);
    ov.querySelector('#sc-cancel').onclick = () => { ov.remove(); resolve(null); };
    ov.querySelector('#sc-ok').onclick = () => {
      const e1 = ov.querySelector('#email1').value.trim();
      const e2 = ov.querySelector('#email2').value.trim();
      ov.remove(); resolve({e1, e2});
    };
  });
  if (!email || !email.e1) return;
  const btn = document.getElementById('btn-pro');
  const orig = btn ? btn.textContent : '';
  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Preparando…'; }
    await esperarAnalisis();
    if (btn) btn.textContent = 'Recopilando datos…';
    await new Promise(r => setTimeout(r, 30));
    const secs = extraerSecciones();
    const sps = generarSPS();
    // CSV limpio (primeras filas para no saturar)
    const csvData = typeof generarCSV !== 'undefined' ? generarCSV() : '';
    const payload = {
      action: 'solicitudInforme',
      to: email.e1,
      cc: email.e2 || '',
      meta: { n: (typeof DB !== 'undefined' && DB.length) ? DB.length : 0, fecha: new Date().toISOString() },
      secciones: secs,
      sps: sps,
      csv: typeof csvData === 'string' ? csvData.substring(0, 500000) : ''
    };
    if (btn) btn.textContent = 'Enviando solicitud…';
    await fetch('https://script.google.com/macros/s/AKfycby3wCGgV5RYWNh-chLsvWgJwdncSFeNf-mv1FecaB5gQva82vD3uRd71WL4EQ5SZuCw/exec', {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload)
    }).catch(() => {});
    alert('Solicitud enviada. El informe profesional llegará a tu correo en unos minutos.');
  } catch (e) {
    alert('Error: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = orig; }
  }
}



// Generador .docx simple: usa las secciones extraídas, formato limpio
function generarDocxSimple(secs) {
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  let body = '<w:p><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>Informe EYA-28</w:t></w:r></w:p>';
  body += '<w:p><w:r><w:rPr><w:sz w:val="20"/><w:color w:val="64748B"/></w:rPr><w:t>Generado: ' + esc(new Date().toLocaleString('es-ES')) + '</w:t></w:r></w:p>';
  for (const s of secs) {
    body += '<w:p><w:pPr><w:shd w:fill="2563EB" w:val="clear"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="26"/></w:rPr><w:t>' + esc(s.titulo) + '</w:t></w:r></w:p>';
    for (const p of (s.parrafos || [])) {
      body += '<w:p><w:r><w:t>' + esc(p.substring(0, 500)) + '</w:t></w:r></w:p>';
    }
    for (const tb of (s.tablas || [])) {
      if (!tb.length) continue;
      body += '<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>';
      tb.forEach((row, ri) => {
        body += '<w:tr><w:trPr><w:cantSplit/></w:trPr>';
        row.forEach(cell => {
          const bg = ri === 0 ? '1E293B' : 'FFFFFF';
          const fg = ri === 0 ? 'FFFFFF' : '1E293B';
          body += '<w:tc><w:tcPr><w:shd w:fill="' + bg + '" w:val="clear"/></w:tcPr><w:p><w:r><w:rPr><w:color w:val="' + fg + '"/>' + (ri === 0 ? '<w:b/>' : '') + '</w:rPr><w:t>' + esc(String(cell).substring(0, 200)) + '</w:t></w:r></w:p></w:tc>';
        });
        body += '</w:tr>';
      });
      body += '</w:tbl>';
    }
  }
  const docXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body + '<w:sectPr/></w:body></w:document>';
  const ctXml = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
  const relsXml = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
  return buildDocx([
    { name: '[Content_Types].xml', content: ctXml },
    { name: '_rels/.rels', content: relsXml },
    { name: 'word/document.xml', content: docXml }
  ]);
}



// Extrae la definición del documento PDF para reutilizar en email
function generarPDFDocDef() {
  const host = document.getElementById('p-out');
  const title = document.getElementById('p-title').textContent;
  const SLATE = '#1E293B', BLUE = '#2563EB', LIGHT = '#F8FAFC', GRAY = '#64748B';
  const content = [
    { text: 'INFORME EYA-28', style: 'portada', margin: [0, 60, 0, 8] },
    { text: 'Escala del Yo Algorítmico', style: 'subportada', margin: [0, 0, 0, 20] },
    { text: title, style: 'titulo2', margin: [0, 0, 0, 8] },
    { text: 'Generado: ' + new Date().toLocaleString('es-ES'), style: 'muted', margin: [0, 0, 0, 4] },
    { text: 'Universidad Central "Marta Abreu" de Las Villas · Carrera de Psicología', style: 'muted', margin: [0, 0, 0, 30] },
    { text: '', pageBreak: 'after' },
  ];
  host.querySelectorAll('.sec').forEach(sec => {
    const h3 = sec.querySelector('h3');
    if (h3) content.push({ text: h3.textContent.trim(), style: 'seccion', margin: [0, 16, 0, 8] });
    sec.querySelectorAll(':scope > h4').forEach(h4 => {
      content.push({ text: h4.textContent.trim(), style: 'subseccion', margin: [0, 10, 0, 4] });
    });
    sec.querySelectorAll(':scope > p').forEach(p => {
      const t = p.textContent.trim();
      if (t && !t.includes('Calculando') && !t.includes('Entrenando')) {
        content.push({ text: t, style: 'parrafo', margin: [0, 2, 0, 4] });
      }
    });
    sec.querySelectorAll(':scope table').forEach(tbl => {
      const rows = Array.from(tbl.querySelectorAll('tr')).map(tr =>
        Array.from(tr.querySelectorAll('th,td')).map(td => td.textContent.trim()));
      if (!rows.length) return;
      const headerRow = rows[0].map(h => ({ text: h, style: 'th' }));
      const bodyRows = rows.slice(1).map(r => r.map(cell => ({ text: cell, style: 'td' })));
      content.push({
        table: { headerRows: 1, widths: Array(rows[0].length).fill('*'), body: [headerRow, ...bodyRows] },
        layout: { fillColor: (ri) => ri === 0 ? SLATE : (ri % 2 === 0 ? LIGHT : null),
          hLineColor: () => '#94A3B8', vLineColor: () => '#94A3B8' },
        margin: [0, 8, 0, 12],
      });
    });
  });
  return {
    content,
    styles: {
      portada: { fontSize: 28, bold: true, color: SLATE, alignment: 'center' },
      subportada: { fontSize: 16, color: BLUE, alignment: 'center' },
      titulo2: { fontSize: 13, bold: true, color: SLATE, alignment: 'center' },
      muted: { fontSize: 9, color: GRAY, alignment: 'center' },
      seccion: { fontSize: 14, bold: true, color: '#FFFFFF', background: BLUE },
      subseccion: { fontSize: 12, bold: true, color: BLUE },
      parrafo: { fontSize: 10, color: SLATE },
      th: { fontSize: 9, bold: true, color: '#FFFFFF' },
      td: { fontSize: 9, color: SLATE },
    },
    defaultStyle: { font: 'Roboto' },
    footer: (cp, pc) => ({ text: `Página ${cp} de ${pc} · EYA-28`, alignment: 'center', fontSize: 8, color: GRAY, margin: [0, 10, 0, 0] }),
  };
}
// Genera el blob DOCX para email
async function generarDocxBlob(DX) {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
          HeadingLevel, AlignmentType, ShadingType, WidthType } = DX;
  const host = document.getElementById('p-out');
  const title = document.getElementById('p-title').textContent;
  const children = [
    new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'INFORME EYA-28', bold: true, color: '1E293B', size: 56 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Escala del Yo Algorítmico', color: '2563EB', size: 28 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: title, bold: true, size: 22 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Generado: ' + new Date().toLocaleString('es-ES'), color: '64748B', size: 18 })] }),
  ];
  host.querySelectorAll('.sec').forEach(sec => {
    const h3 = sec.querySelector('h3');
    if (h3) children.push(new Paragraph({ heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: h3.textContent.trim(), bold: true, color: 'FFFFFF', size: 26 })],
      shading: { type: ShadingType.CLEAR, fill: '2563EB' } }));
    sec.querySelectorAll(':scope > h4').forEach(h4 => {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: h4.textContent.trim(), bold: true, color: '2563EB', size: 24 })] }));
    });
    sec.querySelectorAll(':scope > p').forEach(p => {
      const t = p.textContent.trim();
      if (t && !t.includes('Calculando') && !t.includes('Entrenando')) {
        children.push(new Paragraph({ children: [new TextRun({ text: t, size: 20 })] }));
      }
    });
    sec.querySelectorAll(':scope table').forEach(tbl => {
      const rows = Array.from(tbl.querySelectorAll('tr')).map(tr =>
        Array.from(tr.querySelectorAll('th,td')).map(td => td.textContent.trim()));
      if (!rows.length) return;
      const tableRows = rows.map((r, ri) => new TableRow({
        cantSplit: true, tableHeader: ri === 0,
        children: r.map(cell => new TableCell({
          shading: { type: ShadingType.CLEAR, fill: ri === 0 ? '1E293B' : (ri % 2 === 0 ? 'F8FAFC' : 'FFFFFF') },
          children: [new Paragraph({ children: [
            new TextRun({ text: cell, bold: ri === 0, color: ri === 0 ? 'FFFFFF' : '1E293B', size: 18 })
          ]})],
        })),
      }));
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows }));
    });
  });
  const doc = new Document({ sections: [{ children }] });
  return await Packer.toBlob(doc);
}


