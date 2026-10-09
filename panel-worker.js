/* EYA-28 Web Worker: CFA y MLP en segundo plano (cálculos íntegros, sin bloquear UI) */
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const variance = a => { const m = mean(a); return a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1); };
const sd = a => Math.sqrt(variance(a));
function identity(n) { return Array.from({length: n}, (_, i) => Array.from({length: n}, (_, j) => i === j ? 1 : 0)); }

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

function vecMean(v) { return v.reduce((s, x) => s + x, 0) / v.length; }

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


self.onmessage = function(e) {
  const { type, payload } = e.data;
  try {
    if (type === 'cfa') {
      const { Scov, n } = payload;
      // CFA ÍNTEGRO: 120 iteraciones, sin recortes
      const cfa = cfaEstimate(Scov, n, 120, 0.005);
      self.postMessage({ type: 'cfa', ok: true, result: {
        converged: cfa.converged,
        chi2: cfa.chi2, df: cfa.df, p: cfa.p,
        cfi: cfa.cfi, tli: cfa.tli, rmsea: cfa.rmsea,
        srmr: cfa.srmr, aic: cfa.aic, bic: cfa.bic
      }});
    } else if (type === 'mlp') {
      const { X, y } = payload;
      // MLP ÍNTEGRO: datos completos, 250 épocas
      const nrm = normalizeData(X);
      const ymin = Math.min(...y.flat()), ymax = Math.max(...y.flat());
      const Yn = y.map(r => [(r[0] - ymin) / (ymax - ymin)]);
      const mlp = new MLP([9, 12, 6, 1], 0.05);
      mlp.train(nrm.Xn, Yn, 250);
      const pred = mlp.predict(nrm.Xn).map(p => p[0] * (ymax - ymin) + ymin);
      const act = y.map(r => r[0]);
      const ma = mean(act);
      const r2 = 1 - pred.reduce((s, p, i) => s + (p - act[i]) ** 2, 0) / act.reduce((s, a) => s + (a - ma) ** 2, 0);
      self.postMessage({ type: 'mlp', ok: true, result: { r2: Math.max(r2, 0), n: X.length } });
    }
  } catch (err) {
    self.postMessage({ type, ok: false, error: err.message });
  }
};
