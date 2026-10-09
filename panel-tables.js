/* EYA-28 · Tablas estilo SPSS + Crosstabs + Post-hoc · JS vanilla */
'use strict';
/* ================================================================
   Réplicas de IBM SPSS Statistics v32 (verificadas en auditoría):
   - Analyze > Descriptive Statistics > Crosstabs ..... crosstab()
       Tablas SPSS: "Case Processing Summary", "Crosstab",
       "Chi-Square Tests" (Pearson, Likelihood Ratio), "Symmetric
       Measures" (Phi, Cramér's V, Contingency Coefficient).
   - Analyze > Compare Means > One-Way ANOVA > Post Hoc:
       Tukey HSD (Tukey-Kramer para n desigual) ........ tukeyHSD()
       Games-Howell (varianzas desiguales) ............. gamesHowell()
     Ambas usan la distribución del rango estudentizado Q(k,gl):
     ptukey() = CDF por integración numérica doble (fórmula
     clásica: rango de k normales / sqrt(chi²_gl/gl)),
     qtukey() = cuantil por bisección.
   - Analyze > Descriptive Statistics > Frequencies .... freqTable()
       Tabla SPSS "Statistics" + tabla de frecuencias con
       Frequency, Percent, Valid Percent, Cumulative Percent.
   - Tablas pivot SPSS (HTML) .......................... spssTable()
       Título en negrita sobre la tabla, rejilla fina, notas al pie
       con superíndices (a, b, c...) como el visor de SPSS.

   Funciones requeridas (definidas en panel.js / panel-advanced.js,
   que se cargan ANTES que este archivo en panel.html):
     mean, variance, sd, f2, chi2P, normalCDF, lgamma
   ================================================================ */

/* CSS necesario (agregar a styles.css del panel):
.spss-pivot{margin:1.1rem 0}
.spss-title{font-weight:700;font-size:.95rem;margin-bottom:.35rem}
.spss-table{border-collapse:collapse;font-size:.85rem;max-width:100%}
.spss-table th,.spss-table td{border:1px solid #9a9a9a;padding:.3rem .6rem;text-align:center}
.spss-table thead th{border-bottom:2px solid #333;background:#f2f2f2}
.spss-table td.rowlab,.spss-table th.rowlab{text-align:left;font-weight:600;background:#fafafa}
.spss-notes{font-size:.75rem;color:#555;margin-top:.3rem;line-height:1.5}
*/

/* ---------- Utilidades ---------- */
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function fmtP(p) {
  if (p == null || isNaN(p)) return 'n/d';
  if (p < 0.001) return '<.001';
  return p.toFixed(3);
}

/* ================================================================
   1. DISTRIBUCIÓN DEL RANGO ESTUDENTIZADO Q(k, gl)
   ================================================================
   F(q) = P(Q ≤ q) con Q = (máx Y − mín Y)/S, Yᵢ ~ N(0,1) iid,
   S = √(χ²_gl/gl) independiente.
   F(q) = ∫₀^∞ H(q·s)·f_S(s) ds,
   H(r) = k·∫_{−∞}^{∞} φ(z)·[Φ(z+r) − Φ(z)]^{k−1} dz
        = CDF del rango de k normales estándar,
   f_S(s) = [gl^{gl/2} / (2^{gl/2−1}·Γ(gl/2))]·s^{gl−1}·e^{−gl·s²/2}.
   Ambas integrales por Simpson compuesto. */

/* CDF del rango de k normales estándar (integración interna) */
function _rangeCDF(r, k) {
  if (r <= 0) return 0;
  const Z = 10, NZ = 300, h = 2 * Z / NZ;
  const SQRT2PI = Math.sqrt(2 * Math.PI);
  let sum = 0;
  for (let i = 0; i <= NZ; i++) {
    const z = -Z + i * h;
    const phi = Math.exp(-z * z / 2) / SQRT2PI;
    const d = Math.max(normalCDF(z + r) - normalCDF(z), 0);
    const term = k * phi * Math.pow(d, k - 1);
    sum += (i === 0 || i === NZ) ? term : (i % 2 === 0 ? 2 * term : 4 * term);
  }
  return sum * h / 3;
}

/* ptukey(q, k, df): P(Q(k,df) ≤ q). Réplica de R::ptukey / SPSS. */
function ptukey(q, k, df) {
  if (!(q > 0)) return 0;
  if (!(k >= 2) || !(df > 0)) return NaN;
  // Densidad de S = √(χ²_df/df)
  const C = Math.exp((df / 2) * Math.log(df) - (df / 2 - 1) * Math.log(2) - lgamma(df / 2));
  const fS = s => s <= 0 ? 0 : C * Math.pow(s, df - 1) * Math.exp(-df * s * s / 2);
  const SMAX = 6, NS = 250, hs = SMAX / NS;
  let total = 0;
  for (let i = 0; i <= NS; i++) {
    const s = i * hs;
    const term = _rangeCDF(q * s, k) * fS(s);
    total += (i === 0 || i === NS) ? term : (i % 2 === 0 ? 2 * term : 4 * term);
  }
  const F = total * hs / 3;
  return Math.min(Math.max(F, 0), 1);
}

/* qtukey(p, k, df): cuantil — valor crítico q tal que P(Q ≤ q) = p.
   Réplica de R::qtukey. Bisección (F monótona en q). */
function qtukey(p, k, df) {
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;
  if (!(k >= 2) || !(df > 0)) return NaN;
  let lo = 0, hi = 1;
  while (ptukey(hi, k, df) < p) { hi *= 2; if (hi > 1e6) break; }
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (ptukey(mid, k, df) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/* ================================================================
   2. CROSSTABS — Analyze > Descriptive Statistics > Crosstabs
   ================================================================
   crosstab(a, b): tabla de contingencia r×c entre dos variables
   categóricas. Calcula χ² de Pearson, razón de verosimilitud G²,
   V de Cramér y coeficiente de contingencia — las tablas
   "Chi-Square Tests" y "Symmetric Measures" del visor SPSS.
   Los pares con perdido (null/NaN/undefined) se excluyen por lista,
   como hace SPSS por defecto. */
function crosstab(a, b) {
  const pairs = [];
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const av = a[i], bv = b[i];
    if (av == null || bv == null || Number.isNaN(av) || Number.isNaN(bv)) continue;
    pairs.push([av, bv]);
  }
  const N = pairs.length;
  const rows = [...new Set(pairs.map(p => p[0]))].sort((x, y) => (x > y ? 1 : x < y ? -1 : 0));
  const cols = [...new Set(pairs.map(p => p[1]))].sort((x, y) => (x > y ? 1 : x < y ? -1 : 0));
  const r = rows.length, c = cols.length;
  if (r < 2 || c < 2 || N === 0) return { error: 'Se necesitan al menos 2 categorías por variable y N > 0' };
  const ri = new Map(rows.map((v, i) => [v, i]));
  const ci = new Map(cols.map((v, j) => [v, j]));
  const obs = Array.from({ length: r }, () => new Array(c).fill(0));
  pairs.forEach(([av, bv]) => { obs[ri.get(av)][ci.get(bv)]++; });
  const rowT = obs.map(row => row.reduce((s, v) => s + v, 0));
  const colT = cols.map((_, j) => obs.reduce((s, row) => s + row[j], 0));

  let chi2 = 0, g2 = 0, cellsE5 = 0, minE = Infinity;
  const exp = Array.from({ length: r }, () => new Array(c).fill(0));
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) {
    const e = rowT[i] * colT[j] / N;
    exp[i][j] = e;
    if (e < minE) minE = e;
    if (e < 5) cellsE5++;
    if (e > 0) {
      chi2 += (obs[i][j] - e) * (obs[i][j] - e) / e;
      if (obs[i][j] > 0) g2 += obs[i][j] * Math.log(obs[i][j] / e);
    }
  }
  g2 *= 2;
  const df = (r - 1) * (c - 1);
  const p = chi2P(chi2, df);
  const pLR = chi2P(g2, df);
  const cramerV = Math.sqrt(chi2 / (N * Math.min(r - 1, c - 1)));
  const contCoef = Math.sqrt(chi2 / (chi2 + N));
  // Phi solo tiene sentido en 2×2 (con signo por la diagonal)
  let phi = null;
  if (r === 2 && c === 2) {
    phi = Math.sqrt(chi2 / N) * Math.sign(obs[0][0] * obs[1][1] - obs[0][1] * obs[1][0]);
  }
  return {
    rows, cols, obs, exp, rowT, colT, N, r, c,
    chi2, df, p, g2, pLR, cramerV, contCoef, phi,
    cellsE5, pctE5: cellsE5 / (r * c) * 100, minE,
    nExcluded: Math.min(a.length, b.length) - N
  };
}

/* ================================================================
   3. TUKEY HSD — One-Way ANOVA > Post Hoc > Tukey
   ================================================================
   tukeyHSD(groups, labels): comparaciones por pares tras ANOVA.
   Con n desigual aplica la corrección Tukey-Kramer en el SE:
     SE = √(MSW/2 · (1/nᵢ + 1/nⱼ)),  q = |mᵢ−mⱼ|/SE,
     p = 1 − ptukey(q, k, gl_intra),
     IC95% = (mᵢ−mⱼ) ± qtukey(.95,k,gl)·SE.
   Réplica de la tabla "Multiple Comparisons" de SPSS ONEWAY. */
function tukeyHSD(groups, labels) {
  const k = groups.length;
  if (k < 2) return { error: 'Se necesitan al menos 2 grupos' };
  const means = groups.map(mean);
  const ns = groups.map(g => g.length);
  const N = ns.reduce((s, n) => s + n, 0);
  let ssw = 0;
  groups.forEach((g, gi) => { const m = means[gi]; g.forEach(v => { ssw += (v - m) * (v - m); }); });
  const dfw = N - k;
  if (dfw <= 0) return { error: 'gl intra-grupos ≤ 0' };
  const msw = ssw / dfw;
  const qcrit = qtukey(0.95, k, dfw);
  const labs = labels || groups.map((_, i) => 'Grupo ' + (i + 1));
  const pairs = [];
  for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
    const diff = means[i] - means[j];
    const se = Math.sqrt(msw / 2 * (1 / ns[i] + 1 / ns[j]));
    const q = se > 0 ? Math.abs(diff) / se : 0;
    const p = 1 - ptukey(q, k, dfw);
    const me = qcrit * se;
    pairs.push({
      g1: labs[i], g2: labs[j],
      mean1: means[i], mean2: means[j], n1: ns[i], n2: ns[j],
      diff, se, q, p,
      ciLow: diff - me, ciHigh: diff + me,
      sig: p < 0.05
    });
  }
  return { k, N, dfw, msw, qcrit95: qcrit, pairs };
}

/* ================================================================
   4. GAMES-HOWELL — One-Way ANOVA > Post Hoc (varianzas desiguales)
   ================================================================
   gamesHowell(groups, labels): como Tukey pero sin asumir
   homocedasticidad. Por par:
     t = |mᵢ−mⱼ|/√(sᵢ²/nᵢ + sⱼ²/nⱼ),
     gl = Welch-Satterthwaite,
     q = t·√2,  p = 1 − ptukey(q, k, gl),
     IC95% = (mᵢ−mⱼ) ± qtukey(.95,k,gl)·√((sᵢ²/nᵢ+sⱼ²/nⱼ)/2).
   Réplica de la tabla "Multiple Comparisons" con Games-Howell. */
function gamesHowell(groups, labels) {
  const k = groups.length;
  if (k < 2) return { error: 'Se necesitan al menos 2 grupos' };
  const means = groups.map(mean);
  const vars = groups.map(variance);
  const ns = groups.map(g => g.length);
  const labs = labels || groups.map((_, i) => 'Grupo ' + (i + 1));
  const pairs = [];
  for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
    const diff = means[i] - means[j];
    const vi = vars[i] / ns[i], vj = vars[j] / ns[j];
    const se2 = vi + vj;
    if (!(se2 > 0) || ns[i] < 2 || ns[j] < 2) {
      pairs.push({ g1: labs[i], g2: labs[j], diff, error: 'n < 2 o varianza 0' });
      continue;
    }
    const t = Math.abs(diff) / Math.sqrt(se2);
    // Welch-Satterthwaite
    const df = se2 * se2 / (vi * vi / (ns[i] - 1) + vj * vj / (ns[j] - 1));
    const q = t * Math.SQRT2;
    const p = 1 - ptukey(q, k, df);
    const qcrit = qtukey(0.95, k, df);
    const me = qcrit * Math.sqrt(se2 / 2);
    pairs.push({
      g1: labs[i], g2: labs[j],
      mean1: means[i], mean2: means[j], n1: ns[i], n2: ns[j],
      diff, se: Math.sqrt(se2), df, q, p,
      ciLow: diff - me, ciHigh: diff + me,
      sig: p < 0.05
    });
  }
  return { k, pairs };
}

/* ================================================================
   5. FREQUENCIES — Analyze > Descriptive Statistics > Frequencies
   ================================================================
   freqTable(values): tabla de frecuencias estilo SPSS con
   Frequency, Percent, Valid Percent y Cumulative Percent, más la
   tabla "Statistics" (N válido/perdido, media, mediana, moda, DE,
   varianza, asimetría, curtosis, rango, mín, máx, suma, P25/P75).
   Acepta numéricas o categóricas (strings); los perdidos
   (null/NaN/undefined/'') se excluyen del % válido como en SPSS. */
function freqTable(values) {
  const isMissing = v => v == null || (typeof v === 'number' && Number.isNaN(v)) || v === '';
  const valid = values.filter(v => !isMissing(v));
  const nMissing = values.length - valid.length;
  const cats = [...new Set(valid)].sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));
  let cum = 0;
  const table = cats.map(cat => {
    const fr = valid.filter(v => v === cat).length;
    const pct = values.length > 0 ? fr / values.length * 100 : 0;
    const vpct = valid.length > 0 ? fr / valid.length * 100 : 0;
    cum += vpct;
    return { value: cat, freq: fr, percent: pct, validPercent: vpct, cumPercent: Math.min(cum, 100) };
  });

  // Tabla "Statistics" (solo si todos los valores válidos son numéricos)
  let stats = null;
  const nums = valid.filter(v => typeof v === 'number');
  if (nums.length > 0 && nums.length === valid.length) {
    const s = [...nums].sort((x, y) => x - y);
    const nn = s.length;
    const pctile = p => {
      const pos = p * (nn - 1), lo = Math.floor(pos), hi = Math.ceil(pos);
      return s[lo] + (s[hi] - s[lo]) * (pos - lo);
    };
    const counts = new Map();
    nums.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
    let mode = null, modeF = -1;
    counts.forEach((f, v) => { if (f > modeF) { modeF = f; mode = v; } });
    stats = {
      nValid: valid.length, nMissing,
      mean: mean(nums),
      median: pctile(0.5),
      mode,
      sd: nn > 1 ? sd(nums) : NaN,
      variance: nn > 1 ? variance(nums) : NaN,
      skewness: nn > 2 ? skewness(nums) : NaN,
      kurtosis: nn > 3 ? kurtosis(nums) : NaN,
      range: s[nn - 1] - s[0],
      min: s[0], max: s[nn - 1],
      sum: nums.reduce((t, v) => t + v, 0),
      p25: pctile(0.25), p50: pctile(0.5), p75: pctile(0.75)
    };
  }
  return { table, total: values.length, nValid: valid.length, nMissing, stats, numeric: stats !== null };
}

/* ================================================================
   6. TABLAS PIVOT SPSS (HTML)
   ================================================================
   spssTable(title, headers, rows, footnotes): genera una tabla con la
   estética del visor de resultados de SPSS — título en negrita sobre
   la tabla, rejilla fina con doble línea bajo el encabezado y notas
   al pie numeradas con superíndice (a, b, c...).
   - headers: array de strings (admite HTML, p.ej. <i>gl</i>)
   - rows: array de arrays; la primera celda de cada fila se marca
     como etiqueta de fila (alineada a la izquierda)
   - footnotes: array de strings */
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

/* ================================================================
   7. RENDERIZADO (devuelven HTML listo para insertar en el panel)
   ================================================================ */

function renderCrosstab(ct, rowVarName, colVarName) {
  if (ct.error) return '<div class="sec"><p class="err">' + escHtml(ct.error) + '</p></div>';
  const rn = rowVarName || 'Filas', cn = colVarName || 'Columnas';
  let h = '<div class="sec"><h3>Tablas de contingencia (réplica SPSS: Analyze → Descriptive Statistics → Crosstabs)</h3>';

  // Resumen del procesamiento de los casos
  h += spssTable('Resumen del procesamiento de los casos',
    ['', 'N', 'Porcentaje', 'N', 'Porcentaje', 'N', 'Porcentaje'],
    [[rn + ' * ' + cn, ct.N, f2(ct.N / (ct.N + ct.nExcluded) * 100) + '%',
      ct.nExcluded, f2(ct.nExcluded / (ct.N + ct.nExcluded) * 100) + '%',
      ct.N + ct.nExcluded, '100.0%']],
    []);

  // Tabla de contingencia (recuentos + % fila + % columna)
  const chead = [''].concat(ct.cols.flatMap(c => [escHtml(String(c)), '% fila', '% col.']));
  chead.push('Total');
  const crows = ct.rows.map((rv, i) => {
    const row = [escHtml(String(rv)) + ' × ' + escHtml(cn)];
    ct.cols.forEach((_, j) => {
      row.push(ct.obs[i][j],
        f2(ct.obs[i][j] / ct.rowT[i] * 100) + '%',
        f2(ct.obs[i][j] / ct.colT[j] * 100) + '%');
    });
    row.push('<strong>' + ct.rowT[i] + '</strong>');
    return row;
  });
  const totRow = ['<strong>Total</strong>'];
  ct.cols.forEach((_, j) => { totRow.push('<strong>' + ct.colT[j] + '</strong>', '', ''); });
  totRow.push('<strong>' + ct.N + '</strong>');
  crows.push(totRow);
  h += spssTable(rn + ' * ' + cn + ' — tabulación cruzada', chead, crows, []);

  // Pruebas de chi-cuadrado
  const notes = [];
  if (ct.pctE5 > 0) notes.push(ct.cellsE5 + ' casillas (' + f2(ct.pctE5) + '%) tienen un recuento esperado menor que 5. El recuento mínimo esperado es ' + f2(ct.minE) + '.');
  h += spssTable('Pruebas de chi-cuadrado',
    ['', 'Valor', 'gl', 'Sig. asintótica (bilateral)'],
    [['Chi-cuadrado de Pearson', f2(ct.chi2), ct.df, '<strong>' + fmtP(ct.p) + '</strong>'],
     ['Razón de verosimilitud', f2(ct.g2), ct.df, fmtP(ct.pLR)],
     ['N de casos válidos', ct.N, '', '']],
    notes);

  // Medidas simétricas
  const symRows = [['V de Cramér', f2(ct.cramerV), ct.N]];
  if (ct.phi !== null) symRows.unshift(['Phi', f2(ct.phi), ct.N]);
  symRows.push(['Coeficiente de contingencia', f2(ct.contCoef), ct.N]);
  h += spssTable('Medidas simétricas',
    ['', 'Valor', 'N de casos válidos'], symRows,
    ['V de Cramér: 0 = sin asociación, 1 = asociación perfecta.']);

  return h + '</div>';
}

function renderFreqTable(ft, varName) {
  const vn = varName || 'Variable';
  let h = '<div class="sec"><h3>Frecuencias (réplica SPSS: Analyze → Descriptive Statistics → Frequencies)</h3>';
  if (ft.stats) {
    const s = ft.stats;
    const f1 = v => (v == null || isNaN(v)) ? 'n/d' : f2(v);
    h += spssTable('Estadísticos — ' + vn,
      ['', ''],
      [['N — Válidos', s.nValid], ['N — Perdidos', s.nMissing],
       ['Media', f1(s.mean)], ['Mediana', f1(s.median)], ['Moda', f1(s.mode)],
       ['Desv. típ.', f1(s.sd)], ['Varianza', f1(s.variance)],
       ['Asimetría', f1(s.skewness)], ['Curtosis', f1(s.kurtosis)],
       ['Rango', f1(s.range)], ['Mínimo', f1(s.min)], ['Máximo', f1(s.max)],
       ['Suma', f1(s.sum)], ['Percentil 25', f1(s.p25)], ['Percentil 75', f1(s.p75)]],
      []);
  } else {
    h += spssTable('Estadísticos — ' + vn, ['', ''],
      [['N — Válidos', ft.nValid], ['N — Perdidos', ft.nMissing]], []);
  }
  h += spssTable(vn,
    ['', 'Frecuencia', 'Porcentaje', 'Porcentaje válido', 'Porcentaje acumulado'],
    ft.table.map(t => [escHtml(String(t.value)), t.freq, f2(t.percent) + '%',
      f2(t.validPercent) + '%', f2(t.cumPercent) + '%'])
      .concat([['<strong>Total</strong>', '<strong>' + ft.total + '</strong>', '<strong>100.0%</strong>', '', '']]),
    []);
  return h + '</div>';
}

function _posthocRows(pairs) {
  return pairs.map(p => {
    if (p.error) return [escHtml(p.g1) + ' vs ' + escHtml(p.g2), 'n/d', 'n/d', 'n/d', 'n/d', 'n/d'];
    const sig = p.sig ? '<strong>' + fmtP(p.p) + '</strong>' : fmtP(p.p);
    return [escHtml(p.g1) + ' vs ' + escHtml(p.g2),
      f2(p.diff), f2(p.se), sig,
      '[' + f2(p.ciLow) + ', ' + f2(p.ciHigh) + ']',
      p.sig ? '<span class="badge ok">Sí</span>' : '<span class="badge bad">No</span>'];
  });
}

function renderTukey(res, varName) {
  if (res.error) return '<div class="sec"><p class="err">' + escHtml(res.error) + '</p></div>';
  let h = '<div class="sec"><h3>Comparaciones múltiples — HSD de Tukey (réplica SPSS: One-Way ANOVA → Post Hoc)</h3>';
  h += '<p class="muted">Variable dependiente: ' + escHtml(varName || '—') +
    ' · MSW = ' + f2(res.msw) + ', gl = ' + res.dfw +
    ', q crítico (.95) = ' + f2(res.qcrit95) + '</p>';
  h += spssTable('Comparaciones múltiples — HSD de Tukey',
    ['Comparación (I−J)', 'Diferencia de medias', 'Error típico', 'Sig.', 'IC 95%', 'Significativa'],
    _posthocRows(res.pairs),
    ['Se muestran las diferencias entre cada par de grupos con intervalo de confianza simultáneo del 95%.']);
  return h + '</div>';
}

function renderGamesHowell(res, varName) {
  if (res.error) return '<div class="sec"><p class="err">' + escHtml(res.error) + '</p></div>';
  let h = '<div class="sec"><h3>Comparaciones múltiples — Games-Howell (réplica SPSS: Post Hoc, varianzas desiguales)</h3>';
  h += '<p class="muted">Variable dependiente: ' + escHtml(varName || '—') +
    ' · No asume igualdad de varianzas (gl de Welch-Satterthwaite por par).</p>';
  h += spssTable('Comparaciones múltiples — Games-Howell',
    ['Comparación (I−J)', 'Diferencia de medias', 'Error típico', 'Sig.', 'IC 95%', 'Significativa'],
    _posthocRows(res.pairs),
    ['Adecuado cuando la prueba de Levene rechaza la homocedasticidad.']);
  return h + '</div>';
}
