/* EYA-28 · Vanilla JS · offline-first · anti-satisficing */
'use strict';
/* ============ CONFIG: URL del webhook (Google Apps Script) ============ */
const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbx0N00WlLdVciBRoMPld9qUAvcMuXZcoXRxVcSGLPUFIxlFpGAG0PJymTB69ZdP9bwl/exec';

/* ============ Banco de reactivos ============ */
const LIKERT = [
  ['1', 'Totalmente en\ndesacuerdo'], ['2', 'En\ndesacuerdo'], ['3', 'Ni de acuerdo\nni en desacuerdo'],
  ['4', 'De\nacuerdo'], ['5', 'Totalmente\nde acuerdo']
];
const MODULES = [
  { id: 'D1', title: 'Bloque 1 de 4 · Procesos de pensamiento',
    note: 'Ha completado la primera parte. Tómese un momento: las siguientes afirmaciones exploran sus procesos de pensamiento con estas herramientas.',
    items: [
      ['EYA_01', 'Cuando utilizo una IA para mis tareas, reviso críticamente sus respuestas antes de aceptarlas como válidas.'],
      ['EYA_02', 'Acudo directamente a la IA para que resuelva problemas complejos sin intentar pensarlos primero por mí mismo.'],
      ['EYA_03', 'Al entregar un trabajo redactado con ayuda de la IA, siento que domino el tema aunque solo haya evaluado el resultado final.'],
      ['EYA_04', 'Modifico las explicaciones que me da la IA para adaptarlas a mi propio criterio y razonamiento personal.'],
      ['EYA_05', 'Suelo pedirle a la IA que me resuma las lecturas obligatorias para evitar leer los textos completos.'],
      ['EYA_06', 'Siento que mi capacidad académica real es mayor cuando cuento con la asistencia de la IA que cuando trabajo solo.'],
      ['EYA_07', 'Si una tarea requiere razonamiento lógico o matemático extenso, prefiero que la IA plantee los pasos en lugar de deducirlos yo.']
    ]},
  { id: 'D2', title: 'Bloque 2 de 4 · Experiencias y emociones',
    note: 'Va por buen camino. Las siguientes afirmaciones exploran sus experiencias emocionales con estas herramientas.',
    items: [
      ['EYA_08', 'Durante un apagón o cuando no tengo conexión, experimento angustia o bloqueo mental al intentar avanzar en mis estudios.'],
      ['EYA_09', 'Consultar con la IA durante momentos de sobrecarga académica me produce una sensación de tranquilidad y acompañamiento.'],
      ['EYA_10', 'Me resulta frustrante e irritante tener que resolver tareas académicas de forma analógica tradicional (libros físicos o apuntes en papel).'],
      ['EYA_11', 'Sentir que dependo de la IA para cumplir con mis entregas universitarias me genera temor a quedar rezagado si la herramienta falla.'],
      ['EYA_12', 'Busco la confirmación de la IA para sentirme seguro del valor de mis ideas académicas.'],
      ['EYA_13', 'Pierdo la paciencia con facilidad cuando la IA comete errores lógicos o inventa información en sus respuestas.'],
      ['EYA_14', 'Ante una desconexión forzada de la red, suelo paralizar o posponer mis tareas hasta que regrese el servicio digital.']
    ]},
  { id: 'IMC', title: 'Verificación de pantalla',
    note: null,
    items: [
      ['EYA_15', 'Para verificar que la pantalla del formulario se visualiza correctamente en su dispositivo, seleccione en este ítem la opción "Totalmente en desacuerdo".']
    ]},
  { id: 'D3', title: 'Bloque 3 de 4 · Hábitos de estudio',
    note: 'Ya casi termina. Las siguientes afirmaciones indagan en sus hábitos y conductas de estudio con estas herramientas.',
    items: [
      ['EYA_16', 'Abrir el chat de la IA es el primer paso reflejo que realizo cada vez que me asignan un trabajo académico nuevo.'],
      ['EYA_17', 'Copio y pego fragmentos generados por la IA en mis tareas para ahorrar tiempo y evitar el desgaste de escribir desde cero.'],
      ['EYA_18', 'Si sé que no tendré acceso a la IA, evito iniciar tareas que exijan análisis o redacción compleja.'],
      ['EYA_19', 'Utilizo la IA mediante instrucciones directas que resuelvan la tarea entera en lugar de usarla como una guía de consulta.'],
      ['EYA_20', 'He dejado de consultar fuentes primarias o libros en la biblioteca universitaria debido a la rapidez de las respuestas digitales.'],
      ['EYA_21', 'Mi rutina diaria de estudio se detiene casi por completo cuando no puedo interactuar con herramientas de IA.']
    ]},
  { id: 'D4', title: 'Bloque 4 de 4 · Su relación con la IA',
    note: 'Ya casi termina. Este último bloque explora cómo percibe su relación con estas herramientas.',
    items: [
      ['EYA_22', 'Me preocupa que mi futuro desempeño profesional se vea comprometido si tengo que ejercer sin el apoyo de la IA.'],
      ['EYA_23', 'Percibo que la IA se ha convertido en una extensión indispensable de mi propia mente para poder rendir en la universidad.'],
      ['EYA_24', 'A veces siento que los trabajos académicos que entrego no reflejan mi voz personal, sino el estilo impersonal de la máquina.'],
      ['EYA_25', 'Aunque obtengo buenas calificaciones con ayuda de la IA, experimento el temor de no ser tan competente como aparento.'],
      ['EYA_26', 'Me cuesta diferenciar cuáles ideas de mis trabajos surgieron de mi propio pensamiento y cuáles fueron aportadas por el algoritmo.'],
      ['EYA_27', 'Siento culpa ética cuando mis profesores elogian redacciones o análisis que fueron producidos mayormente por la IA.'],
      ['EYA_28', 'Percibo que la forma de pensar de la IA impone puntos de vista estandarizados que chocan con mi realidad sociocultural local.']
    ]}
];
/* Copia prístina del banco original (para restablecer desde el editor
   después de una vista previa que ya mutó MODULES). */
const MODULES_ORIGINAL = JSON.parse(JSON.stringify(MODULES));
window.EYA_MODULES_ORIGINAL = MODULES_ORIGINAL;
/* ============ Estado ============ */
const LS_KEY = 'eya28_state_v1';
let S = load() || fresh();
function fresh() {
  return { step: 0, id: 'EYA-' + Date.now().toString(36).toUpperCase(),
    demo: {}, ans: {}, rt: {}, t0: null, flagRapidez: 0, modalShown: false,
    lastT: null, fastStreak: 0, done: false };
}
function load() { try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {} }
/* ============ Render de módulos ============ */
function renderModules() {
  const host = document.getElementById('modules');
  host.innerHTML = '';
  MODULES.forEach((m, mi) => {
    const sec = document.createElement('section');
    sec.className = 'step'; sec.id = 'step-m' + mi;
    sec.setAttribute('aria-labelledby', 'tm' + mi);
    let items = m.items.map(([code, stem]) => {
      const btns = LIKERT.map(([v, lab]) => {
        const pressed = S.ans[code] == v ? 'true' : 'false';
        return `<button type="button" data-code="${code}" data-val="${v}" aria-pressed="${pressed}"><span class="num">${v}</span><span class="lab">${lab.replace(/\n/g, '<br>')}</span></button>`;
      }).join('');
      return `<div class="item" data-item="${code}"><p class="stem">${stem}</p><div class="likert" role="group" aria-label="${code}">${btns}</div></div>`;
    }).join('');
    sec.innerHTML = `
      <header class="card-head"><p class="kicker">Paso ${mi + 2} de 6</p><h2 id="tm${mi}">${m.title}</h2></header>
      ${m.note ? `<div class="transition-note">${m.note}</div>` : ''}
      <div class="card-body">${items}</div>
      <p class="err" id="err-m${mi}" hidden>Responda todos los ítems para continuar.</p>
      <footer class="card-foot">
        <button class="btn ghost" data-mprev="${mi}">Atrás</button>
        <button class="btn primary" data-mnext="${mi}">${mi === MODULES.length - 1 ? 'Finalizar' : 'Continuar'}</button>
      </footer>`;
    host.appendChild(sec);
  });
}
/* ============ Navegación ============ */
function steps() { return Array.from(document.querySelectorAll('.step')); }
function goto(id) {
  steps().forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  S.step = id; save();
}
function stepIdFor(n) { // 0,1 → fijos; 2..6 → módulos; 7 → final
  if (n === 0) return 'step-0';
  if (n === 1) return 'step-1';
  if (n >= 2 && n <= 6) return 'step-m' + (n - 2);
  return 'step-final';
}
/* ============ Eventos ============ */
document.addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.next !== undefined) { if (validateStep(+t.dataset.next - 1)) goto(stepIdFor(+t.dataset.next)); return; }
  if (t.dataset.prev !== undefined) { goto(stepIdFor(+t.dataset.prev)); return; }
  if (t.dataset.mnext !== undefined) {
    const mi = +t.dataset.mnext;
    if (!validateModule(mi)) return;
    if (mi === MODULES.length - 1) finish(); else goto('step-m' + (mi + 1));
    return;
  }
  if (t.dataset.mprev !== undefined) {
    const mi = +t.dataset.mprev;
    goto(mi === 0 ? 'step-1' : 'step-m' + (mi - 1));
    return;
  }
  if (t.dataset.code) { answer(t.dataset.code, t.dataset.val, t); return; }
  if (t.id === 'btn-restart') { localStorage.removeItem(LS_KEY); S = fresh(); renderModules(); restoreDemo(); goto('step-0'); return; }
});
function validateStep(n) {
  if (n === 0) {
    const ok = document.getElementById('consent').checked;
    document.getElementById('err-0').hidden = ok;
    return ok;
  }
  if (n === 1) {
    const edad = +document.getElementById('edad').value;
    const sexo = document.querySelector('input[name=sexo]:checked');
    const carrera = document.querySelector('input[name=carrera]:checked');
    const ano = document.getElementById('ano').value;
    const uso = document.querySelector('input[name=uso]:checked');
    const ok = edad >= 17 && edad <= 35 && sexo && carrera && ano && uso;
    document.getElementById('err-1').hidden = ok;
    if (ok) {
      S.demo = { EDAD: edad, SEXO: sexo.value, CARRERA: carrera.value, ANO_ACADEMICO: ano, USO_IA_FREQ: uso.value };
      if (!S.t0) S.t0 = Date.now();
      save();
    }
    return ok;
  }
  return true;
}
function validateModule(mi) {
  const ok = MODULES[mi].items.every(([c]) => S.ans[c] !== undefined);
  document.getElementById('err-m' + mi).hidden = ok;
  return ok;
}
const UMBRAL_PALABRAS = {
  'EYA_01': 16,
  'EYA_02': 17,
  'EYA_03': 22,
  'EYA_04': 17,
  'EYA_05': 17,
  'EYA_06': 20,
  'EYA_07': 21,
  'EYA_08': 19,
  'EYA_09': 17,
  'EYA_10': 20,
  'EYA_11': 22,
  'EYA_12': 15,
  'EYA_13': 17,
  'EYA_14': 19,
  'EYA_15': 22,
  'EYA_16': 22,
  'EYA_17': 22,
  'EYA_18': 18,
  'EYA_19': 20,
  'EYA_20': 20,
  'EYA_21': 18,
  'EYA_22': 20,
  'EYA_23': 21,
  'EYA_24': 21,
  'EYA_25': 19,
  'EYA_26': 20,
  'EYA_27': 17,
  'EYA_28': 21,
};
function umbralItem(code) {
  const p = UMBRAL_PALABRAS[code] || 15;
  return Math.max(2000, p * 200 + 600);
}

/* ============ Respuesta + telemetría ============ */
function answer(code, val, btn) {
  const now = performance.now();
  if (S.lastT !== null) {
    const dt = now - S.lastT;
    S.rt[code] = Math.round(dt);
    const umb = umbralItem(code);
    if (dt < umb) { S.fastStreak++; } else { S.fastStreak = 0; }
    if (S.fastStreak >= 3 && !S.modalShown) { S.modalShown = true; S.flagRapidez = 1; showPause(); }
  } else {
    S.rt[code] = 0;
  }
  S.lastT = now;
  S.ans[code] = val;
  // Actualizar aria-pressed del grupo
  const grp = btn.closest('.likert');
  grp.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
  save();
}
function showPause() {
  const mb = document.getElementById('modal-pausa');
  const btn = document.getElementById('btn-pausa');
  const cnt = document.getElementById('count');
  const tOpen = performance.now();
  mb.hidden = false; btn.disabled = false;
  btn.innerHTML = 'Entendido, continuar';
  if (cnt) cnt.textContent = '';
  btn.onclick = () => {
    const dwell = Math.round(performance.now() - tOpen);
    S.pauseDwellMs = (S.pauseDwellMs || 0) + dwell;
    try { if (typeof save === 'function') save(); } catch(e) {}
    mb.hidden = true;
  };
}
/* ============ Finalizar + envío con cola persistente ============ */
const PENDING_KEY = 'eya28_pending_v1';
function getPending() { try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); } catch (e) { return []; } }
function setPending(a) { try { localStorage.setItem(PENDING_KEY, JSON.stringify(a)); } catch (e) {} }
function sendPayload(payload) {
  if (WEBHOOK_URL.includes('PEGAR_URL')) return Promise.resolve(true); // modo demo
  return fetch(WEBHOOK_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(() => true).catch(() => false);
}
function updatePendingUI(n) {
  const st = document.getElementById('send-status');
  const rb = document.getElementById('btn-retry');
  if (n > 0) {
    st.innerHTML = 'Sin conexión: tiene <b>' + n + '</b> respuesta(s) en cola. Se enviarán automáticamente al recuperar la conexión.';
    st.className = 'warn';
    if (rb) rb.hidden = false;
  } else {
    st.textContent = 'Respuestas enviadas correctamente.';
    st.className = 'ok';
    if (rb) rb.hidden = true;
  }
}
function flushPending() {
  const pending = getPending();
  if (!pending.length) { updatePendingUI(0); return; }
  updatePendingUI(pending.length);
  const remaining = [];
  let chain = Promise.resolve();
  pending.forEach(item => {
    chain = chain.then(() =>
      sendPayload(item.payload).then(ok => {
        item.attempts = (item.attempts || 0) + 1;
        if (!ok) remaining.push(item);
      })
    );
  });
  chain.then(() => {
    setPending(remaining);
    updatePendingUI(remaining.length);
    if (!remaining.length) {
      // Todo enviado: ahora sí limpiar el estado en curso
      localStorage.removeItem(LS_KEY);
    }
  });
}
function finish() {
  S.done = true;
  const rtTotal = S.t0 ? Math.round(Date.now() - S.t0) : 0;
  /* El ítem de control se identifica por su bloque IMC, no por su
   * código: con la renumeración automática su código cambia con su
   * posición. Sin itemSet aplicado, el banco original lo deja en
   * EYA_15, así que este lookup es compatible hacia atrás. */
  const imcMod = MODULES.find(m => m.id === 'IMC');
  const imcCode = imcMod && imcMod.items.length ? imcMod.items[0][0] : null;
  const imc = imcCode && S.ans[imcCode] === '1' ? 1 : 0;
  const payload = Object.assign({
    ID_SUJETO: S.id, RT_TOTAL_MS: rtTotal, FLAG_RAPIDEZ: S.flagRapidez, IMC_CONTROL: imc
  }, S.demo, S.ans);
  // Encolar ANTES de intentar enviar: si falla la red, nada se pierde
  const pending = getPending();
  pending.push({ payload: payload, ts: Date.now(), attempts: 0 });
  setPending(pending);
  save(); // S.done=true: al reabrir verá la pantalla final, no el inicio
  goto('step-final');
  flushPending();
  // YA NO se borra LS_KEY aquí: solo tras envío confirmado
}
/* ============ Restaurar estado ============ */
function restoreDemo() {
  if (!S.demo) return;
  if (S.demo.EDAD) document.getElementById('edad').value = S.demo.EDAD;
  ['sexo', 'carrera', 'uso'].forEach(n => {
    const map = { sexo: 'SEXO', carrera: 'CARRERA', uso: 'USO_IA_FREQ' };
    const v = S.demo[map[n]];
    if (v) { const r = document.querySelector(`input[name=${n}][value="${v}"]`); if (r) r.checked = true; }
  });
  if (S.demo.ANO_ACADEMICO) document.getElementById('ano').value = S.demo.ANO_ACADEMICO;
}
/* ============ Textos editables (prototipo del panel de edición) ============ */
/* Aplica un config de textos (de config.json o del editor) sobre la
   página y sobre las notas de los módulos. Antes del primer render
   actualiza MODULES para que renderModules() ya use los textos nuevos;
   después del render, sincroniza además las notas visibles en el DOM.
   Ítems: cfg.itemSet (lista completa [{code, block, stem}]) sustituye
   el banco entero; si no hay itemSet, cfg.items solo sobrescribe
   redacciones. Sin itemSet en el config, un conjunto guardado en este
   navegador por el editor (localStorage) también se aplica: así el
   cuestionario "internaliza" las modificaciones automáticamente en
   este dispositivo, sin descargar ningún archivo. Solo cambia la
   redacción o la composición; nunca la puntuación. El umbral de
   lectura rápida de cada ítem se recalcula con el número de palabras
   de la redacción vigente. */
var ITEMSET_LS_KEY = 'eya28_editor_itemset_v1';
function cleanItemSet(set) {
  if (!Array.isArray(set)) return null;
  var seen = {};
  var out = [];
  set.forEach(function (it) {
    if (!it || typeof it.code !== 'string' || typeof it.stem !== 'string') return;
    if (!/^EYA_\d+$/.test(it.code)) return;
    if (['D1', 'D2', 'IMC', 'D3', 'D4'].indexOf(it.block) === -1) return;
    if (!it.stem.trim() || seen[it.code]) return;
    seen[it.code] = true;
    out.push({ code: it.code, block: it.block, stem: it.stem.trim() });
  });
  return out.length ? out : null;
}
function applyItemSet(set) {
  var clean = cleanItemSet(set);
  if (!clean) return false;
  MODULES.forEach(function (mod) {
    mod.items = clean.filter(function (it) { return it.block === mod.id; })
      .map(function (it) { return [it.code, it.stem]; });
  });
  clean.forEach(function (it) {
    UMBRAL_PALABRAS[it.code] = it.stem.split(/\s+/).length;
  });
  return true;
}
window.EYA_applyItemSet = applyItemSet;
window.EYA_cleanItemSet = cleanItemSet;
function applyTextConfig(cfg) {
  if (!cfg) return;
  var t0 = document.getElementById('t0');
  if (t0 && cfg.titulo) t0.textContent = cfg.titulo;
  var body = document.querySelector('#step-0 .card-body');
  if (body) {
    var paras = body.querySelectorAll('p:not(.muted)');
    if (Array.isArray(cfg.presentacion)) {
      paras.forEach(function (p, i) {
        if (i < cfg.presentacion.length) p.textContent = cfg.presentacion[i];
      });
      for (var i = cfg.presentacion.length; i < paras.length; i++) paras[i].remove();
      var muted = body.querySelector('p.muted');
      for (var j = paras.length; j < cfg.presentacion.length; j++) {
        var np = document.createElement('p');
        np.textContent = cfg.presentacion[j];
        body.insertBefore(np, muted);
      }
    }
    var m = body.querySelector('p.muted');
    if (m && cfg.notaDuracion) m.textContent = cfg.notaDuracion;
    var cs = body.querySelector('.consent span');
    if (cs && cfg.consentimiento) cs.textContent = cfg.consentimiento;
  }
  if (cfg.notasSeccion) {
    MODULES.forEach(function (mod, mi) {
      var v = cfg.notasSeccion[mod.id];
      mod.note = (v === undefined || v === null || v === '') ? null : v;
      var sec = document.getElementById('step-m' + mi);
      if (!sec) return;
      var noteEl = sec.querySelector('.transition-note');
      if (mod.note) {
        if (noteEl) { noteEl.textContent = mod.note; }
        else {
          var d = document.createElement('div');
          d.className = 'transition-note';
          d.textContent = mod.note;
          var head = sec.querySelector('.card-head');
          sec.insertBefore(d, head.nextSibling);
        }
      } else if (noteEl) { noteEl.remove(); }
    });
  }
  if (cfg.itemSet && cleanItemSet(cfg.itemSet)) {
    applyItemSet(cfg.itemSet);
  } else if (cfg.items && typeof cfg.items === 'object') {
    MODULES.forEach(function (mod) {
      mod.items.forEach(function (item) {
        var code = item[0];
        var v = cfg.items[code];
        if (typeof v !== 'string' || !v.trim()) return;
        item[1] = v.trim();
        UMBRAL_PALABRAS[code] = v.trim().split(/\s+/).length;
        var el = document.querySelector('.item[data-item="' + code + '"] .stem');
        if (el) el.textContent = v.trim();
      });
    });
  }
  if (!cfg.itemSet) {
    try {
      var saved = JSON.parse(localStorage.getItem(ITEMSET_LS_KEY) || 'null');
      if (saved) applyItemSet(saved);
    } catch (e) {}
  }
  /* Vista previa del editor (página ya renderizada): reconstruir los
     módulos con el conjunto vigente y volver al paso en curso. */
  if (document.querySelector('#modules .step')) {
    renderModules();
    if (S.step && document.getElementById(S.step)) goto(S.step);
    else goto('step-0');
  }
}
window.EYA_applyTextConfig = applyTextConfig;
/* ============ Init ============ */
function initApp() {
renderModules();
restoreDemo();
// Reintento manual
document.getElementById('btn-retry').addEventListener('click', flushPending);
// Reintento automático al recuperar conexión
window.addEventListener('online', () => { if (getPending().length) flushPending(); });
// Al abrir: si hay envíos pendientes, intentar de inmediato
if (getPending().length) {
  if (S.done) goto('step-final');
  flushPending();
} else if (S.done) { goto('step-final'); updatePendingUI(0); }
else if (S.step && document.getElementById(S.step)) { goto(S.step); }
else { goto('step-0'); }
}
/* Cargar textos editables (config.json si existe; si no, valores por
   defecto idénticos a los actuales) y solo entonces iniciar. */
if (typeof EYA_loadTextConfig === 'function') {
  EYA_loadTextConfig().then(function (cfg) {
    window.EYA_TEXT_CONFIG = cfg;
    applyTextConfig(cfg);
    initApp();
  });
} else {
  initApp();
}
