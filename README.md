# EYA-28 · Escala del Yo Algorítmico

Instrumento psicométrico digital para estudiantes universitarios (UCLV, Cuba).
HTML5 + CSS3 + JavaScript vanilla. **Cero dependencias externas.** ~22 KB.

## Estructura

| Archivo | Descripción |
|---|---|
| `index.html` | Estructura semántica, 6 pasos (bienvenida, demográficos, 4 módulos, cierre) |
| `styles.css` | Estilos mobile-first, animaciones solo GPU (`transform`/`opacity`) |
| `app.js` | Lógica, cronometraje `performance.now()`, anti-satisficing, `localStorage`, envío headless |
| `spss_syntax_master.sps` | Sintaxis SPSS: importa CSV, rotula, recodifica, computa subescalas, fiabilidad |

## Configurar el envío de datos (webhook)

La app envía las respuestas a un webhook de Google Apps Script que las guarda
directamente en tu hoja de cálculo. Sin entry IDs frágiles.

1. Ve a **script.google.com** → Nuevo proyecto.
2. Copia el contenido de `webhook.gs` (está en este repo), pégalo y guarda.
3. **Implementar → Nueva implementación → Aplicación web**:
   - Ejecutar como: **Yo**
   - Acceso: **Cualquier persona** (anónimo)
4. Copia la URL del despliegue (termina en `/exec`).
5. En `app.js`, reemplaza `PEGAR_URL_DEL_DESPLIEGUE_AQUI` con esa URL.
6. Haz commit del cambio — la app empezará a enviar datos reales.

La hoja de cálculo ya existe: **EYA-28 · Respuestas**, con encabezados listos.

## Flujo SPSS (3 clics)

1. En Google Sheets: **Archivo → Descargar → CSV**.
2. En `spss_syntax_master.sps`, ajuste la ruta del `GET DATA`.
3. En SPSS: abra el `.sps`, **Ctrl+A → Ejecutar**.

Obtiene: base rotulada, ítems invertidos recodificados (`EYA_01_R`, `EYA_04_R`),
subescalas `D1_COGNITIVA`, `D2_AFECTIVA`, `D3_CONDUCTUAL`, `D4_IDENTITARIA`,
`EYA_TOTAL`, filtros de calidad (`CALIDAD_OK`) y Alphas de Cronbach.

## Características técnicas

- **Offline-first:** `localStorage` guarda cada respuesta; ante apagón/corte, recarga y continúa donde quedó.
- **Anti-satisficing:** si 3 respuestas consecutivas < 1200 ms, modal de pausa de 5 s (una vez por sesión, `FLAG_RAPIDEZ=1`).
- **IMC:** `EYA_15` — debe marcar "Totalmente en desacuerdo" (`IMC_CONTROL`).
- **Ítems invertidos:** `EYA_01`, `EYA_04` (recodificados en SPSS).
- **Telemetría:** `RT_TOTAL_MS` (tiempo total), `FLAG_RAPIDEZ`.
- **Sin frameworks, sin CDNs, sin fuentes externas.** Todo local.

## Despliegue

GitHub Pages desde la rama `main` (carpeta raíz). Ver URL en la descripción del repositorio.
