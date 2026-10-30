/* EYA-28 · Textos editables del cuestionario (prototipo del panel de edición)
 *
 * config.json (opcional, en la misma carpeta) puede sobrescribir estos
 * valores. Si config.json no existe o no se puede leer, se usan los
 * valores por defecto de abajo, que son los textos del cuestionario tras la corrección de notas del
 * 2026-10-29 (cada nota describe el tema de su propio bloque; el
 * Bloque 4 tiene nota propia). Los 28 ítems se editan solo por sobrescritura en
 * config.items (código → redacción nueva); sin sobrescritura se usan
 * las redacciones originales del banco de reactivos en app.js. Cambiar
 * la redacción de un ítem cambia lo que mide el instrumento validado:
 * es una decisión metodológica del equipo, no un cambio inocuo.
 */
(function () {
  'use strict';

  var DEFAULTS = {
    titulo: 'Escala del Yo Algorítmico (EYA-28)',
    presentacion: [
      'Somos un grupo de investigadores de la carrera de Psicología de la Universidad Central Marta Abreu de Las Villas.',
      'Usted ha sido seleccionado(a) para participar en una investigación que caracterizará el impacto psicológico de la interacción cotidiana con Inteligencia Artificial en la configuración del Yo Algorítmico.',
      'Queremos resaltar que su participación es completamente voluntaria y anónima. La información proporcionada tendrá un carácter confidencial y solo será utilizada para los fines del estudio.'
    ],
    notaDuracion: 'Duración aproximada: 8–10 minutos. Puede interrumpir y continuar después; su progreso se guarda automáticamente en este dispositivo.',
    consentimiento: 'He leído la información y acepto participar voluntariamente.',
    notasSeccion: {
      D1: 'Ha completado la primera parte. Tómese un momento: las siguientes afirmaciones exploran sus procesos de pensamiento con estas herramientas.',
      D2: 'Va por buen camino. Las siguientes afirmaciones exploran sus experiencias emocionales con estas herramientas.',
      IMC: null,
      D3: 'Ya casi termina. Las siguientes afirmaciones indagan en sus hábitos y conductas de estudio con estas herramientas.',
      D4: 'Ya casi termina. Este último bloque explora cómo percibe su relación con estas herramientas.'
    },
    items: {},
    itemSet: null
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function mergeConfig(raw) {
    var out = clone(DEFAULTS);
    if (!raw || typeof raw !== 'object') return out;
    if (typeof raw.titulo === 'string' && raw.titulo.trim()) out.titulo = raw.titulo;
    if (Array.isArray(raw.presentacion) && raw.presentacion.length) {
      out.presentacion = raw.presentacion.filter(function (p) {
        return typeof p === 'string' && p.trim();
      });
      if (!out.presentacion.length) out.presentacion = clone(DEFAULTS.presentacion);
    }
    if (typeof raw.notaDuracion === 'string' && raw.notaDuracion.trim()) out.notaDuracion = raw.notaDuracion;
    if (typeof raw.consentimiento === 'string' && raw.consentimiento.trim()) out.consentimiento = raw.consentimiento;
    if (raw.notasSeccion && typeof raw.notasSeccion === 'object') {
      Object.keys(out.notasSeccion).forEach(function (k) {
        if (Object.prototype.hasOwnProperty.call(raw.notasSeccion, k)) {
          var v = raw.notasSeccion[k];
          out.notasSeccion[k] = (typeof v === 'string' && v.trim()) ? v : null;
        }
      });
    }
    if (raw.items && typeof raw.items === 'object') {
      Object.keys(raw.items).forEach(function (code) {
        var v = raw.items[code];
        if (typeof v === 'string' && v.trim()) out.items[code] = v.trim();
      });
    }
    if (Array.isArray(raw.itemSet)) {
      var seen = {};
      var clean = [];
      raw.itemSet.forEach(function (it) {
        if (!it || typeof it.code !== 'string' || typeof it.stem !== 'string') return;
        if (!/^EYA_\d+$/.test(it.code)) return;
        if (['D1', 'D2', 'IMC', 'D3', 'D4'].indexOf(it.block) === -1) return;
        if (!it.stem.trim() || seen[it.code]) return;
        seen[it.code] = true;
        clean.push({ code: it.code, block: it.block, stem: it.stem.trim() });
      });
      if (clean.length) out.itemSet = clean;
    }
    return out;
  }

  function loadTextConfig() {
    return fetch('config.json', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('sin config.json');
        return r.json();
      })
      .then(mergeConfig)
      .catch(function () { return clone(DEFAULTS); });
  }

  var root = (typeof window !== 'undefined') ? window : globalThis;
  root.EYA_TEXT_DEFAULTS = DEFAULTS;
  root.EYA_loadTextConfig = loadTextConfig;
})();
