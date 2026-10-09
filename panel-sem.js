/* EYA-28 · CFA/SEM simplificado + Red Neuronal + Bayesiano · JS vanilla */
'use strict';
/* ================================================================
   1. CFA: Análisis Factorial Confirmatorio por Máxima Verosimilitud
      - Modelo de 4 factores correlacionados (D1-D4)
      - Estimación ML por descenso de gradiente
      - Índices: χ², gl, CFI, TLI, RMSEA, SRMR
   2. MLP: Red neuronal perceptrón multicapa (backprop)
      - Predicción de EYA_TOTAL y clasificación de riesgo
   3. Bayes: Factor de Bayes para t-test (aprox. BIC) y correlación
   ================================================================ */

/* ---------- Utilidades ---------- */
function vecMean(v) { return v.reduce((s, x) => s + x, 0) / v.length; }
function outer(a, b) { return a.map(x => b.map(y => x * y)); }

/* ================================================================
   1. CFA POR MÁXIMA VEROSIMILITUD
   ================================================================ */
const CFA_MODEL = {
  // Mapeo ítem -> factor (0=D1, 1=D2, 2=D3, 3=D4), usando índices 0-26 (sin IMC)
  // Orden: EYA_01..EYA_14, EYA_16..EYA_28 (27 ítems)
  factors: [
    [0,1,2,3,4,5,6],           // D1: EYA_01-07
    [7,8,9,10,11,12,13],       // D2: EYA_08-14
    [14,15,16,17,18,19],       // D3: EYA_16-21
    [20,21,22,23,24,25,26]     // D4: EYA_22-28
  ],
  nFactors: 4
};

function cfaImplied(theta, p, nf, pattern) {
  // theta: [loadings (p), factorCorrs (nf*(nf-1)/2), errors (p)]
  // Construye Σ(θ) = ΛΦΛ' + Ψ
  const loadings = theta.slice(0, p);
  const nCorr = nf * (nf - 1) / 2;
  const corrs = theta.slice(p, p + nCorr);
  const errors = theta.slice(p + nCorr, p + nCorr + p);

  // Matriz Phi (correlaciones factoriales)
  const Phi = identity(nf);
  let ci = 0;
  for (let i = 0; i < nf; i++) for (let j = i + 1; j < nf; j++) {
    const r = Math.max(-0.95, Math.min(0.95, corrs[ci++]));
    Phi[i][j] = Phi[j][i] = r;
  }
  // Matriz Lambda (p × nf)
  const Lambda = Array.from({length: p}, () => new Array(nf).fill(0));
  pattern.factors.forEach((items, f) => {
    items.forEach((itemIdx, k) => {
      // Primer ítem de cada factor fijo en 1 (identificación)
      Lambda[itemIdx][f] = k === 0 ? 1 : Math.max(0.1, loadings[itemIdx]);
    });
  });
  // Σ = ΛΦΛ' + Ψ
  const LP = matMul(Lambda, Phi);
  const LPL = matMul(LP, matT(Lambda));
  for (let i = 0; i < p; i++) LPL[i][i] += Math.max(errors[i], 0.05);
  return LPL;
}

function cfaFitML(theta, S, p, nf, pattern, n) {
  const Sigma = cfaImplied(theta, p, nf, pattern);
  const detS = Math.abs(matDet(S)) || 1e-10;
  const detSig = Math.abs(matDet(Sigma)) || 1e-10;
  let invSig;
  try { invSig = matInv(Sigma); } catch (e) { return 1e10; }
  const tr = matMul(S, invSig).reduce((s, r, i) => s + r[i], 0);
  const F = Math.log(detSig) + tr - Math.log(detS) - p;
  return isNaN(F) || !isFinite(F) ? 1e10 : Math.max(F, 0);
}

function cfaEstimate(S, n, maxIter = 300, lr = 0.01) {
  const p = S.length, nf = 4, pattern = CFA_MODEL;
  const nLoad = p, nCorr = 6, nErr = p;
  const nPar = nLoad + nCorr + nErr;
  // Inicialización
  let theta = [];
  for (let i = 0; i < p; i++) theta.push(0.7);           // loadings
  for (let i = 0; i < nCorr; i++) theta.push(0.3);       // correlaciones
  for (let i = 0; i < p; i++) theta.push(0.5);           // errores
  // Fijar primer loading de cada factor (no se optimiza, se mantiene en 1)
  const fixedIdx = new Set();
  pattern.factors.forEach(items => {
    // El primer ítem usa loading=1 fijo; encontramos su índice en theta
    fixedIdx.add(items[0]);
  });

  const h = 1e-6;
  let prevF = Infinity;
  for (let iter = 0; iter < maxIter; iter++) {
    const F0 = cfaFitML(theta, S, p, nf, pattern, n);
    // Gradiente numérico
    const grad = new Array(nPar).fill(0);
    for (let j = 0; j < nPar; j++) {
      if (fixedIdx.has(j)) continue;
      // No optimizar errores por debajo de 0.05
      const tj = theta[j];
      theta[j] = tj + h;
      const Fp = cfaFitML(theta, S, p, nf, pattern, n);
      theta[j] = tj - h;
      const Fm = cfaFitML(theta, S, p, nf, pattern, n);
      theta[j] = tj;
      grad[j] = (Fp - Fm) / (2 * h);
    }
    // Actualizar
    for (let j = 0; j < nPar; j++) {
      if (fixedIdx.has(j)) continue;
      theta[j] -= lr * grad[j];
      // Restricciones
      if (j >= p && j < p + nCorr) theta[j] = Math.max(-0.95, Math.min(0.95, theta[j]));
      if (j >= p + nCorr) theta[j] = Math.max(0.05, Math.min(2, theta[j]));
      if (j < p) theta[j] = Math.max(0.1, Math.min(2, theta[j]));
    }
    if (Math.abs(prevF - F0) < 1e-8) break;
    prevF = F0;
    if (iter % 50 === 0) lr *= 0.9; // decaimiento
  }
  const Fmin = cfaFitML(theta, S, p, nf, pattern, n);
  const chi2 = (n - 1) * Fmin;
  // gl = p(p+1)/2 - parámetros libres
  const nFree = nPar - fixedIdx.size;
  const df = p * (p + 1) / 2 - nFree;

  // Modelo nulo (independencia) para CFI/TLI
  const diagS = S.map((r, i) => r[i]);
  let chi2Null = 0;
  // χ² nulo ≈ (n-1) * ΣΣ r²ᵢⱼ (aprox)
  for (let i = 0; i < p; i++) for (let j = i + 1; j < p; j++) {
    chi2Null += (S[i][j] / Math.sqrt(diagS[i] * diagS[j])) ** 2;
  }
  chi2Null *= (n - 1);
  const dfNull = p * (p - 1) / 2;

  const cfi = 1 - Math.max(chi2 - df, 0) / Math.max(chi2Null - dfNull, 1);
  const tli = (chi2Null / dfNull - chi2 / df) / (chi2Null / dfNull - 1);
  const rmsea = Math.sqrt(Math.max(chi2 - df, 0) / (df * (n - 1)));

  // SRMR
  const Sigma = cfaImplied(theta, p, nf, pattern);
  let srmrSum = 0, cnt = 0;
  for (let i = 0; i < p; i++) for (let j = 0; j <= i; j++) {
    const sd_i = Math.sqrt(diagS[i]), sd_j = Math.sqrt(diagS[j]);
    const rObs = S[i][j] / (sd_i * sd_j);
    const rImp = Sigma[i][j] / (Math.sqrt(Sigma[i][i]) * Math.sqrt(Sigma[j][j]));
    srmrSum += (rObs - rImp) ** 2; cnt++;
  }
  const srmr = Math.sqrt(srmrSum / cnt);

  // Cargas estandarizadas
  const stdLoadings = [];
  pattern.factors.forEach((items, f) => {
    items.forEach((itemIdx, k) => {
      const raw = k === 0 ? 1 : theta[itemIdx];
      const std = raw * 1 / Math.sqrt(Sigma[itemIdx][itemIdx] / diagS[itemIdx] * diagS[itemIdx]);
      // Simplificación: carga estandarizada ≈ raw * sqrt(var_factor) / sd_item
      stdLoadings.push({ item: itemIdx, factor: f, loading: Math.min(Math.abs(raw / Math.sqrt(diagS[itemIdx])) * 1, 1) * Math.sign(raw) });
    });
  });

  return {
    chi2, df, p: chi2P(chi2, df),
    cfi: Math.max(0, Math.min(1, cfi)),
    tli: Math.max(0, Math.min(1, tli)),
    rmsea: Math.min(rmsea, 1),
    srmr,
    loadings: theta.slice(0, p),
    factorCorrs: theta.slice(p, p + nCorr),
    converged: Fmin < 1e9
  };
}

/* ================================================================
   2. RED NEURONAL MLP (perceptrón multicapa con backpropagation)
   ================================================================ */
class MLP {
  constructor(layers, lr = 0.01) {
    this.layers = layers; this.lr = lr;
    this.W = []; this.b = [];
    for (let l = 0; l < layers.length - 1; l++) {
      const fanIn = layers[l], fanOut = layers[l + 1];
      const scale = Math.sqrt(2 / fanIn);
      this.W.push(Array.from({length: fanOut}, () =>
        Array.from({length: fanIn}, () => (Math.random() * 2 - 1) * scale)));
      this.b.push(new Array(fanOut).fill(0));
    }
  }
  relu(x) { return x.map(v => Math.max(0, v)); }
  dRelu(x) { return x.map(v => v > 0 ? 1 : 0); }
  sigmoid(x) { return x.map(v => 1 / (1 + Math.exp(-v))); }

  forward(x) {
    let a = x;
    this.activations = [a]; this.zs = [];
    for (let l = 0; l < this.W.length; l++) {
      const z = this.W[l].map((w, i) => w.reduce((s, wij, j) => s + wij * a[j], 0) + this.b[l][i]);
      this.zs.push(z);
      a = l === this.W.length - 1 ? this.sigmoid(z) : this.relu(z);
      this.activations.push(a);
    }
    return a;
  }
  train(X, Y, epochs = 200) {
    const n = X.length;
    for (let ep = 0; ep < epochs; ep++) {
      let loss = 0;
      for (let i = 0; i < n; i++) {
        const out = this.forward(X[i]);
        const target = Y[i];
        loss += target.reduce((s, t, k) => s + (t - out[k]) ** 2, 0);
        // Backprop
        let delta = out.map((o, k) => 2 * (o - target[k]) * o * (1 - o));
        for (let l = this.W.length - 1; l >= 0; l--) {
          const aPrev = this.activations[l];
          // Gradientes
          for (let j = 0; j < this.W[l].length; j++) {
            for (let k = 0; k < this.W[l][j].length; k++) {
              this.W[l][j][k] -= this.lr * delta[j] * aPrev[k];
            }
            this.b[l][j] -= this.lr * delta[j];
          }
          if (l > 0) {
            const zPrev = this.zs[l - 1];
            const dAct = this.dRelu(zPrev);
            const newDelta = new Array(aPrev.length).fill(0);
            for (let k = 0; k < aPrev.length; k++) {
              for (let j = 0; j < delta.length; j++) newDelta[k] += delta[j] * this.W[l][j][k];
              newDelta[k] *= dAct[k];
            }
            delta = newDelta;
          }
        }
      }
      if (ep % 50 === 0 && loss / n > 10) this.lr *= 0.5;
    }
  }
  predict(X) { return X.map(x => this.forward(x)); }
}

/* Normalización min-max */
function normalizeData(X) {
  const p = X[0].length;
  const mins = [], maxs = [];
  for (let j = 0; j < p; j++) {
    const col = X.map(r => r[j]);
    mins.push(Math.min(...col)); maxs.push(Math.max(...col));
  }
  const Xn = X.map(r => r.map((v, j) => maxs[j] > mins[j] ? (v - mins[j]) / (maxs[j] - mins[j]) : 0.5));
  return { Xn, mins, maxs };
}

/* ================================================================
   3. MÉTODOS BAYESIANOS
   ================================================================ */
// Factor de Bayes para correlación (aprox. via BIC)
function bayesFactorCorr(r, n) {
  // H0: rho=0 vs H1: rho≠0
  // BF10 ≈ exp((BIC0 - BIC1)/2)
  if (Math.abs(r) >= 1) return Infinity;
  const ll1 = -(n / 2) * Math.log(1 - r * r);
  const bic0 = 0; // modelo nulo
  const bic1 = -2 * ll1 + 1 * Math.log(n);
  const bf10 = Math.exp((bic0 - bic1) / 2);
  return bf10;
}
function interpretBF(bf) {
  if (bf > 100) return 'Evidencia extrema a favor de H1';
  if (bf > 30) return 'Evidencia muy fuerte a favor de H1';
  if (bf > 10) return 'Evidencia fuerte a favor de H1';
  if (bf > 3) return 'Evidencia moderada a favor de H1';
  if (bf > 1) return 'Evidencia anecdótica a favor de H1';
  if (bf > 1/3) return 'Evidencia anecdótica a favor de H0';
  if (bf > 1/10) return 'Evidencia moderada a favor de H0';
  return 'Evidencia fuerte a favor de H0';
}
// Intervalo creíble bayesiano para la media (aprox. normal)
function bayesCredibleMean(x, cred = 0.95) {
  const m = vecMean(x), s = Math.sqrt(variance(x)), n = x.length;
  const z = cred === 0.95 ? 1.96 : cred === 0.99 ? 2.576 : 1.645;
  const se = s / Math.sqrt(n);
  return { mean: m, lower: m - z * se, upper: m + z * se, cred };
}

/* ================================================================
   4. IMPUTACIÓN MÚLTIPLE SIMPLIFICADA (media + ruido)
   ================================================================ */
function imputeMissing(data, m = 5) {
  // data: matriz con null/NaN; retorna m datasets imputados
  const p = data[0].length;
  const colStats = [];
  for (let j = 0; j < p; j++) {
    const vals = data.map(r => r[j]).filter(v => v != null && !isNaN(v));
    colStats.push({ mean: vecMean(vals), sd: Math.sqrt(variance(vals)) || 1 });
  }
  const datasets = [];
  for (let k = 0; k < m; k++) {
    datasets.push(data.map(r => r.map((v, j) => {
      if (v == null || isNaN(v)) {
        // Imputación estocástica: media + ruido normal
        const u1 = Math.random(), u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return Math.round(Math.max(1, Math.min(5, colStats[j].mean + z * colStats[j].sd * 0.5)));
      }
      return v;
    })));
  }
  return datasets;
}
// Reglas de Rubin para combinar estimaciones
function rubinCombine(estimates) {
  // estimates: array de {est, var} por imputación
  const m = estimates.length;
  const qbar = vecMean(estimates.map(e => e.est));
  const ubar = vecMean(estimates.map(e => e.var));
  const b = estimates.reduce((s, e) => s + (e.est - qbar) ** 2, 0) / (m - 1);
  const T = ubar + (1 + 1 / m) * b;
  return { est: qbar, var: T, se: Math.sqrt(T) };
}

/* ---------- Renderizado SEM/Bayes/MLP ---------- */
function renderSEM(validos) {
  const n = validos.length;
  if (n < 30) return '<div class="sec"><p class="muted">Se necesitan al menos 30 casos válidos para CFA/SEM.</p></div>';
  let h = '';

  // Preparar datos
  const cols27 = [];
  for (let i = 1; i <= 28; i++) {
    if (i === 15) continue;
    const k = 'EYA_' + String(i).padStart(2, '0');
    cols27.push(k === 'EYA_01' ? 'EYA_01_R' : k === 'EYA_04' ? 'EYA_04_R' : k);
  }
  const data27 = validos.map(c => cols27.map(k => c[k]));

  // ===== CFA =====
  h += '<div class="sec"><h3>Análisis Factorial Confirmatorio (réplica AMOS/SEM)</h3>';
  h += '<p class="muted">Modelo: 4 factores correlacionados (D1–D4). Estimación por Máxima Verosimilitud. Puede tardar ~30 segundos.</p>';
  h += '<div class="card-body" id="cfa-status"><p class="muted">Calculando CFA automáticamente…</p></div>';
  h += '<div id="cfa-result"></div></div>';

  // ===== RED NEURONAL =====
  h += '<div class="sec"><h3>Red Neuronal — Predicción (MLP)</h3>';
  h += '<p class="muted">Perceptrón multicapa [9 → 12 → 6 → 1] con backpropagation. Predice EYA_TOTAL desde demográficos + subescalas.</p>';
  h += '<div class="card-body" id="mlp-status"><p class="muted">Entrenando red automáticamente…</p></div><div id="mlp-result"></div></div>';

  // ===== BAYESIANO =====
  h += '<div class="sec"><h3>Análisis Bayesiano (Factor de Bayes)</h3>';
  const escKeys = ['D1_COGNITIVA', 'D2_AFECTIVA', 'D3_CONDUCTUAL', 'D4_IDENTITARIA'];
  const bRows = [];
  for (let i = 0; i < escKeys.length; i++) for (let j = i + 1; j < escKeys.length; j++) {
    const a = validos.map(c => c[escKeys[i]]), b = validos.map(c => c[escKeys[j]]);
    const r = pearson(a, b);
    const bf = bayesFactorCorr(r, n);
    bRows.push([escKeys[i].replace('_', ' ') + ' × ' + escKeys[j].replace('_', ' '),
      f2(r), bf > 1000 ? bf.toExponential(1) : f2(bf), interpretBF(bf)]);
  }
  h += tabla(['Par', 'r', 'BF₁₀', 'Interpretación'], bRows);
  h += '<p class="muted">BF₁₀ &gt; 10: evidencia fuerte de correlación. Réplica de Bayesian Correlation en SPSS.</p></div>';

  // ===== IMPUTACIÓN =====
  h += '<div class="sec"><h3>Imputación múltiple (demostración)</h3>';
  h += '<p class="muted">Si hubiera valores perdidos, el sistema genera 5 datasets imputados (media + ruido) y combina con reglas de Rubin. Con datos completos no es necesario.</p></div>';

  return h;
}

// Ejecución automática de CFA y MLP tras el renderizado
if (typeof window !== 'undefined') {
  window.__cfaData = null;
  window.__runCfaMlp = function() {
    // CFA y MLP ÍNTEGROS vía Web Worker (no bloquean la interfaz)
    const validos = window.__cfaValid;
    if (!validos || !validos.length) return;
    const cols27 = [];
    for (let i = 1; i <= 28; i++) {
      if (i === 15) continue;
      const k = 'EYA_' + String(i).padStart(2, '0');
      cols27.push(k === 'EYA_01' ? 'EYA_01_R' : k === 'EYA_04' ? 'EYA_04_R' : k);
    }
    const data27 = validos.map(c => cols27.map(k => c[k]));
    const S = corrMatrix(data27);
    const vars = cols27.map((k, j) => variance(data27.map(r => r[j])));
    const Scov = S.map((r, i) => r.map((val, j) => val * Math.sqrt(vars[i] * vars[j])));
    const n = validos.length;

    const cs = document.getElementById('cfa-status');
    const ms = document.getElementById('mlp-status');
    if (cs) cs.innerHTML = '<p class="muted">Estimando modelo en segundo plano…</p>';
    if (ms) ms.innerHTML = '<p class="muted">Entrenando red en segundo plano…</p>';

    // Función para renderizar resultados CFA (compartida worker/fallback)
    function showCfa(cfa) {
      const cr = document.getElementById('cfa-result');
      if (cr) cr.innerHTML =
        `χ²(${cfa.df}) = <strong>${f2(cfa.chi2)}</strong>, p ${fmtP(cfa.p)}<br>` +
        `CFI = <strong>${f3(cfa.cfi)}</strong> · TLI = <strong>${f3(cfa.tli)}</strong><br>` +
        `RMSEA = <strong>${f3(cfa.rmsea)}</strong> · SRMR = <strong>${f3(cfa.srmr)}</strong><br>` +
        `<span class="muted">AIC = ${f1(cfa.aic)} · BIC = ${f1(cfa.bic)} · ${cfa.converged ? 'convergió' : 'límite de iteraciones'}</span>`;
      if (cs) cs.innerHTML = '<p class="muted">Modelo estimado (120 iteraciones, ML).</p>';
    }
    function showMlp(r2, nn) {
      const mr = document.getElementById('mlp-result');
      if (mr) mr.innerHTML =
        `R² = <strong>${f2(Math.max(r2, 0))}</strong> <span class="muted">(red [9→12→6→1], 250 épocas, n=${nn})</span>`;
      if (ms) ms.innerHTML = '<p class="muted">Red entrenada (datos completos).</p>';
    }

    try {
      const worker = new Worker('panel-worker.js');
      let done = 0;
      worker.onmessage = function(e) {
        const d = e.data;
        if (d.type === 'cfa' && d.ok) { showCfa(d.result); }
        else if (d.type === 'mlp' && d.ok) { showMlp(d.result.r2, d.result.n); }
        else {
          const el = document.getElementById(d.type === 'cfa' ? 'cfa-status' : 'mlp-status');
          if (el) el.innerHTML = '<p class="err">Error: ' + (d.error || 'desconocido') + '</p>';
        }
        if (++done >= 2) {
          worker.terminate();
          // Liberar memoria: limpiar referencia a datos
          window.__cfaValid = null;
          if (typeof gc === 'function') { try { gc(); } catch (e) {} }
        }
      };
      worker.onerror = function() {
        worker.terminate();
        fallbackMain();
      };
      worker.postMessage({ type: 'cfa', payload: { Scov, n } });
      worker.postMessage({ type: 'mlp', payload: {
        X: validos.map(c => [c.EDAD, c.SEXO, c.CARRERA, c.ANO_ACADEMICO, c.USO_IA_FREQ, c.D1_COGNITIVA, c.D2_AFECTIVA, c.D3_CONDUCTUAL, c.D4_IDENTITARIA]),
        y: validos.map(c => [c.EYA_TOTAL])
      }});
    } catch (err) {
      fallbackMain();
    }

    // Fallback: hilo principal con yields (si Worker no disponible)
    function fallbackMain() {
      setTimeout(function() {
        try {
          const cfa = cfaEstimate(Scov, n, 120, 0.005);
          showCfa(cfa);
        } catch (e) {
          if (cs) cs.innerHTML = '<p class="err">Error: ' + e.message + '</p>';
        }
      }, 100);
      setTimeout(function() {
        try {
          const X = validos.map(c => [c.EDAD, c.SEXO, c.CARRERA, c.ANO_ACADEMICO, c.USO_IA_FREQ, c.D1_COGNITIVA, c.D2_AFECTIVA, c.D3_CONDUCTUAL, c.D4_IDENTITARIA]);
          const y = validos.map(c => [c.EYA_TOTAL]);
          const nrm = normalizeData(X);
          const ymin = Math.min(...y.flat()), ymax = Math.max(...y.flat());
          const Yn = y.map(r => [(r[0] - ymin) / (ymax - ymin)]);
          const mlp = new MLP([9, 12, 6, 1], 0.05);
          mlp.train(nrm.Xn, Yn, 250);
          const pred = mlp.predict(nrm.Xn).map(p => p[0] * (ymax - ymin) + ymin);
          const act = y.map(r => r[0]);
          const r2 = 1 - pred.reduce((s, p, i) => s + (p - act[i]) ** 2, 0) / act.reduce((s, a) => s + (a - vecMean(act)) ** 2, 0);
          showMlp(r2, n);
        } catch (e) {
          if (ms) ms.innerHTML = '<p class="err">Error: ' + e.message + '</p>';
        }
      }, 500);
    }
  };
}
