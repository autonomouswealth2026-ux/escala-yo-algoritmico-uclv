/* EYA-28 · Módulo multivariado · réplica de SPSS Statistics v32 en JS vanilla */
'use strict';
/* ================================================================
   Réplicas implementadas (Analyze > ...):
   1. manova()        — GLM > Multivariate: MANOVA unifactorial.
                        Wilks Λ, Pillai, Hotelling-Lawley, Roy (aprox. F de Rao/McKeon).
   2. kmeans()        — Classify > K-Means Cluster (k-means++, Lloyd).
   3. hierarchical()  — Classify > Hierarchical Cluster (Ward/complete/average,
                        Lance-Williams; historial de fusiones p/ dendrograma).
   4. mediation()     — Mediation Analysis (novedad v32): X→M→Y, Sobel + bootstrap.
   5. blandAltman()   — Bland-Altman (novedad v30): acuerdo entre dos mediciones.
   Requiere (no duplica): matT, matMul, matVec, identity, jacobiEigen, matInv,
   matDet, ibeta, lgamma, normalCDF, regression  (panel-advanced.js) y
   mean, variance, sd (panel.js).
   ================================================================ */

/* ---------- p-valor F (no existe como función nombrada en panel-advanced.js) ---------- */
// P(F_{d1,d2} > f) = I_{d2/(d2+d1·f)}(d2/2, d1/2)
function fP(F, df1, df2) {
  if (df1 <= 0 || df2 <= 0 || isNaN(F) || F < 0) return NaN;
  if (F === 0) return 1;
  const x = df2 / (df2 + df1 * F);
  return ibeta(x, df2 / 2, df1 / 2);
}

/* ---------- Descomposición de Cholesky (para E^-1·H simetrizada) ---------- */
function cholesky(A) {
  const n = A.length;
  const L = Array.from({length: n}, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (s <= 1e-12) return null; // no definida positiva
        L[i][j] = Math.sqrt(s);
      } else {
        L[i][j] = s / L[j][j];
      }
    }
  }
  return L;
}

/* Autovalores de E^-1·H vía transformación simétrica L^-1·H·L^-T (E = L·L') */
function manovaEigen(H, E) {
  const L = cholesky(E);
  if (!L) return null;
  const Linv = matInv(L);
  const S = matMul(matMul(Linv, H), matT(Linv));
  const {values} = jacobiEigen(S);
  return values.map(v => Math.max(v, 0)).sort((a, b) => b - a);
}

/* ================================================================
   1. MANOVA unifactorial — réplica SPSS: Analyze > GLM > Multivariate
   groups: array de k grupos; cada grupo = array de vectores (n_k × p)
   Retorna H, E, los 4 estadísticos con aprox. F y p, gl.
   ================================================================ */
function manova(groups, varNames) {
  const k = groups.length;
  if (k < 2) return {error: 'Se necesitan al menos 2 grupos'};
  const p = groups[0][0].length;
  const N = groups.reduce((s, g) => s + g.length, 0);
  const df_h = k - 1, df_e = N - k;
  if (df_e <= p) return {error: 'gl del error insuficientes para ' + p + ' variables (n=' + N + ')'};

  // Medias
  const grand = new Array(p).fill(0);
  groups.forEach(g => g.forEach(v => { for (let j = 0; j < p; j++) grand[j] += v[j]; }));
  for (let j = 0; j < p; j++) grand[j] /= N;
  const gmeans = groups.map(g => {
    const m = new Array(p).fill(0);
    g.forEach(v => { for (let j = 0; j < p; j++) m[j] += v[j]; });
    for (let j = 0; j < p; j++) m[j] /= g.length;
    return m;
  });

  // Matrices SSCP: H (hipótesis) y E (error)
  let H = Array.from({length: p}, () => new Array(p).fill(0));
  let E = Array.from({length: p}, () => new Array(p).fill(0));
  groups.forEach((g, gi) => {
    const d = gmeans[gi].map((m, j) => m - grand[j]);
    for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) H[a][b] += g.length * d[a] * d[b];
    g.forEach(v => {
      const r = v.map((x, j) => x - gmeans[gi][j]);
      for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) E[a][b] += r[a] * r[b];
    });
  });

  const eig = manovaEigen(H, E);
  if (!eig) return {error: 'Matriz E singular: variables colineales o redundantes'};
  const s = Math.min(p, df_h);
  const lam = eig.slice(0, s);

  const wilks = lam.reduce((pr, l) => pr * (1 / (1 + l)), 1);
  const pillai = lam.reduce((sm, l) => sm + l / (1 + l), 0);
  const hotelling = lam.reduce((sm, l) => sm + l, 0);
  const royTheta = lam[0] / (1 + lam[0]);

  // --- Aproximaciones F (idénticas a R summary.manova / SPSS) ---
  const m = (Math.abs(df_h - p) - 1) / 2;
  const n = (df_e - p - 1) / 2;

  // Wilks: aprox. F de Rao
  const den = p * p + df_h * df_h - 5;
  const t = den > 0 ? Math.sqrt((p * p * df_h * df_h - 4) / den) : 1;
  const r = df_e - (p - df_h + 1) / 2;
  const u = (p * df_h - 2) / 4;
  const w_df1 = p * df_h, w_df2 = r * t - 2 * u;
  const wF = ((1 - Math.pow(wilks, 1 / t)) / Math.pow(wilks, 1 / t)) * (w_df2 / w_df1);

  // Pillai: aprox. F
  const pi_df1 = s * (2 * m + s + 1), pi_df2 = s * (2 * n + s + 1);
  const piF = (pi_df2 / pi_df1) * (pillai / (s - pillai));

  // Hotelling-Lawley: aprox. F de McKeon
  const h_df1 = s * (2 * m + s + 1), h_df2 = 2 * (s * n + 1);
  const hF = (hotelling / s) * (h_df2 / h_df1);

  // Roy: cota superior F
  const dmax = Math.max(p, df_h);
  const r_df1 = dmax, r_df2 = df_e - dmax;
  const rF = r_df2 > 0 ? ((r_df2 / dmax) * lam[0]) : NaN;

  return {
    k, p, N, df_h, df_e, varNames: varNames || null,
    eigenvalues: lam,
    wilks:     {value: wilks,     F: wF,  df1: w_df1,  df2: w_df2,  p: fP(wF, w_df1, w_df2)},
    pillai:    {value: pillai,    F: piF, df1: pi_df1, df2: pi_df2, p: fP(piF, pi_df1, pi_df2)},
    hotelling: {value: hotelling, F: hF,  df1: h_df1,  df2: h_df2,  p: fP(hF, h_df1, h_df2)},
    roy:       {value: royTheta, lambdaMax: lam[0], F: rF, df1: r_df1, df2: r_df2, p: fP(rF, r_df1, r_df2)}
  };
}

/* ================================================================
   2. K-Means — réplica SPSS: Analyze > Classify > K-Means Cluster
   Inicialización k-means++, iteración de Lloyd. Retorna clusters,
   centroides y WCSS (within-cluster sum of squares).
   ================================================================ */
function dist2(a, b) {
  let s = 0;
  for (let j = 0; j < a.length; j++) s += (a[j] - b[j]) * (a[j] - b[j]);
  return s;
}
function kmeans(data, k, maxIter) {
  maxIter = maxIter || 100;
  const n = data.length, p = data[0].length;
  if (k < 1 || k > n) return {error: 'k debe estar entre 1 y n'};
  // k-means++
  const centroids = [data[Math.floor(Math.random() * n)].slice()];
  while (centroids.length < k) {
    const d2 = data.map(v => {
      let m = Infinity;
      for (const c of centroids) { const d = dist2(v, c); if (d < m) m = d; }
      return m;
    });
    const sum = d2.reduce((s, x) => s + x, 0);
    let rr = Math.random() * sum, idx = 0;
    while (idx < n - 1 && rr > d2[idx]) { rr -= d2[idx]; idx++; }
    centroids.push(data[idx].slice());
  }
  let assign = new Array(n).fill(-1);
  for (let it = 0; it < maxIter; it++) {
    let changed = false;
    const nc = new Array(n);
    for (let i = 0; i < n; i++) {
      let bi = 0, bd = Infinity;
      for (let c = 0; c < k; c++) { const d = dist2(data[i], centroids[c]); if (d < bd) { bd = d; bi = c; } }
      nc[i] = bi;
      if (nc[i] !== assign[i]) changed = true;
    }
    assign = nc;
    const sums = Array.from({length: k}, () => new Array(p).fill(0));
    const cnt = new Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      cnt[assign[i]]++;
      for (let j = 0; j < p; j++) sums[assign[i]][j] += data[i][j];
    }
    for (let c = 0; c < k; c++) if (cnt[c] > 0) for (let j = 0; j < p; j++) centroids[c][j] = sums[c][j] / cnt[c];
    if (!changed) break;
  }
  let wcss = 0;
  const sizes = new Array(k).fill(0);
  for (let i = 0; i < n; i++) { wcss += dist2(data[i], centroids[assign[i]]); sizes[assign[i]]++; }
  return {clusters: assign, centroids, wcss, k, sizes, n};
}

/* ================================================================
   3. Clustering jerárquico aglomerativo — réplica SPSS:
      Analyze > Classify > Hierarchical Cluster.
      Linkage: 'ward' (defecto SPSS), 'complete', 'average' (UPGMA).
      Recurrencia de Lance-Williams. Retorna historial de fusiones
      {a, b, dist, size, id} apto para dendrograma. O(n²).
   ================================================================ */
function hierarchical(data, method) {
  method = method || 'ward';
  const coef = {
    ward:     {ai: (ni, nj, nk) => (nk + ni) / (nk + ni + nj), aj: (ni, nj, nk) => (nk + nj) / (nk + ni + nj), b: (ni, nj, nk) => -nk / (nk + ni + nj), g: () => 0},
    complete: {ai: () => 0.5, aj: () => 0.5, b: () => 0, g: () => 0.5},
    average:  {ai: (ni, nj) => ni / (ni + nj), aj: (ni, nj) => nj / (ni + nj), b: () => 0, g: () => 0}
  }[method];
  if (!coef) return {error: "method debe ser 'ward', 'complete' o 'average'"};
  const n = data.length;
  const sq = method === 'ward'; // Ward opera sobre distancias euclídeas al cuadrado
  const d0 = (a, b) => {
    let s = 0;
    for (let j = 0; j < a.length; j++) s += (a[j] - b[j]) * (a[j] - b[j]);
    return sq ? s : Math.sqrt(s);
  };
  const D = [];
  for (let i = 0; i < n; i++) {
    D.push(new Array(n).fill(0));
    for (let j = 0; j < i; j++) { const d = d0(data[i], data[j]); D[i][j] = D[j][i] = d; }
  }
  const size = new Array(2 * n).fill(0);
  for (let i = 0; i < n; i++) size[i] = 1;
  const active = new Set();
  for (let i = 0; i < n; i++) active.add(i);
  const merges = [];
  let cur = n;
  while (active.size > 1) {
    const arr = [...active];
    let bi = -1, bj = -1, bd = Infinity;
    for (let x = 0; x < arr.length; x++) for (let y = x + 1; y < arr.length; y++) {
      const i = arr[x], j = arr[y];
      if (D[i][j] < bd) { bd = D[i][j]; bi = i; bj = j; }
    }
    const ni = size[bi], nj = size[bj];
    merges.push({a: bi, b: bj, dist: sq ? Math.sqrt(bd) : bd, size: ni + nj, id: cur});
    D.push(new Array(cur + 1).fill(0));
    for (let i = 0; i < cur; i++) D[i].push(0);
    active.forEach(kk => {
      if (kk === bi || kk === bj) return;
      const nk = size[kk];
      const dki = D[kk][bi], dkj = D[kk][bj];
      const nd = coef.ai(ni, nj, nk) * dki + coef.aj(ni, nj, nk) * dkj +
                 coef.b(ni, nj, nk) * bd + coef.g() * Math.abs(dki - dkj);
      D[cur][kk] = D[kk][cur] = nd;
    });
    size[cur] = ni + nj;
    active.delete(bi); active.delete(bj); active.add(cur);
    cur++;
  }
  return {merges, method, n};
}

/* ================================================================
   4. Análisis de mediación — réplica SPSS v32: Analyze > Mediation Analysis
      Modelo X → M → Y.
      a: X→M · b: M→Y|X · c: efecto total X→Y · c': efecto directo X→Y|X,M
      Test de Sobel + bootstrap percentil (1000 réplicas) del efecto indirecto.
   ================================================================ */
function mediation(x, m, y, nBoot) {
  nBoot = nBoot || 1000;
  const n = x.length;
  const col = v => v.map(z => [z]);
  try {
    const r_a = regression(col(x), m);                    // M ~ X
    const a = r_a.beta[1], se_a = r_a.se[1];
    const XM = x.map((xi, i) => [xi, m[i]]);
    const r_b = regression(XM, y);                        // Y ~ X + M
    const b = r_b.beta[2], se_b = r_b.se[2];
    const cPrime = r_b.beta[1], se_cPrime = r_b.se[1];
    const r_c = regression(col(x), y);                    // Y ~ X (total)
    const c = r_c.beta[1], se_c = r_c.se[1];

    const indirect = a * b;
    // Test de Sobel (primera orden)
    const se_sobel = Math.sqrt(b * b * se_a * se_a + a * a * se_b * se_b);
    const sobelZ = se_sobel > 0 ? indirect / se_sobel : NaN;
    const sobelP = isNaN(sobelZ) ? NaN : 2 * (1 - normalCDF(Math.abs(sobelZ)));

    // Bootstrap percentil del efecto indirecto
    const boots = [];
    for (let r = 0; r < nBoot; r++) {
      const idx = Array.from({length: n}, () => Math.floor(Math.random() * n));
      const xb = idx.map(i => x[i]), mb = idx.map(i => m[i]), yb = idx.map(i => y[i]);
      try {
        const ra = regression(col(xb), mb);
        const rb = regression(xb.map((xi, j) => [xi, mb[j]]), yb);
        boots.push(ra.beta[1] * rb.beta[2]);
      } catch (e) { /* réplica degenerada: se omite */ }
    }
    boots.sort((u, v) => u - v);
    const lo = boots[Math.floor(0.025 * boots.length)];
    const hi = boots[Math.floor(0.975 * boots.length)];

    return {
      n, nBoot: boots.length,
      a, se_a, b, se_b, c, se_c, cPrime, se_cPrime,
      cP: tP(c / se_c, n - 2), cPrimeP: tP(cPrime / se_cPrime, n - 3),
      indirect, se_sobel, sobelZ, sobelP,
      bootCI: [lo, hi],
      propMediated: c !== 0 ? indirect / c : NaN
    };
  } catch (e) {
    return {error: 'Mediación no estimable: ' + e.message};
  }
}

/* ================================================================
   runMediationAsync: ejecuta la mediación por bloques con setTimeout
   para no congelar la interfaz en muestras grandes. Muestra progreso.
   ================================================================ */
function runMediationAsync(x, m, y, nBoot, resEl, done) {
  nBoot = nBoot || 200;
  const n = x.length;
  const col = v => v.map(z => [z]);
  let base;
  try {
    const r_a = regression(col(x), m);
    const a = r_a.beta[1], se_a = r_a.se[1];
    const XM = x.map((xi, i) => [xi, m[i]]);
    const r_b = regression(XM, y);
    const b = r_b.beta[2], se_b = r_b.se[2];
    const cPrime = r_b.beta[1], se_cPrime = r_b.se[1];
    const r_c = regression(col(x), y);
    const c = r_c.beta[1], se_c = r_c.se[1];
    const indirect = a * b;
    const se_sobel = Math.sqrt(b * b * se_a * se_a + a * a * se_b * se_b);
    const sobelZ = se_sobel > 0 ? indirect / se_sobel : NaN;
    const sobelP = isNaN(sobelZ) ? NaN : 2 * (1 - normalCDF(Math.abs(sobelZ)));
    base = { n, a, se_a, b, se_b, c, se_c, cPrime, se_cPrime,
      cP: tP(c / se_c, n - 2), cPrimeP: tP(cPrime / se_cPrime, n - 3),
      indirect, se_sobel, sobelZ, sobelP,
      propMediated: c !== 0 ? indirect / c : NaN };
  } catch (e) {
    done({ error: 'Mediación no estimable: ' + e.message });
    return;
  }
  const boots = [];
  let r = 0;
  const CHUNK = 25; // réplicas por bloque
  function step() {
    const end = Math.min(r + CHUNK, nBoot);
    for (; r < end; r++) {
      const idx = Array.from({ length: n }, () => Math.floor(Math.random() * n));
      const xb = idx.map(i => x[i]), mb = idx.map(i => m[i]), yb = idx.map(i => y[i]);
      try {
        const ra = regression(col(xb), mb);
        const rb = regression(xb.map((xi, j) => [xi, mb[j]]), yb);
        boots.push(ra.beta[1] * rb.beta[2]);
      } catch (e) { /* réplica degenerada: se omite */ }
    }
    if (resEl) resEl.textContent = 'Mediación: ' + r + '/' + nBoot + '…';
    if (r < nBoot) { setTimeout(step, 0); return; }
    boots.sort((u, v) => u - v);
    base.nBoot = boots.length;
    base.bootCI = boots.length
      ? [boots[Math.floor(0.025 * boots.length)], boots[Math.floor(0.975 * boots.length)]]
      : [NaN, NaN];
    done(base);
  }
  step();
}

/* ================================================================
   5. Bland-Altman — réplica SPSS v30: acuerdo entre dos mediciones.
      d = a − b; sesgo = media(d); límites = sesgo ± 1.96·DE(d).
   ================================================================ */
function blandAltman(a, b) {
  const n = a.length;
  const d = a.map((v, i) => v - b[i]);
  const avg = a.map((v, i) => (v + b[i]) / 2);
  const bias = mean(d);
  const sdd = sd(d);
  return {
    n, bias, sdDiff: sdd,
    lower: bias - 1.96 * sdd,
    upper: bias + 1.96 * sdd,
    // puntos (promedio, diferencia) para el gráfico
    points: avg.map((m, i) => ({mean: m, diff: d[i]}))
  };
}
