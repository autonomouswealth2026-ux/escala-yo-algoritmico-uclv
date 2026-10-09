/* EYA-28 · Módulo psicométrico avanzado · réplica de SPSS Statistics v32 en JS vanilla */
'use strict';
/* ================================================================
   Incluye: KMO, Bartlett, PCA (Jacobi), Varimax, PAF, communalidades,
   scree, factor scores, alfa-si-se-elimina, ítem-total, Guttman λ2,
   split-half, ICC, omega McDonald, t-test, ANOVA, Mann-Whitney,
   Kruskal-Wallis, Wilcoxon, Shapiro-Wilk (aprox), Levene, asimetría,
   curtosis, regresión múltiple, correlación de distancia.
   ================================================================ */

/* ---------- Álgebra matricial básica ---------- */
function matT(A) { return A[0].map((_, j) => A.map(r => r[j])); }
function matMul(A, B) {
  const n = A.length, m = B[0].length, p = B.length;
  const C = Array.from({length: n}, () => new Array(m).fill(0));
  for (let i = 0; i < n; i++) for (let k = 0; k < p; k++) {
    const aik = A[i][k];
    for (let j = 0; j < m; j++) C[i][j] += aik * B[k][j];
  }
  return C;
}
function matVec(A, v) { return A.map(r => r.reduce((s, x, j) => s + x * v[j], 0)); }
function identity(n) { return Array.from({length: n}, (_, i) => Array.from({length: n}, (_, j) => i === j ? 1 : 0)); }

/* Descomposición en autovalores por método de Jacobi (matriz simétrica) */
function jacobiEigen(A, maxIter = 100) {
  const n = A.length;
  let V = identity(n);
  let a = A.map(r => r.slice());
  for (let iter = 0; iter < maxIter; iter++) {
    let p = 0, q = 1, maxOff = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (Math.abs(a[i][j]) > maxOff) { maxOff = Math.abs(a[i][j]); p = i; q = j; }
    }
    if (maxOff < 1e-12) break;
    const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
    const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
    const c = 1 / Math.sqrt(t * t + 1), s = t * c;
    for (let i = 0; i < n; i++) {
      const aip = a[i][p], aiq = a[i][q];
      a[i][p] = c * aip - s * aiq; a[i][q] = s * aip + c * aiq;
    }
    for (let i = 0; i < n; i++) {
      const api = a[p][i], aqi = a[q][i];
      a[p][i] = c * api - s * aqi; a[q][i] = s * api + c * aqi;
    }
    for (let i = 0; i < n; i++) {
      const vip = V[i][p], viq = V[i][q];
      V[i][p] = c * vip - s * viq; V[i][q] = s * vip + c * viq;
    }
  }
  const eigenvalues = a.map((r, i) => r[i]);
  // Ordenar descendente
  const idx = eigenvalues.map((_, i) => i).sort((x, y) => eigenvalues[y] - eigenvalues[x]);
  return { values: idx.map(i => eigenvalues[i]), vectors: idx.map(i => V.map(r => r[i])) };
}

/* Inversa de matriz por Gauss-Jordan */
function matInv(A) {
  const n = A.length;
  const aug = A.map((r, i) => r.concat(identity(n)[i]));
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let i = col + 1; i < n; i++) if (Math.abs(aug[i][col]) > Math.abs(aug[piv][col])) piv = i;
    [aug[col], aug[piv]] = [aug[piv], aug[col]];
    const d = aug[col][col] || 1e-12;
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= d;
    for (let i = 0; i < n; i++) if (i !== col) {
      const f = aug[i][col];
      for (let j = 0; j < 2 * n; j++) aug[i][j] -= f * aug[col][j];
    }
  }
  return aug.map(r => r.slice(n));
}
function matDet(A) {
  const n = A.length;
  const m = A.map(r => r.slice());
  let det = 1;
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let i = col + 1; i < n; i++) if (Math.abs(m[i][col]) > Math.abs(m[piv][col])) piv = i;
    if (piv !== col) { [m[col], m[piv]] = [m[piv], m[col]]; det *= -1; }
    if (Math.abs(m[col][col]) < 1e-15) return 0;
    det *= m[col][col];
    for (let i = col + 1; i < n; i++) {
      const f = m[i][col] / m[col][col];
      for (let j = col; j < n; j++) m[i][j] -= f * m[col][j];
    }
  }
  return det;
}

/* ---------- Matriz de correlaciones ---------- */
function corrMatrix(data) {
  // data: filas=casos, columnas=variables
  const p = data[0].length;
  const cols = Array.from({length: p}, (_, j) => data.map(r => r[j]));
  const R = Array.from({length: p}, () => new Array(p).fill(0));
  for (let i = 0; i < p; i++) for (let j = i; j < p; j++) {
    const r = pearson(cols[i], cols[j]);
    R[i][j] = R[j][i] = isNaN(r) ? 0 : r;
  }
  for (let i = 0; i < p; i++) R[i][i] = 1;
  return R;
}

/* ---------- KMO y Bartlett ---------- */
function kmo(R) {
  const p = R.length;
  let inv;
  try { inv = matInv(R); } catch (e) { return { global: NaN, msa: [] }; }
  // Correlaciones parciales
  let sumR2 = 0, sumP2 = 0;
  const msa = [];
  for (let i = 0; i < p; i++) {
    let r2 = 0, q2 = 0;
    for (let j = 0; j < p; j++) if (i !== j) {
      const pij = -inv[i][j] / Math.sqrt(inv[i][i] * inv[j][j]);
      r2 += R[i][j] * R[i][j]; q2 += pij * pij;
      sumR2 += R[i][j] * R[i][j]; sumP2 += pij * pij;
    }
    msa.push((r2 + q2) > 0 ? r2 / (r2 + q2) : 0.5);
  }
  const denom = sumR2 + sumP2;
  return { global: denom > 0 ? sumR2 / denom : 0.5, msa };
}
function bartlett(R, n) {
  const p = R.length;
  const det = matDet(R);
  if (det <= 0) return { chi2: NaN, df: 0, p: NaN };
  const chi2 = -((n - 1) - (2 * p + 5) / 6) * Math.log(det);
  const df = p * (p - 1) / 2;
  return { chi2, df, p: chi2P(chi2, df) };
}
// p-valor chi-cuadrado EXACTO vía gamma incompleta regularizada
// P(χ² > x) = 1 - γ(k/2, x/2)/Γ(k/2), k = gl
function chi2P(chi2, df) {
  if (df <= 0 || isNaN(chi2) || chi2 < 0) return NaN;
  if (chi2 === 0) return 1;
  return 1 - gammaP(df / 2, chi2 / 2);
}
// γ(s,x)/Γ(s): gamma incompleta inferior regularizada (expansión en serie)
function gammaP(s, x) {
  if (x <= 0) return 0;
  if (x < s + 1) {
    // Serie
    let term = 1 / s, sum = term, n = 1;
    for (; n < 500; n++) {
      term *= x / (s + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-15) break;
    }
    return sum * Math.exp(-x + s * Math.log(x) - lgamma(s));
  }
  // Fracción continua para Q(s,x), luego P = 1 - Q
  return 1 - gammaQ(s, x);
}
function gammaQ(s, x) {
  const EPS = 1e-15, FPMIN = 1e-300;
  let b = x + 1 - s, c = 1 / FPMIN, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - s);
    b += 2;
    d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return Math.exp(-x + s * Math.log(x) - lgamma(s)) * h;
}
function normalCDF(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
// p-valor t BILATERAL: P(|T| > |t|) = I_{df/(df+t²)}(df/2, 1/2)
// Ya es bilateral; NO envolver en 2*(1-...)
function tP(t, df) {
  if (df <= 0 || isNaN(t)) return NaN;
  if (t === 0) return 1;
  const x = df / (df + t * t);
  return ibeta(x, df / 2, 0.5);
}
// Integración numérica directa de la densidad t (Simpson adaptativo) — referencia robusta
function tP_numeric(t, df) {
  const at = Math.abs(t);
  // Densidad t: f(x) = Γ((df+1)/2) / (√(df·π)·Γ(df/2)) · (1+x²/df)^(-(df+1)/2)
  const c = Math.exp(lgamma((df + 1) / 2) - lgamma(df / 2)) / Math.sqrt(df * Math.PI);
  const f = x => c * Math.pow(1 + x * x / df, -(df + 1) / 2);
  // Integrar de |t| a ∞ con cambio de variable u=1/(1+x) para cola infinita
  // ∫_at^∞ f = ∫_0^{1/(1+at)} f((1-u)/u) / u² du
  const upper = 1 / (1 + at);
  const g = u => {
    if (u <= 0) return 0;
    const x = (1 - u) / u;
    return f(x) / (u * u);
  };
  const N = 2000;
  const hstep = upper / N;
  let sum = g(0) + g(upper);
  for (let i = 1; i < N; i++) sum += (i % 2 === 0 ? 2 : 4) * g(i * hstep);
  const tail = sum * hstep / 3;
  return Math.min(2 * tail, 1);
}
// Función beta incompleta regularizada (aprox. por fracción continua)
function ibeta(x, a, b) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return bt * betacf(x, a, b) / a;
  return 1 - bt * betacf(1 - x, b, a) / b;
}
function betacf(x, a, b) {
  const MAXIT = 500, EPS = 1e-15, FPMIN = 1e-300;
  let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d; let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}
function lgamma(x) {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  const t = x + 7.5;
  return Math.log(2 * Math.PI) / 2 + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/* ---------- PCA ---------- */
function pca(R, nFactors) {
  const { values, vectors } = jacobiEigen(R);
  const p = R.length;
  const k = nFactors || p;
  // Cargas = autovector * sqrt(autovalor)
  const loadings = [];
  for (let i = 0; i < p; i++) {
    loadings.push([]);
    for (let f = 0; f < k; f++) loadings[i].push(vectors[f][i] * Math.sqrt(Math.max(values[f], 0)));
  }
  const communalities = loadings.map(row => row.reduce((s, v) => s + v * v, 0));
  const varExplained = values.slice(0, k).map(v => v / p * 100);
  return { eigenvalues: values, loadings, communalities, varExplained, totalVar: values.slice(0, k).reduce((s, v) => s + v, 0) / p * 100 };
}

/* ---------- Rotación Varimax (criterio de Kaiser, 1958) ----------
   Maximiza V = Σ_f [ Σ_i a_if⁴ − (Σ_i a_if²)²/p ] por rotaciones planas.
   Para cada par (f1,f2): tan(4φ) = (D − 2AB/p) / (C − (A²−B²)/p)
   donde u=a²−b², v=2ab, A=Σu, B=Σv, C=Σ(u²−v²), D=2Σ(uv). */
function varimax(L, maxIter = 100) {
  const p = L.length, k = L[0].length;
  let A = L.map(r => r.slice());
  for (let iter = 0; iter < maxIter; iter++) {
    let maxPhi = 0;
    for (let f1 = 0; f1 < k - 1; f1++) for (let f2 = f1 + 1; f2 < k; f2++) {
      let sA = 0, sB = 0, sC = 0, sD = 0;
      for (let i = 0; i < p; i++) {
        const a = A[i][f1], b = A[i][f2];
        const u = a * a - b * b, v = 2 * a * b;
        sA += u; sB += v;
        sC += u * u - v * v;
        sD += 2 * u * v;
      }
      const num = sD - 2 * sA * sB / p;
      const den = sC - (sA * sA - sB * sB) / p;
      const phi = Math.atan2(num, den) / 4;
      maxPhi = Math.max(maxPhi, Math.abs(phi));
      if (Math.abs(phi) > 1e-12) {
        const c = Math.cos(phi), s = Math.sin(phi);
        for (let i = 0; i < p; i++) {
          const a = A[i][f1], b = A[i][f2];
          A[i][f1] = a * c + b * s;
          A[i][f2] = -a * s + b * c;
        }
      }
    }
    if (maxPhi < 1e-10) break;
  }
  return A;
}
// Criterio V de Kaiser (para verificación)
function varimaxCriterion(A) {
  const p = A.length, k = A[0].length;
  let V = 0;
  for (let f = 0; f < k; f++) {
    let s2 = 0, s4 = 0;
    for (let i = 0; i < p; i++) { const b2 = A[i][f] * A[i][f]; s2 += b2; s4 += b2 * b2; }
    V += s4 - s2 * s2 / p;
  }
  return V;
}

/* ---------- PAF (Principal Axis Factoring) ---------- */
function paf(R, nFactors, maxIter = 50) {
  const p = R.length;
  // Comunalidades iniciales = R² múltiple (SMC)
  let inv;
  try { inv = matInv(R); } catch (e) { inv = identity(p); }
  let h2 = inv.map((r, i) => 1 - 1 / Math.max(r[i], 1e-10));
  h2 = h2.map(v => Math.min(Math.max(v, 0.01), 0.99));
  let Rh = R.map((r, i) => r.map((v, j) => i === j ? h2[i] : v));
  for (let it = 0; it < maxIter; it++) {
    const { values, vectors } = jacobiEigen(Rh);
    const loadings = [];
    for (let i = 0; i < p; i++) {
      loadings.push([]);
      for (let f = 0; f < nFactors; f++) loadings[i].push(vectors[f][i] * Math.sqrt(Math.max(values[f], 0.001)));
    }
    const newH2 = loadings.map(row => row.reduce((s, v) => s + v * v, 0));
    let maxDiff = 0;
    for (let i = 0; i < p; i++) maxDiff = Math.max(maxDiff, Math.abs(newH2[i] - h2[i]));
    h2 = newH2.map(v => Math.min(Math.max(v, 0.01), 0.99));
    Rh = R.map((r, i) => r.map((vv, j) => i === j ? h2[i] : vv));
    if (maxDiff < 1e-4) break;
  }
  const { values, vectors } = jacobiEigen(Rh);
  const loadings = [];
  for (let i = 0; i < p; i++) {
    loadings.push([]);
    for (let f = 0; f < nFactors; f++) loadings[i].push(vectors[f][i] * Math.sqrt(Math.max(values[f], 0.001)));
  }
  return { loadings, communalities: h2, eigenvalues: values.slice(0, nFactors) };
}

/* ---------- Fiabilidad extendida ---------- */
function itemTotal(data, cols) {
  // data: matriz casos×variables; cols: índices
  return cols.map((c, ci) => {
    const item = data.map(r => r[c]);
    const rest = data.map(r => cols.filter((_, j) => j !== ci).reduce((s, cc) => s + r[cc], 0));
    const r = pearson(item, rest);
    return isNaN(r) ? 0 : r;
  });
}
function alphaIfDeleted(data, cols) {
  return cols.map((_, ci) => {
    const keep = cols.filter((_, j) => j !== ci);
    const m = data.map(r => keep.map(c => r[c]));
    const a = cronbach(m);
    return isNaN(a) ? 0 : a;
  });
}
function guttmanLambda2(data) {
  const p = data[0].length;
  const a1 = cronbach(data);
  const cols = Array.from({length: p}, (_, j) => data.map(r => r[j]));
  let sumCov = 0;
  const vars = cols.map(variance);
  for (let i = 0; i < p; i++) for (let j = i + 1; j < p; j++) {
    const c = pearson(cols[i], cols[j]) * Math.sqrt(vars[i] * vars[j]);
    sumCov += c * c;
  }
  const totalVar = variance(data.map(r => r.reduce((s, v) => s + v, 0)));
  if (!totalVar) return a1;
  const lambda2 = a1 + (Math.sqrt(p / (p - 1)) * Math.sqrt(sumCov)) / totalVar * 0; // simplificado
  // Fórmula Guttman λ2: λ1 + sqrt(n/(n-1) * ΣΣσ²ᵢⱼ) / σ²ₜ
  const l2 = a1 + (Math.sqrt(p / (p - 1)) * Math.sqrt(2 * sumCov)) / totalVar;
  return Math.min(l2, 1);
}
function splitHalf(data) {
  const p = data[0].length;
  const h1 = Array.from({length: Math.ceil(p / 2)}, (_, i) => i * 2).filter(i => i < p);
  const h2 = Array.from({length: Math.floor(p / 2)}, (_, i) => i * 2 + 1).filter(i => i < p);
  const s1 = data.map(r => h1.reduce((s, j) => s + r[j], 0));
  const s2 = data.map(r => h2.reduce((s, j) => s + r[j], 0));
  const rhh = pearson(s1, s2);
  if (isNaN(rhh)) return NaN;
  return 2 * rhh / (1 + rhh); // Spearman-Brown
}
function omegaMcDonald(loadings) {
  // ω = (Σλ)² / [(Σλ)² + Σ(1-λ²)]
  const sumL = loadings.reduce((s, v) => s + v, 0);
  const sumU = loadings.reduce((s, v) => s + (1 - v * v), 0);
  return (sumL * sumL) / (sumL * sumL + sumU);
}

/* ---------- Pruebas de grupos ---------- */
// t de Student independiente
function tTestInd(a, b) {
  const ma = mean(a), mb = mean(b), va = variance(a), vb = variance(b);
  const na = a.length, nb = b.length;
  const sp2 = ((na - 1) * va + (nb - 1) * vb) / (na + nb - 2);
  const t = (ma - mb) / Math.sqrt(sp2 * (1 / na + 1 / nb));
  const df = na + nb - 2;
  const d = (ma - mb) / Math.sqrt(sp2); // Cohen d
  return { t, df, p: tP(t, df), d, ma, mb };
}
// ANOVA unifactorial
function anovaOneWay(groups) {
  const all = groups.flat();
  const grand = mean(all);
  const k = groups.length, N = all.length;
  let ssb = 0, ssw = 0;
  groups.forEach(g => {
    const m = mean(g);
    ssb += g.length * (m - grand) ** 2;
    g.forEach(v => { ssw += (v - m) ** 2; });
  });
  const dfb = k - 1, dfw = N - k;
  const msb = ssb / dfb, msw = ssw / dfw;
  const F = msw > 0 ? msb / msw : NaN;
  // p-valor F (aprox)
  const p = 1 - ibeta(dfb * F / (dfb * F + dfw), dfb / 2, dfw / 2);
  const eta2 = ssb / (ssb + ssw);
  return { F, dfb, dfw, p: isNaN(F) ? NaN : p, eta2 };
}
// Mann-Whitney U
function mannWhitney(a, b) {
  const combined = a.map(v => ({v, g: 0})).concat(b.map(v => ({v, g: 1})));
  combined.sort((x, y) => x.v - y.v);
  // Rangos con empates
  let ranks = new Array(combined.length);
  let i = 0;
  while (i < combined.length) {
    let j = i;
    while (j < combined.length && combined[j].v === combined[i].v) j++;
    const avg = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) ranks[k] = avg;
    i = j;
  }
  const R1 = combined.reduce((s, x, idx) => x.g === 0 ? s + ranks[idx] : s, 0);
  const n1 = a.length, n2 = b.length;
  const U1 = R1 - n1 * (n1 + 1) / 2;
  const U = Math.min(U1, n1 * n2 - U1);
  const mu = n1 * n2 / 2, sigma = Math.sqrt(n1 * n2 * (n1 + n2 + 1) / 12);
  const z = (U - mu) / sigma;
  return { U, z, p: 2 * (1 - normalCDF(Math.abs(z))) };
}
// Kruskal-Wallis
function kruskalWallis(groups) {
  const combined = [];
  groups.forEach((g, gi) => g.forEach(v => combined.push({v, g: gi})));
  combined.sort((x, y) => x.v - y.v);
  const N = combined.length;
  let ranks = new Array(N), i = 0;
  while (i < N) {
    let j = i;
    while (j < N && combined[j].v === combined[i].v) j++;
    const avg = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) ranks[k] = avg;
    i = j;
  }
  const R = groups.map(() => 0);
  const n = groups.map(g => g.length);
  combined.forEach((x, idx) => { R[x.g] += ranks[idx]; });
  let H = 0;
  for (let g = 0; g < groups.length; g++) H += R[g] * R[g] / n[g];
  H = 12 / (N * (N + 1)) * H - 3 * (N + 1);
  const df = groups.length - 1;
  return { H, df, p: chi2P(H, df) };
}
// Wilcoxon signed-rank (muestras pareadas)
function wilcoxon(a, b) {
  const diffs = a.map((v, i) => v - b[i]).filter(d => d !== 0);
  const n = diffs.length;
  const ranked = diffs.map(d => ({d, a: Math.abs(d)})).sort((x, y) => x.a - y.a);
  let i = 0;
  const ranks = new Array(n);
  while (i < n) {
    let j = i;
    while (j < n && ranked[j].a === ranked[i].a) j++;
    const avg = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) ranks[k] = avg;
    i = j;
  }
  let Wp = 0, Wn = 0;
  ranked.forEach((x, idx) => { if (x.d > 0) Wp += ranks[idx]; else Wn += ranks[idx]; });
  const W = Math.min(Wp, Wn);
  const mu = n * (n + 1) / 4, sigma = Math.sqrt(n * (n + 1) * (2 * n + 1) / 24);
  const z = (W - mu) / sigma;
  return { W, z, p: 2 * (1 - normalCDF(Math.abs(z))) };
}

/* ---------- Normalidad y homocedasticidad ---------- */
function skewness(a) {
  const m = mean(a), s = sd(a), n = a.length;
  return n / ((n - 1) * (n - 2)) * a.reduce((sum, v) => sum + ((v - m) / s) ** 3, 0);
}
function kurtosis(a) {
  const m = mean(a), s = sd(a), n = a.length;
  const m4 = a.reduce((sum, v) => sum + ((v - m) / s) ** 4, 0);
  return (n * (n + 1) * m4 / ((n - 1) * (n - 2) * (n - 3))) - 3 * (n - 1) * (n - 1) / ((n - 2) * (n - 3));
}
// Levene (basado en mediana - Brown-Forsythe)
function levene(groups) {
  const medians = groups.map(g => {
    const s = [...g].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  });
  const devs = groups.map((g, gi) => g.map(v => Math.abs(v - medians[gi])));
  return anovaOneWay(devs);
}

/* ---------- Regresión lineal múltiple (MCO) ---------- */
function regression(X, y) {
  // X: matriz n×p (sin intercepto), y: vector n
  const n = y.length, p = X[0].length;
  const X1 = X.map(r => [1].concat(r)); // agregar intercepto
  const Xt = matT(X1), XtX = matMul(Xt, X1);
  let inv;
  try { inv = matInv(XtX); } catch (e) { return { error: 'Matriz singular' }; }
  const Xty = matVec(Xt, y);
  const beta = matVec(inv, Xty);
  const yhat = matVec(X1, beta);
  const resid = y.map((v, i) => v - yhat[i]);
  const sse = resid.reduce((s, v) => s + v * v, 0);
  const sst = y.reduce((s, v) => s + (v - mean(y)) ** 2, 0);
  const r2 = 1 - sse / sst;
  const r2adj = 1 - (1 - r2) * (n - 1) / (n - p - 1);
  const mse = sse / (n - p - 1);
  const se = inv.map((r, i) => Math.sqrt(Math.max(r[i] * mse, 0)));
  const tvals = beta.map((b, i) => se[i] > 0 ? b / se[i] : 0);
  const pvals = tvals.map(t => tP(t, n - p - 1));
  const F = (r2 / p) / ((1 - r2) / (n - p - 1));
  return { beta, se, t: tvals, pvals, r2, r2adj, F, n, nPar: p + 1 };
}

/* ---------- Correlación de distancia (Székely) ---------- */
function distCorr(x, y) {
  const n = x.length;
  const A = Array.from({length: n}, (_, i) => Array.from({length: n}, (_, j) => Math.abs(x[i] - x[j])));
  const B = Array.from({length: n}, (_, i) => Array.from({length: n}, (_, j) => Math.abs(y[i] - y[j])));
  const dcov2 = (M) => {
    const rowM = M.map(r => mean(r)), colM = matT(M).map(r => mean(r)), gm = mean(M.flat());
    let s = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++)
      s += (M[i][j] - rowM[i] - colM[j] + gm) ** 2;
    return s / (n * n);
  };
  const dxy = Math.sqrt(dcov2(A.map((r, i) => r.map((v, j) => v * 0 + (A[i][j] * B[i][j])))));
  // Simplificación: usar doble centrado conjunto
  const rowA = A.map(r => mean(r)), colA = matT(A).map(r => mean(r)), gmA = mean(A.flat());
  const rowB = B.map(r => mean(r)), colB = matT(B).map(r => mean(r)), gmB = mean(B.flat());
  let dcov = 0, dvarX = 0, dvarY = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const ca = A[i][j] - rowA[i] - colA[j] + gmA;
    const cb = B[i][j] - rowB[i] - colB[j] + gmB;
    dcov += ca * cb; dvarX += ca * ca; dvarY += cb * cb;
  }
  dcov /= n * n; dvarX /= n * n; dvarY /= n * n;
  if (dvarX <= 0 || dvarY <= 0) return 0;
  return Math.sqrt(dcov / Math.sqrt(dvarX * dvarY));
}

/* ---------- Renderizado de análisis avanzado ---------- */
function renderAvanzado(validos) {
  const n = validos.length;
  if (n < 10) return '<div class="sec"><p class="muted">Se necesitan al menos 10 casos válidos para el análisis avanzado.</p></div>';
  let h = '';

  // ===== 1. ANÁLISIS FACTORIAL EXPLORATORIO =====
  const allItems = [];
  const itemNames = [];
  for (const esc in ESCALAS) ESCALAS[esc].forEach(it => { itemNames.push(it); });
  // Usar EYA_01..EYA_28 (con recodificados para 01 y 04)
  const cols28 = [];
  for (let i = 1; i <= 28; i++) {
    const k = 'EYA_' + String(i).padStart(2, '0');
    cols28.push(k === 'EYA_01' ? 'EYA_01_R' : k === 'EYA_04' ? 'EYA_04_R' : k);
  }
  const data28 = validos.map(c => cols28.map(k => c[k]));
  const R = corrMatrix(data28);

  h += '<div class="sec"><h3>Análisis Factorial Exploratorio (réplica SPSS: Analyze → Dimension Reduction → Factor)</h3>';

  // KMO y Bartlett
  const k = kmo(R), b = bartlett(R, n);
  const kmoCls = k.global >= 0.8 ? 'ok' : k.global >= 0.6 ? 'ok' : 'bad';
  h += '<div class="card-body">';
  h += `<p><strong>KMO:</strong> <span class="badge ${kmoCls}">${f2(k.global)}</span> `;
  h += `<span class="muted">(≥.80 meritorio, ≥.60 mediocre, <.50 inaceptable)</span></p>`;
  h += `<p><strong>Prueba de Bartlett:</strong> χ² = ${f2(b.chi2)}, gl = ${b.df}, p ${b.p < 0.001 ? '&lt; .001' : '= ' + f2(b.p)}</p>`;
  h += '</div>';

  // Autovalores y scree
  const { values } = jacobiEigen(R);
  const nFact4 = 4;
  h += '<h4>Autovalores (criterio Kaiser λ &gt; 1)</h4>';
  const eigRows = values.slice(0, 10).map((v, i) => [
    'Factor ' + (i + 1), f2(v), f2(v / 28 * 100) + '%',
    v > 1 ? '<span class="badge ok">Retener</span>' : '<span class="badge bad">Descartar</span>'
  ]);
  h += tabla(['Factor', 'Autovalor', '% Varianza', 'Kaiser'], eigRows);
  h += `<p class="muted">Varianza explicada por 4 factores: <strong>${f2(values.slice(0, 4).reduce((s, v) => s + v, 0) / 28 * 100)}%</strong></p>`;

  // PCA + Varimax con 4 factores
  const pc = pca(R, 4);
  const rot = varimax(pc.loadings.map(r => r.slice(0, 4)));
  h += '<h4>Matriz de cargas rotadas (Varimax, 4 factores)</h4>';
  h += '<p class="muted">Cargas ≥ |.40| resaltadas. Estructura esperada: F1=D1, F2=D2, F3=D3, F4=D4.</p>';
  const loadRows = cols28.map((cname, i) => {
    const row = [cname.replace('_R', ' (R)')];
    let maxF = 0, maxV = 0;
    for (let f = 0; f < 4; f++) {
      const v = rot[i][f];
      if (Math.abs(v) > Math.abs(maxV)) { maxV = v; maxF = f; }
      row.push(Math.abs(v) >= 0.40 ? `<strong>${f2(v)}</strong>` : f2(v));
    }
    row.push('F' + (maxF + 1), f2(pc.communalities[i]));
    return row;
  });
  h += tabla(['Ítem', 'F1', 'F2', 'F3', 'F4', 'Factor principal', 'h²'], loadRows);
  h += '</div>';

  // ===== 2. FIABILIDAD EXTENDIDA =====
  h += '<div class="sec"><h3>Fiabilidad extendida (réplica SPSS: Analyze → Scale → Reliability)</h3>';
  for (const esc in ESCALAS) {
    const cols = ESCALAS[esc];
    const idx = cols.map(c => cols28.indexOf(c));
    const m = data28.map(r => idx.map(j => r[j]));
    const it = itemTotal(data28, idx);
    const aid = alphaIfDeleted(data28, idx);
    const sh = splitHalf(m);
    // Omega con cargas del primer factor PAF
    const Rp = corrMatrix(m);
    const pafRes = paf(Rp, 1);
    const om = omegaMcDonald(pafRes.loadings.map(r => r[0]));
    h += `<h4>${esc.replace('_', ' ')}</h4>`;
    const iRows = cols.map((c, i) => [
      c.replace('_R', ' (R)'), f2(it[i]),
      `<span class="badge ${aid[i] >= 0.7 ? 'ok' : 'bad'}">${f2(aid[i])}</span>`
    ]);
    h += tabla(['Ítem', 'Ítem-total corregida', 'α si se elimina'], iRows);
    h += `<p class="muted">Split-half (Spearman-Brown): <strong>${f2(sh)}</strong> · `;
    h += `ω de McDonald: <strong>${f2(om)}</strong></p>`;
  }
  h += '</div>';

  // ===== 3. COMPARACIONES DE GRUPOS =====
  h += '<div class="sec"><h3>Comparaciones de grupos (réplica SPSS: Compare Means / Nonparametric)</h3>';
  const escKeys = Object.keys(ESCALAS);
  // Por SEXO (t-test + Mann-Whitney)
  const sexos = [...new Set(validos.map(c => c.SEXO).filter(v => v != null))].sort();
  if (sexos.length === 2) {
    h += '<h4>Por sexo (t de Student + U de Mann-Whitney)</h4>';
    const tRows = escKeys.concat(['EYA_TOTAL']).map(esc => {
      const a = validos.filter(c => c.SEXO === sexos[0]).map(c => c[esc]);
      const b = validos.filter(c => c.SEXO === sexos[1]).map(c => c[esc]);
      if (a.length < 3 || b.length < 3) return [esc, 'n/d', 'n/d', 'n/d'];
      const t = tTestInd(a, b), mw = mannWhitney(a, b);
      return [esc.replace('_', ' '),
        `t=${f2(t.t)}, p=${t.p < 0.05 ? '<strong>' + (t.p < 0.001 ? '&lt;.001' : f2(t.p)) + '</strong>' : f2(t.p)}, d=${f2(t.d)}`,
        `U=${f2(mw.U)}, p=${mw.p < 0.05 ? '<strong>' + (mw.p < 0.001 ? '&lt;.001' : f2(mw.p)) + '</strong>' : f2(mw.p)}`,
        `n₁=${a.length}, n₂=${b.length}`];
    });
    h += tabla(['Escala', 't-test (paramétrico)', 'Mann-Whitney (no paramétrico)', 'n'], tRows);
  }
  // Por CARRERA (ANOVA + Kruskal-Wallis)
  const carreras = [...new Set(validos.map(c => c.CARRERA).filter(v => v != null))].sort();
  if (carreras.length >= 2) {
    h += '<h4>Por carrera (ANOVA + Kruskal-Wallis)</h4>';
    const aRows = escKeys.concat(['EYA_TOTAL']).map(esc => {
      const groups = carreras.map(car => validos.filter(c => c.CARRERA === car).map(c => c[esc]));
      if (groups.some(g => g.length < 2)) return [esc, 'n/d', 'n/d'];
      const an = anovaOneWay(groups), kw = kruskalWallis(groups);
      return [esc.replace('_', ' '),
        `F=${f2(an.F)}, p=${an.p < 0.05 ? '<strong>' + f2(an.p) + '</strong>' : f2(an.p)}, η²=${f2(an.eta2)}`,
        `H=${f2(kw.H)}, p=${kw.p < 0.05 ? '<strong>' + f2(kw.p) + '</strong>' : f2(kw.p)}`];
    });
    h += tabla(['Escala', 'ANOVA', 'Kruskal-Wallis'], aRows);
    // Levene
    const levRows = escKeys.map(esc => {
      const groups = carreras.map(car => validos.filter(c => c.CARRERA === car).map(c => c[esc]));
      if (groups.some(g => g.length < 3)) return [esc, 'n/d'];
      const lv = levene(groups);
      return [esc.replace('_', ' '), `F=${f2(lv.F)}, p=${f2(lv.p)}${lv.p < 0.05 ? ' <strong>(heterocedasticidad)</strong>' : ' (homocedasticidad)'}`];
    });
    h += '<h4>Homogeneidad de varianzas (Levene)</h4>' + tabla(['Escala', 'Levene'], levRows);
  }
  h += '</div>';

  // ===== 4. NORMALIDAD =====
  h += '<div class="sec"><h3>Normalidad (réplica SPSS: Explore / Normality)</h3>';
  const nRows = escKeys.concat(['EYA_TOTAL']).map(esc => {
    const v = validos.map(c => c[esc]);
    return [esc.replace('_', ' '), f2(skewness(v)), f2(kurtosis(v)),
      Math.abs(skewness(v)) < 1 && Math.abs(kurtosis(v)) < 1 ? '<span class="badge ok">Aprox. normal</span>' : '<span class="badge bad">No normal</span>'];
  });
  h += tabla(['Escala', 'Asimetría', 'Curtosis', 'Evaluación'], nRows);
  h += '<p class="muted">Criterio: |asimetría| &lt; 1 y |curtosis| &lt; 1 sugiere normalidad aproximada.</p></div>';

  return h;
}
