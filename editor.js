/* EYA-28 · Panel de edición (PROTOTIPO, solo con ?editar)
 *
 * Este script SOLO se carga cuando la URL trae el parámetro ?editar
 * (ver el bootstrap al final de index.html). Sin ese parámetro no se
 * ejecuta nada de este archivo: ni botón, ni panel, ni llamada a Google.
 *
 * Flujo: botón de Google (GIS) → se lee el correo del token de
 * identidad → se compara con allowlist.json → solo si está en la lista
 * se construye el panel. Si no está, mensaje genérico sin revelar la
 * lista.
 *
 * LIMITACIÓN HONESTA (piloto): esta comprobación es solo control de
 * interfaz. La verificación real debe hacerla un servidor que valide
 * el token de Google antes de aceptar cambios (ver README.md). En este
 * prototipo ningún cambio llega al sitio en vivo: el editor solo
 * previsualiza en la página y descarga un config.json.
 */
(function () {
  'use strict';

  var MODULE_ORDER = ['D1', 'D2', 'IMC', 'D3', 'D4'];
  /* Etiquetas por el momento en que el respondiente VE cada nota,
   * sin números de paso (el Paso 1 del cuestionario es Datos
   * generales, que no tiene nota y por eso no aparece aquí). Desde
   * la corrección del 2026-10-29, cada nota describe el tema de su
   * propio bloque y el Bloque 4 tiene nota propia. */
  var MODULE_LABEL = {
    D1: 'Nota al entrar al Bloque 1 · Procesos de pensamiento (antes del primer ítem del Bloque 1)',
    D2: 'Nota al entrar al Bloque 2 · Experiencias y emociones (antes del primer ítem del Bloque 2)',
    IMC: 'Nota de la pantalla de Verificación (solo el ítem de verificación) · hoy no se muestra ninguna',
    D3: 'Nota al entrar al Bloque 3 · Hábitos de estudio (antes del primer ítem del Bloque 3)',
    D4: 'Nota al entrar al Bloque 4 · Su relación con la IA (antes del primer ítem del Bloque 4)'
  };
  /* Líneas visibles SIEMPRE debajo de cada campo de nota. La versión
   * anterior ponía la explicación en el placeholder, que es invisible
   * en cuanto el campo tiene texto: justo las tres notas que causan
   * la duda (D1, D2, D3) nunca mostraban su explicación. */
  /* Textos corregidos 2026-10-29: cada nota describe el tema de su
   * propio bloque (antes anunciaban el del bloque siguiente) y el
   * Bloque 4 ya tiene nota propia (la frase original del Bloque 3,
   * que encaja exacta en el Bloque 4). IMC sigue sin nota: es la
   * pantalla de control de un solo ítem, no un bloque temático. */
  var NOTE_LINE = {
    D1: 'Se muestra encima del Bloque 1, antes de su primer ítem. Su texto describe el tema del Bloque 1 (procesos de pensamiento).',
    D2: 'Se muestra encima del Bloque 2, antes de su primer ítem. Su texto describe el tema del Bloque 2 (experiencias emocionales).',
    IMC: 'Vacía hoy: en la pantalla de Verificación (solo el ítem de verificación) no se muestra ninguna nota. Escribir aquí añadiría una nota nueva.',
    D3: 'Se muestra encima del Bloque 3, antes de su primer ítem. Su texto describe el tema del Bloque 3 (hábitos de estudio).',
    D4: 'Se muestra encima del Bloque 4, antes de su primer ítem. Su texto describe el tema del Bloque 4 (su relación con la IA).'
  };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function currentTexts() {
    var base = window.EYA_TEXT_CONFIG || window.EYA_TEXT_DEFAULTS;
    return JSON.parse(JSON.stringify(base));
  }

  function getModules() {
    try {
      return (typeof MODULES !== 'undefined') ? MODULES : [];
    } catch (e) {
      return [];
    }
  }

  function originalItemList() {
    var mods = [];
    try {
      mods = window.EYA_MODULES_ORIGINAL || [];
    } catch (e) {
      mods = [];
    }
    if (!mods.length) mods = getModules();
    var out = [];
    mods.forEach(function (mod) {
      mod.items.forEach(function (it) {
        out.push({ code: it[0], block: mod.id, stem: it[1] });
      });
    });
    return out;
  }

  function loadWorkingItems(cfg) {
    var list = null;
    try {
      var saved = JSON.parse(localStorage.getItem('eya28_editor_itemset_v1') || 'null');
      if (saved && window.EYA_cleanItemSet && window.EYA_cleanItemSet(saved)) {
        list = window.EYA_cleanItemSet(saved);
      }
    } catch (e) {}
    if (!list && cfg && Array.isArray(cfg.itemSet) && cfg.itemSet.length) {
      var clean = window.EYA_cleanItemSet ? window.EYA_cleanItemSet(cfg.itemSet) : null;
      if (clean) list = clean;
    }
    if (!list) {
      list = originalItemList();
      var over = (cfg && cfg.items) || {};
      list.forEach(function (it) {
        if (typeof over[it.code] === 'string' && over[it.code].trim()) it.stem = over[it.code].trim();
      });
    }
    /* Al abrir, los códigos ya quedan ajustados al orden actual. */
    renumber(list);
    return list;
  }

  function saveWorkingItems(list) {
    try {
      localStorage.setItem('eya28_editor_itemset_v1', JSON.stringify(list));
    } catch (e) {}
  }

  /* Renumeración automática (2026-10-29, por orden de Carlos): tras
   * cualquier cambio de posición, alta o baja, los códigos se
   * reasignan en el orden de la lista (que es el orden de
   * presentación): EYA_01, EYA_02, … sin huecos. La identidad del
   * ítem de control ya NO es su código (que cambia con su posición)
   * sino su bloque IMC. Esto sustituye la regla anterior de
   * «códigos nunca reutilizados». */
  function renumber(list) {
    list.forEach(function (it, i) {
      it.code = 'EYA_' + String(i + 1).padStart(2, '0');
    });
  }

  /* Posición de inserción de un ítem nuevo dentro de su bloque, en el
   * orden de la lista (que es el orden en que aparece en el panel y,
   * filtrado por bloque, en el cuestionario). `after` puede ser:
   * '__start__' (al inicio del bloque), '__end__' (al final del
   * bloque) o el código de un ítem del bloque (justo después de él).
   * Si el bloque está vacío, el ítem va tras el último ítem del
   * bloque anterior con contenido (o antes del siguiente, si no hay
   * anterior). Si `after` ya no existe, cae al final del bloque. */
  function insertIndexFor(list, block, after) {
    var order = ['D1', 'D2', 'IMC', 'D3', 'D4'];
    var first = -1, last = -1;
    list.forEach(function (it, i) {
      if (it.block === block) { if (first === -1) first = i; last = i; }
    });
    if (first === -1) {
      var bi = order.indexOf(block);
      for (var b = bi - 1; b >= 0; b--) {
        for (var i = list.length - 1; i >= 0; i--) {
          if (list[i].block === order[b]) return i + 1;
        }
      }
      for (var b2 = bi + 1; b2 < order.length; b2++) {
        for (var i2 = 0; i2 < list.length; i2++) {
          if (list[i2].block === order[b2]) return i2;
        }
      }
      return list.length;
    }
    if (after === '__start__') return first;
    if (!after || after === '__end__') return last + 1;
    for (var k = first; k <= last; k++) {
      if (list[k].code === after) return k + 1;
    }
    return last + 1;
  }

  function shortStem(stem, n) {
    var s = String(stem || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  function emptyStems(list) {
    return list.filter(function (it) { return !it.stem.trim(); }).map(function (it) { return it.code; });
  }

  function collectFromFields(fields, workingItems) {
    var notas = {};
    MODULE_ORDER.forEach(function (id) {
      var v = fields['nota_' + id].value.trim();
      notas[id] = v ? v : null;
    });
    return {
      titulo: fields.titulo.value.trim(),
      presentacion: fields.presentacion.value.split(/\n\s*\n/).map(function (s) {
        return s.trim();
      }).filter(Boolean),
      notaDuracion: fields.notaDuracion.value.trim(),
      consentimiento: fields.consentimiento.value.trim(),
      notasSeccion: notas,
      items: {},
      itemSet: (workingItems || []).map(function (it) {
        return { code: it.code, block: it.block, stem: it.stem.trim() };
      })
    };
  }

  function fillFields(fields, cfg) {
    fields.titulo.value = cfg.titulo || '';
    fields.presentacion.value = (cfg.presentacion || []).join('\n\n');
    fields.notaDuracion.value = cfg.notaDuracion || '';
    fields.consentimiento.value = cfg.consentimiento || '';
    MODULE_ORDER.forEach(function (id) {
      fields['nota_' + id].value = (cfg.notasSeccion && cfg.notasSeccion[id]) || '';
    });
  }

  function openEditor(email, idToken) {
    var entry = document.getElementById('eya-editor-entry');
    if (entry) entry.remove();
    /* Tras iniciar sesión sí se muestra el cuestionario detrás del
     * panel, para que «Vista previa» funcione sobre la página real. */
    document.body.classList.add('eya-editor-in');

    var backdrop = el('div');
    backdrop.id = 'eya-editor-backdrop';
    document.body.appendChild(backdrop);

    var cfg = currentTexts();
    var panel = el('div');
    panel.id = 'eya-editor-panel';
    panel.innerHTML = '<h2>Editor del cuestionario</h2>';
    panel.appendChild(el('p', 'eya-who', 'Sesión: ' + email));

    var fields = {};
    function addField(key, label, value, textarea) {
      panel.appendChild(el('label', null, label));
      var input = textarea ? document.createElement('textarea') : document.createElement('input');
      if (!textarea) input.type = 'text';
      input.value = value || '';
      panel.appendChild(input);
      fields[key] = input;
      return input;
    }

    addField('titulo', 'Título', cfg.titulo, false);
    addField('presentacion', 'Texto de presentación (un párrafo por bloque, separados por una línea en blanco)',
      (cfg.presentacion || []).join('\n\n'), true);
    addField('notaDuracion', 'Nota de duración', cfg.notaDuracion, false);
    addField('consentimiento', 'Texto de consentimiento', cfg.consentimiento, false);
    panel.appendChild(el('p', 'eya-note',
      'Orden en el cuestionario: Bienvenida → Datos generales (sin nota) → '
      + '[nota] Bloque 1 → [nota] Bloque 2 → Verificación, solo el ítem de verificación (sin nota) → '
      + '[nota] Bloque 3 → [nota] Bloque 4 → Final. Cada nota se muestra '
      + 'encima de su bloque, antes de sus ítems, y describe el tema de ese bloque.'));
    MODULE_ORDER.forEach(function (id) {
      var input = addField('nota_' + id, 'Instrucción de sección — ' + MODULE_LABEL[id],
        (cfg.notasSeccion && cfg.notasSeccion[id]) || '', true);
      panel.appendChild(el('p', 'eya-note', NOTE_LINE[id] || ''));
    });

    panel.appendChild(el('h3', null, 'Ítems de la escala (añadir, eliminar, mover o redactar)'));
    var workingItems = loadWorkingItems(cfg);
    var BLOCK_LABEL = {
      D1: 'Bloque 1 · Procesos de pensamiento',
      D2: 'Bloque 2 · Experiencias y emociones',
      IMC: 'Verificación de pantalla',
      D3: 'Bloque 3 · Hábitos de estudio',
      D4: 'Bloque 4 · Su relación con la IA'
    };
    var countLine = el('p', 'eya-note', '');
    panel.appendChild(countLine);
    var rowsBox = el('div', 'eya-item-rows');
    panel.appendChild(rowsBox);

    /* Tras mover un ítem (cambio de bloque, reorden o alta), la fila
     * puede quedar fuera de la vista porque el panel conserva su
     * desplazamiento: llevar la vista hasta ella, resaltarla y dejar
     * el foco en el control que sigue (posición o redacción). */
    function followRow(it, where) {
      var idx = workingItems.indexOf(it);
      var row = rowsBox.children[idx];
      if (!row) return;
      row.classList.add('eya-moved');
      row.scrollIntoView({ block: 'center' });
      if (where === 'text') {
        var ta = row.querySelector('textarea');
        if (ta) ta.focus();
      } else {
        var sels = row.querySelectorAll('select');
        if (sels.length > 1) sels[1].focus();
      }
      setTimeout(function () { row.classList.remove('eya-moved'); }, 3000);
    }

    function renderItemRows() {
      rowsBox.innerHTML = '';
      countLine.textContent = workingItems.length + ' ítems actualmente (original: 28).';
      workingItems.forEach(function (it, idx) {
        var row = el('div', 'eya-item-row');
        row.appendChild(el('label', null, it.code + ' · ' + (BLOCK_LABEL[it.block] || it.block)));
        var ta = document.createElement('textarea');
        ta.value = it.stem;
        ta.addEventListener('input', function () { it.stem = ta.value; });
        row.appendChild(ta);
        var sel = document.createElement('select');
        ['D1', 'D2', 'D3', 'D4'].forEach(function (b) {
          var opt = document.createElement('option');
          opt.value = b;
          opt.textContent = BLOCK_LABEL[b];
          if (b === it.block) opt.selected = true;
          sel.appendChild(opt);
        });
        if (it.block === 'IMC') {
          sel.disabled = true;
          sel.title = 'Ítem de control: bloque fijo';
        } else {
          sel.addEventListener('change', function () {
            it.block = sel.value;
            /* Al cambiar de bloque el ítem queda al final del nuevo
             * bloque, y desde su selector de posición se coloca en
             * el lugar exacto que se quiera. Tras el cambio, los
             * códigos se reasignan solos al nuevo orden. */
            var cur = workingItems.indexOf(it);
            if (cur !== -1) {
              workingItems.splice(cur, 1);
              var at = insertIndexFor(workingItems, it.block, '__end__');
              workingItems.splice(at, 0, it);
            }
            renumber(workingItems);
            renderItemRows();
            followRow(it, 'pos');
          });
        }
        row.appendChild(sel);
        row.appendChild(el('label', null, 'Posición en el bloque:'));
        var posSel = document.createElement('select');
        (function buildPosOptions() {
          var blockItems = workingItems.filter(function (x) { return x.block === it.block && x.code !== it.code; });
          var selfIdx = workingItems.filter(function (x) { return x.block === it.block; }).indexOf(it);
          if (!blockItems.length) {
            var only = document.createElement('option');
            only.value = '__end__';
            only.textContent = 'Único ítem del bloque';
            posSel.appendChild(only);
            return;
          }
          var start = document.createElement('option');
          start.value = '__start__';
          start.textContent = 'Al inicio del bloque';
          if (selfIdx === 0) start.selected = true;
          posSel.appendChild(start);
          blockItems.forEach(function (other) {
            var opt = document.createElement('option');
            opt.value = other.code;
            opt.textContent = 'Después de ' + other.code + (other.stem.trim() ? ' · ' + shortStem(other.stem, 40) : '');
            posSel.appendChild(opt);
          });
          var end = document.createElement('option');
          end.value = '__end__';
          end.textContent = 'Al final del bloque';
          posSel.appendChild(end);
          /* Valor actual: si es el primero, inicio; si no, «después
           * del anterior». Elegir «final» lo deja tras el último. */
          if (selfIdx > 0) {
            var prev = workingItems.filter(function (x) { return x.block === it.block; })[selfIdx - 1];
            if (prev) posSel.value = prev.code;
          }
        })();
        posSel.addEventListener('change', function () {
          var cur = workingItems.indexOf(it);
          if (cur === -1) return;
          workingItems.splice(cur, 1);
          var at = insertIndexFor(workingItems, it.block, posSel.value);
          workingItems.splice(at, 0, it);
          renumber(workingItems);
          renderItemRows();
          followRow(it, 'pos');
        });
        row.appendChild(posSel);
        var btnDel = el('button', 'eya-danger', 'Eliminar');
        btnDel.addEventListener('click', function () {
          var msg = '¿Eliminar ' + it.code + ' del cuestionario?';
          if (it.block === 'IMC') {
            msg = 'El ítem de control de calidad (' + it.code + ', bloque Verificación). Si lo eliminas, ' +
              'el cuestionario pierde su control de atención. ¿Eliminarlo de todos modos?';
          }
          if (!window.confirm(msg)) return;
          workingItems.splice(idx, 1);
          renumber(workingItems);
          renderItemRows();
        });
        row.appendChild(btnDel);
        rowsBox.appendChild(row);
      });
      if (typeof posSel !== 'undefined' && posSel && typeof addSel !== 'undefined' && addSel) {
        renderPosOptions();
      }
    }
    renderItemRows();

    var addBox = el('div', 'eya-actions');
    addBox.appendChild(el('label', null, 'Añadir ítem nuevo — elige el bloque del ítem nuevo:'));
    var addSel = document.createElement('select');
    ['D1', 'D2', 'D3', 'D4'].forEach(function (b) {
      var opt = document.createElement('option');
      opt.value = b;
      opt.textContent = BLOCK_LABEL[b];
      addSel.appendChild(opt);
    });
    addBox.appendChild(addSel);
    addBox.appendChild(el('label', null, 'Posición del ítem nuevo dentro del bloque (cuándo aparecerá en la lista):'));
    var posSel = document.createElement('select');
    function renderPosOptions() {
      var prev = posSel.value;
      posSel.innerHTML = '';
      var blockItems = workingItems.filter(function (it) { return it.block === addSel.value; });
      if (!blockItems.length) {
        var only = document.createElement('option');
        only.value = '__end__';
        only.textContent = 'En el bloque (será el único ítem)';
        posSel.appendChild(only);
        return;
      }
      var start = document.createElement('option');
      start.value = '__start__';
      start.textContent = 'Al inicio del bloque';
      posSel.appendChild(start);
      blockItems.forEach(function (it) {
        var opt = document.createElement('option');
        opt.value = it.code;
        opt.textContent = 'Después de ' + it.code + (it.stem.trim() ? ' · ' + shortStem(it.stem, 40) : '');
        posSel.appendChild(opt);
      });
      var end = document.createElement('option');
      end.value = '__end__';
      end.textContent = 'Al final del bloque';
      end.selected = true;
      posSel.appendChild(end);
      var stillThere = Array.prototype.some.call(posSel.options, function (o) { return o.value === prev; });
      if (stillThere) posSel.value = prev;
    }
    addSel.addEventListener('change', renderPosOptions);
    renderPosOptions();
    var btnAdd = el('button', null, 'Añadir ítem');
    btnAdd.addEventListener('click', function () {
      var idx = insertIndexFor(workingItems, addSel.value, posSel.value);
      var nuevo = { code: '', block: addSel.value, stem: '' };
      workingItems.splice(idx, 0, nuevo);
      renumber(workingItems);
      renderItemRows();
      followRow(nuevo, 'text');
    });
    addBox.appendChild(posSel);
    addBox.appendChild(btnAdd);
    panel.appendChild(addBox);

    var actions = el('div', 'eya-actions');
    var btnPreview = el('button', null, 'Vista previa');
    var btnReset = el('button', 'eya-secondary', 'Restablecer valores actuales');
    var btnDownload = el('button', null, 'Descargar config.json');
    var btnPublish = el('button', null, 'Publicar en el cuestionario real');
    var btnClose = el('button', 'eya-danger', 'Cerrar editor');
    actions.appendChild(btnPreview);
    actions.appendChild(btnReset);
    actions.appendChild(btnDownload);
    actions.appendChild(btnPublish);
    actions.appendChild(btnClose);
    panel.appendChild(actions);
    var pubStatus = el('p', 'eya-note', '');
    pubStatus.style.display = 'none';
    panel.appendChild(pubStatus);
    document.body.appendChild(panel);

    btnPreview.addEventListener('click', function () {
      var empty = emptyStems(workingItems);
      if (empty.length) {
        window.alert('Hay ítems sin redacción: ' + empty.join(', ') +
          '. Escríbelos o elimínalos antes de previsualizar.');
        return;
      }
      saveWorkingItems(workingItems);
      if (typeof window.EYA_applyTextConfig === 'function') {
        window.EYA_applyTextConfig(collectFromFields(fields, workingItems));
      }
    });
    btnReset.addEventListener('click', function () {
      try { localStorage.removeItem('eya28_editor_itemset_v1'); } catch (e) {}
      workingItems = originalItemList();
      renderItemRows();
      var fresh = currentTexts();
      fillFields(fields, fresh);
      if (typeof window.EYA_applyTextConfig === 'function') {
        window.EYA_applyTextConfig(collectFromFields(fields, workingItems));
      }
    });
    btnDownload.addEventListener('click', function () {
      var empty = emptyStems(workingItems);
      if (empty.length) {
        window.alert('Hay ítems sin redacción: ' + empty.join(', ') +
          '. Escríbelos o elimínalos antes de descargar.');
        return;
      }
      saveWorkingItems(workingItems);
      var data = collectFromFields(fields, workingItems);
      var blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'config.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });
    btnClose.addEventListener('click', function () {
      /* Cerrar vuelve a la pantalla limpia de acceso (solo el
       * selector), no a la primera página del cuestionario. */
      window.location.reload();
    });
    btnPublish.addEventListener('click', function () {
      var relayUrl = (window.EYA_EDITOR_CONFIG && window.EYA_EDITOR_CONFIG.relayUrl) || '';
      if (!relayUrl) {
        pubStatus.style.display = '';
        pubStatus.textContent = 'Publicación aún no disponible: falta desplegar el relay ' +
          '(ver PASOS_PUBLICAR.md: token de GitHub + Apps Script + pegar su URL en ' +
          'editor-config.js). Mientras tanto, usa «Descargar config.json».';
        return;
      }
      var empty = emptyStems(workingItems);
      if (empty.length) {
        window.alert('Hay ítems sin redacción: ' + empty.join(', ') +
          '. Escríbelos o elimínalos antes de publicar.');
        return;
      }
      if (!window.confirm('¿Publicar estos cambios en el cuestionario real? ' +
        'El cuestionario en vivo se actualizará con este conjunto en cuanto se guarde.')) {
        return;
      }
      pubStatus.style.display = '';
      pubStatus.textContent = 'Publicando…';
      fetch(relayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: idToken || '', config: collectFromFields(fields, workingItems) })
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res && res.ok) {
            saveWorkingItems(workingItems);
            pubStatus.textContent = 'Publicado en el cuestionario real. ' +
              'Los respondientes lo verán al recargar la página.';
          } else {
            pubStatus.textContent = 'No se pudo publicar: ' +
              ((res && res.error) || 'error del relay') + '. Nada cambió en vivo.';
          }
        })
        .catch(function () {
          pubStatus.textContent = 'No se pudo contactar al relay. Nada cambió en vivo.';
        });
    });
  }

  function decodeEmailFromToken(token) {
    try {
      var payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      var json = decodeURIComponent(atob(payload).split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return (JSON.parse(json).email || '').toLowerCase();
    } catch (e) {
      return '';
    }
  }

  function init() {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'editor.css?v=1';
    document.head.appendChild(link);

    var entry = el('div');
    entry.id = 'eya-editor-entry';
    entry.appendChild(el('p', null, 'Panel de editores EYA-28'));
    entry.appendChild(el('p', null, 'Accede con tu cuenta de Google autorizada.'));
    var status = el('p', null, '');
    entry.appendChild(status);
    var btnBox = el('div');
    entry.appendChild(btnBox);
    document.body.appendChild(entry);

    var clientId = (window.EYA_EDITOR_CONFIG && window.EYA_EDITOR_CONFIG.clientId) || '';
    if (!clientId || clientId === 'GOOGLE_CLIENT_ID_PENDIENTE') {
      status.className = 'eya-warn';
      status.textContent = 'Falta configurar el ID de cliente de Google. ' +
        'Ver README.md (paso OAuth) y pegar el ID en editor-config.js. ' +
        'El cuestionario sigue funcionando con normalidad.';
      return;
    }

    var script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = function () {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: function (resp) {
          var email = decodeEmailFromToken(resp.credential || '');
          if (!email) {
            status.textContent = 'No se pudo verificar la sesión. Intenta de nuevo.';
            return;
          }
          status.textContent = 'Verificando acceso…';
          fetch('allowlist.json', { cache: 'no-store' })
            .then(function (r) { return r.json(); })
            .then(function (list) {
              var allowed = (list.authorizedEmails || []).map(function (e) {
                return String(e).toLowerCase();
              });
              if (allowed.indexOf(email) === -1) {
                entry.innerHTML = '';
                entry.appendChild(el('p', null, 'No tienes acceso al editor.'));
                return;
              }
              openEditor(email, resp.credential || '');
            })
            .catch(function () {
              status.textContent = 'No se pudo verificar el acceso. Intenta de nuevo.';
            });
        }
      });
      window.google.accounts.id.renderButton(btnBox, { theme: 'outline', size: 'large' });
    };
    script.onerror = function () {
      status.textContent = 'No se pudo cargar el inicio de sesión de Google. Revisa tu conexión.';
    };
    document.head.appendChild(script);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
