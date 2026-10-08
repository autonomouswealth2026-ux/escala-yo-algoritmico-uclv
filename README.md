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

## Configurar Google Forms (headless)

1. Cree un Google Form con 38 preguntas de texto corto (una por variable):
   `ID_SUJETO`, `EDAD`, `SEXO`, `CARRERA`, `ANO_ACADEMICO`, `USO_IA_FREQ`,
   `EYA_01`…`EYA_28`, `RT_TOTAL_MS`, `FLAG_RAPIDEZ`, `IMC_CONTROL`.
2. Abra el formulario en modo vista previa → clic derecho → *Ver código fuente*.
3. Busque `entry.` — cada pregunta tiene un ID como `entry.1234567890`.
4. En `app.js`, reemplace la URL en `FORM_CFG.url` y cada ID en `FORM_CFG.entries`.
5. Vincule el Form a una Google Sheet (Respuestas → hoja de cálculo).

El envío usa `fetch` con `mode: 'no-cors'` — silencioso, sin redirección.

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
