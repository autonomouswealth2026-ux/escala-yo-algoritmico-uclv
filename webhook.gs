/**
 * EYA-28 · Webhook receptor de respuestas
 * Recibe JSON por POST y lo guarda en la hoja "EYA-28 · Respuestas".
 *
 * INSTALACIÓN (2 minutos):
 * 1. Ve a script.google.com → Nuevo proyecto
 * 2. Pega este código, guarda (Ctrl+S)
 * 3. Implementar → Nueva implementación → Aplicación web
 *    - Ejecutar como: Yo
 *    - Acceso: Cualquier persona (anónimo)
 * 4. Copia la URL del despliegue y pégala en app.js (WEBHOOK_URL)
 */

const SHEET_ID = '1uhzMKaYKW6BcMbDSKqYCCW69-KEErNXeywIGCL9JEUo';
const SHEET_NAME = 'Hoja 1'; // Ajustar si la pestaña tiene otro nombre

const COLUMNS = [
  'ID_SUJETO', 'EDAD', 'SEXO', 'CARRERA', 'ANO_ACADEMICO', 'USO_IA_FREQ',
  'EYA_01', 'EYA_02', 'EYA_03', 'EYA_04', 'EYA_05', 'EYA_06', 'EYA_07',
  'EYA_08', 'EYA_09', 'EYA_10', 'EYA_11', 'EYA_12', 'EYA_13', 'EYA_14',
  'EYA_15', 'EYA_16', 'EYA_17', 'EYA_18', 'EYA_19', 'EYA_20', 'EYA_21',
  'EYA_22', 'EYA_23', 'EYA_24', 'EYA_25', 'EYA_26', 'EYA_27', 'EYA_28',
  'RT_TOTAL_MS', 'FLAG_RAPIDEZ', 'IMC_CONTROL'
];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // Validación básica
    if (!data.ID_SUJETO) {
      return jsonOut({ ok: false, error: 'Falta ID_SUJETO' });
    }
    for (let i = 1; i <= 28; i++) {
      const k = 'EYA_' + String(i).padStart(2, '0');
      const v = Number(data[k]);
      if (!(v >= 1 && v <= 5)) {
        return jsonOut({ ok: false, error: 'Valor inválido en ' + k });
      }
    }

    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    const row = [new Date()].concat(COLUMNS.map(c => data[c] !== undefined ? data[c] : ''));
    sheet.appendRow(row);

    return jsonOut({ ok: true, id: data.ID_SUJETO });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function doGet() {
  return jsonOut({ ok: true, service: 'EYA-28 webhook', status: 'activo' });
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
