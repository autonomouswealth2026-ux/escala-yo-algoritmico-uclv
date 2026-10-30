/* EYA-28 · Configuración del panel de edición (PROTOTIPO)
 *
 * GOOGLE_CLIENT_ID: identificador de cliente OAuth 2.0 de Google
 * (aplicación web) para el inicio de sesión con Google Identity Services.
 *
 * VALOR ACTUAL: marcador, NO un ID real. Con el marcador, el editor
 * muestra el aviso de configuración pendiente y NO intenta iniciar
 * sesión. Ver README.md para crear el cliente real y dónde pegar el ID.
 *
 * relayUrl: URL de la aplicación web del relay de publicación
 * (Apps Script, ver relay-publicar.gs y PASOS_PUBLICAR.md). Vacía
 * hasta que el relay esté desplegado: con ella vacía, el botón
 * «Publicar» avisa que falta ese paso y no envía nada.
 */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : globalThis;
  root.EYA_EDITOR_CONFIG = {
    clientId: '389001527752-qo8jjpt77m30ljjp7opuhgfp7b4tbv27.apps.googleusercontent.com',
    relayUrl: 'https://script.google.com/macros/s/AKfycbwoffmpWQ_ClS5p-hHOS_XCd3RlOC5iH-K-gd3xLR6vPgvsHD0UMMZotYXLyUyM5xumTg/exec'
  };
})();
