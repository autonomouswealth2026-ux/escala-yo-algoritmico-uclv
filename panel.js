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
function descargar(nombre, contenido, tipo) {
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  // Intentar Web Share API primero (mejor en móvil)
  try {
    if (navigator.share && navigator.canShare) {
      const file = new File([blob], nombre, { type: blob.type || tipo });
      if (navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: nombre }).then(() => {
          URL.revokeObjectURL(url);
        }).catch(() => {
          // Usuario canceló o falló: descarga tradicional
          descargaTradicional(nombre, url);
        });
        return;
      }
    }
  } catch (e) { /* ignorar, usar fallback */ }
  descargaTradicional(nombre, url);
}
function descargaTradicional(nombre, url) {
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (a.parentNode) document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 10000);
  } catch (e) {
    // Último recurso: abrir en nueva pestaña
    window.open(url, '_blank');
  }
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

function exportSPS() {
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
  descargar('eya28_panel.sps', s, 'application/octet-stream');
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
document.getElementById('btn-pdf').addEventListener('click', () => {
  const btn = document.getElementById('btn-pdf');
  btn.textContent = 'Preparando…';
  try {
    const title = document.getElementById('p-title').textContent;
    const host = document.getElementById('p-out');
    const printWin = window.open('', '_blank');
    if (!printWin) {
      alert('Permite ventanas emergentes para generar el PDF');
      btn.textContent = 'Descargar PDF';
      return;
    }
    let body = '<h1>Informe EYA-28</h1><p>' + title + ' · ' + new Date().toLocaleString('es-ES') + '</p>';
    host.querySelectorAll('.sec').forEach(sec => {
      const h3 = sec.querySelector('h3');
      if (h3) body += '<h2>' + h3.textContent.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</h2>';
      sec.querySelectorAll(':scope > h4, :scope > p').forEach(el => {
        const t = el.textContent.trim();
        if (!t) return;
        const tag = el.tagName === 'H4' ? 'h3' : 'p';
        body += `<${tag}>${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</${tag}>`;
      });
      sec.querySelectorAll(':scope table').forEach(tbl => {
        body += '<table>';
        tbl.querySelectorAll('tr').forEach(tr => {
          body += '<tr>';
          tr.querySelectorAll('th,td').forEach(cell => {
            const tag = cell.tagName.toLowerCase();
            body += `<${tag}>${cell.textContent.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;')}</${tag}>`;
          });
          body += '</tr>';
        });
        body += '</table>';
      });
    });
    printWin.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Informe EYA-28</title>' +
      '<style>body{font-family:Arial,sans-serif;font-size:10pt;margin:40px}h1{color:#1E293B}h2{color:#1E293B;border-bottom:2px solid #2563EB;padding-bottom:4px;margin-top:20px}h3{color:#2563EB}table{border-collapse:collapse;margin:8px 0;width:100%}th,td{border:1px solid #94A3B8;padding:4px 6px;text-align:left;font-size:9pt}th{background:#EFF6FF}p{margin:4px 0}</style>' +
      '</head><body>' + body + '<script>window.onload=function(){setTimeout(function(){window.print();},500);}<\/script></body></html>');
    printWin.document.close();
  } catch (e) {
    alert('Error al generar PDF: ' + e.message);
  }
  btn.textContent = 'Descargar PDF';
});
/* ---------- descargar Word (.doc y .docx) — VERSIÓN CON TABLAS ---------- */
function wordHtmlContent() {
  const title = document.getElementById('p-title').textContent;
  const host = document.getElementById('p-out');
  let html = '<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt}h2{color:#1E293B;border-bottom:2px solid #2563EB;padding-bottom:4px;margin-top:20px}h3{color:#2563EB;margin-top:16px}table{border-collapse:collapse;margin:8px 0;width:100%}th,td{border:1px solid #94A3B8;padding:4px 8px;text-align:left;font-size:10pt}th{background:#EFF6FF;font-weight:bold}p{margin:4px 0}.muted{color:#64748B;font-size:10pt}</style>';
  html += '<h1>Informe EYA-28</h1><p>' + escXml(title) + ' · Generado: ' + new Date().toLocaleString('es-ES') + '</p>';

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
document.getElementById('btn-word').addEventListener('click', async () => {
  const btn = document.getElementById('btn-word');
  const origText = btn.textContent;
  btn.disabled = true; btn.textContent = 'Generando…';
  try {
    await new Promise(r => setTimeout(r, 30));
    const blob = await buildDocxBlob();
    descargar('informe-eya28.docx', blob, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  } catch (e) {
    alert('No se pudo generar el Word: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = origText;
  }
});
document.getElementById('btn-csv').addEventListener('click', exportCSV);
document.getElementById('btn-sps').addEventListener('click', exportSPS);
