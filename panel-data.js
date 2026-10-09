/* EYA-28 · Gestión y preparación de datos · réplica SPSS (Datos/Transformar) */
'use strict';
/* ================================================================
   Réplica de IBM SPSS Statistics v32:
   - Transform > Recode into Different Variables .... recode()
   - Transform > Compute Variable .................. computeVar()
   - Data > Split File ............................. splitFile()
   - Data > Merge Files > Add Cases ................ mergeCases()
   - Data > Merge Files > Add Variables ............ mergeVars()
   - Data > Select Cases ........................... selectCases()
   - Data > Sort Cases ............................. sortCases()
   ================================================================ */

/* ---------- Recodificar: agrupa valores en rangos/categorías ----------
   Ejemplo: recode(data,'EDAD',[[17,25,'18-25'],[26,35,'26-35']],'EDAD_G') */
function recode(data, varName, rules, newName) {
  // rules: [[min,max,etiqueta],...] o [[valorExacto, etiqueta],...]
  return data.map(row => {
    const v = row[varName];
    let nv = null;
    for (const r of rules) {
      if (r.length === 3 && v >= r[0] && v <= r[1]) { nv = r[2]; break; }
      if (r.length === 2 && v === r[0]) { nv = r[1]; break; }
    }
    return Object.assign({}, row, { [newName || (varName + '_R')]: nv });
  });
}

/* ---------- Calcular variable: aplica fórmula a cada fila ----------
   computeVar(data, 'IMC', row => row.PESO / (row.TALLA ** 2)) */
function computeVar(data, newName, fn) {
  return data.map(row => {
    let v = null;
    try { v = fn(row); } catch (e) { v = null; }
    if (typeof v === 'number' && !isFinite(v)) v = null;
    return Object.assign({}, row, { [newName]: v });
  });
}

/* ---------- Segmentar archivo: agrupa casos por variable ----------
   Retorna {valor: [casos]} para análisis por separado (Split File) */
function splitFile(data, varName) {
  const groups = {};
  data.forEach(row => {
    const k = row[varName] == null ? '(perdido)' : String(row[varName]);
    (groups[k] = groups[k] || []).push(row);
  });
  return groups;
}

/* ---------- Fusionar: añadir casos (filas) ---------- */
function mergeCases(a, b) {
  return a.concat(b);
}

/* ---------- Fusionar: añadir variables (columnas) por clave ---------- */
function mergeVars(a, b, key) {
  const idx = {};
  b.forEach(row => { idx[row[key]] = row; });
  return a.map(row => Object.assign({}, idx[row[key]] || {}, row));
}

/* ---------- Seleccionar casos por condición ---------- */
function selectCases(data, fn) {
  return data.filter(fn);
}

/* ---------- Ordenar casos ---------- */
function sortCases(data, varName, desc) {
  return data.slice().sort((a, b) => {
    const x = a[varName], y = b[varName];
    if (x == null) return 1; if (y == null) return -1;
    return desc ? y - x : x - y;
  });
}

/* ---------- Resumen de valores perdidos por variable ---------- */
function missingSummary(data, vars) {
  return vars.map(v => {
    const miss = data.filter(r => r[v] == null || r[v] === '').length;
    return { variable: v, n: data.length, perdidos: miss, pct: data.length ? miss / data.length * 100 : 0 };
  });
}
