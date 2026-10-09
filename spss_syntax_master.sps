* ============================================================.
* EYA-28 · Escala del Yo Algorítmico · Sintaxis maestra para IBM SPSS.
* Universidad Central "Marta Abreu" de Las Villas (UCLV).
* ------------------------------------------------------------.
* INSTRUCCIONES (3 clics):
*  1. Descargue el CSV desde Google Sheets (Archivo > Descargar > CSV).
*  2. Edite la ruta del archivo en el comando GET DATA de abajo.
*  3. Seleccione todo (Ctrl+A) y pulse Ejecutar.
* El script importa, rotula, recodifica invertidos, computa
* subescalas, filtra por calidad (IMC + velocidad) y corre fiabilidad.
* ============================================================.

* ---------- 1. IMPORTAR CSV ----------.
* NOTA: La primera columna es "Marca temporal" (la antepone el webhook).
GET DATA /TYPE=TXT
  /FILE='C:\datos\eya28_respuestas.csv'
  /DELCASE=LINE
  /DELIMITERS=","
  /QUALIFIER='"'
  /ARRANGEMENT=DELIMITED
  /FIRSTCASE=2
  /VARIABLES=
    MARCA_TEMPORAL A19
    ID_SUJETO A20
    EDAD F2.0
    SEXO F1.0
    CARRERA F1.0
    ANO_ACADEMICO F1.0
    USO_IA_FREQ F1.0
    EYA_01 F1.0 EYA_02 F1.0 EYA_03 F1.0 EYA_04 F1.0 EYA_05 F1.0
    EYA_06 F1.0 EYA_07 F1.0 EYA_08 F1.0 EYA_09 F1.0 EYA_10 F1.0
    EYA_11 F1.0 EYA_12 F1.0 EYA_13 F1.0 EYA_14 F1.0 EYA_15 F1.0
    EYA_16 F1.0 EYA_17 F1.0 EYA_18 F1.0 EYA_19 F1.0 EYA_20 F1.0
    EYA_21 F1.0 EYA_22 F1.0 EYA_23 F1.0 EYA_24 F1.0 EYA_25 F1.0
    EYA_26 F1.0 EYA_27 F1.0 EYA_28 F1.0
    RT_TOTAL_MS F10.0
    FLAG_RAPIDEZ F1.0
    IMC_CONTROL F1.0
  .
CACHE.
EXECUTE.

* ---------- 2. ETIQUETAS DE VARIABLE ----------.
VARIABLE LABELS
  MARCA_TEMPORAL 'Marca temporal del envío'
  ID_SUJETO 'Identificador anónimo del participante'
  EDAD 'Edad (17-35)'
  SEXO 'Sexo'
  CARRERA 'Carrera universitaria'
  ANO_ACADEMICO 'Año académico (1-5)'
  USO_IA_FREQ 'Frecuencia de uso de IA'
  EYA_01 'Reviso críticamente respuestas de la IA (INV)'
  EYA_02 'Acudo directo a la IA sin pensar primero'
  EYA_03 'Siento dominio aunque solo evalué el resultado'
  EYA_04 'Modifico explicaciones de la IA a mi criterio (INV)'
  EYA_05 'Pido resúmenes para evitar leer textos'
  EYA_06 'Capacidad mayor con IA que solo'
  EYA_07 'Prefiero que la IA plantee pasos lógicos'
  EYA_08 'Angustia sin conexión o apagones'
  EYA_09 'Tranquilidad al consultar IA bajo sobrecarga'
  EYA_10 'Frustración con tareas analógicas'
  EYA_11 'Temor a rezago si falla la IA'
  EYA_12 'Busco confirmación de la IA para mis ideas'
  EYA_13 'Impaciencia ante errores de la IA'
  EYA_14 'Paralizo tareas sin conexión'
  EYA_15 'Ítem de control atencional (IMC)'
  EYA_16 'Abrir chat IA es primer reflejo'
  EYA_17 'Copio-pego fragmentos de la IA'
  EYA_18 'Evito tareas complejas sin IA'
  EYA_19 'Instrucciones directas que resuelvan todo'
  EYA_20 'Abandoné fuentes primarias/biblioteca'
  EYA_21 'Rutina se detiene sin IA'
  EYA_22 'Preocupa desempeño profesional sin IA'
  EYA_23 'IA como extensión de mi mente'
  EYA_24 'Trabajos no reflejan mi voz personal'
  EYA_25 'Síndrome del impostor con IA'
  EYA_26 'Dificultad distinguir ideas propias vs IA'
  EYA_27 'Culpa ética por elogios a trabajos con IA'
  EYA_28 'IA impone puntos de vista estandarizados'
  RT_TOTAL_MS 'Tiempo total de respuesta (ms)'
  FLAG_RAPIDEZ 'Detección de velocidad (<1200ms x3)'
  IMC_CONTROL 'Control atencional (1=correcto)'.

* ---------- 3. ETIQUETAS DE VALOR ----------.
VALUE LABELS
  SEXO 1 'Masculino' 2 'Femenino'
  /CARRERA 1 'Ingeniería Industrial' 2 'Sociología' 3 'Otra'
  /ANO_ACADEMICO 1 '1ro' 2 '2do' 3 '3ro' 4 '4to' 5 '5to'
  /USO_IA_FREQ 1 'Rara vez/Nunca' 2 '1-2 veces/sem' 3 '3-4 veces/sem' 4 '5+ veces/sem'
  /EYA_01 TO EYA_28
    1 'Totalmente en desacuerdo'
    2 'En desacuerdo'
    3 'Ni de acuerdo ni en desacuerdo'
    4 'De acuerdo'
    5 'Totalmente de acuerdo'
  /FLAG_RAPIDEZ 0 'No' 1 'Sí'
  /IMC_CONTROL 0 'Falló' 1 'Correcto'.
EXECUTE.

* ---------- 4. NIVELES DE MEDIDA ----------.
VARIABLE LEVEL
  SEXO CARRERA (NOMINAL)
  /EDAD ANO_ACADEMICO USO_IA_FREQ EYA_01 TO EYA_28 (ORDINAL)
  /RT_TOTAL_MS (SCALE)
  /FLAG_RAPIDEZ IMC_CONTROL (NOMINAL).
EXECUTE.

* ---------- 5. RECODIFICAR ÍTEMS INVERTIDOS ----------.
RECODE EYA_01 EYA_04 (1=5) (2=4) (3=3) (4=2) (5=1) INTO EYA_01_R EYA_04_R.
VARIABLE LABELS
  EYA_01_R 'Reviso críticamente (recodificado)'
  EYA_04_R 'Modifico a mi criterio (recodificado)'.
EXECUTE.

* ---------- 6. PUNTUACIONES COMPUESTAS ----------.
COMPUTE D1_COGNITIVA = SUM(EYA_01_R, EYA_02, EYA_03, EYA_04_R, EYA_05, EYA_06, EYA_07).
COMPUTE D2_AFECTIVA = SUM(EYA_08, EYA_09, EYA_10, EYA_11, EYA_12, EYA_13, EYA_14).
COMPUTE D3_CONDUCTUAL = SUM(EYA_16, EYA_17, EYA_18, EYA_19, EYA_20, EYA_21).
COMPUTE D4_IDENTITARIA = SUM(EYA_22, EYA_23, EYA_24, EYA_25, EYA_26, EYA_27, EYA_28).
COMPUTE EYA_TOTAL = SUM(D1_COGNITIVA, D2_AFECTIVA, D3_CONDUCTUAL, D4_IDENTITARIA).
VARIABLE LABELS
  D1_COGNITIVA 'Subescala D1 Cognitiva (7-35)'
  D2_AFECTIVA 'Subescala D2 Afectiva (7-35)'
  D3_CONDUCTUAL 'Subescala D3 Conductual (6-30)'
  D4_IDENTITARIA 'Subescala D4 Identitaria (7-35)'
  EYA_TOTAL 'Puntuación total EYA-28 (27-135)'.
VARIABLE LEVEL D1_COGNITIVA D2_AFECTIVA D3_CONDUCTUAL D4_IDENTITARIA EYA_TOTAL (SCALE).
EXECUTE.

* ---------- 7. FILTRADO DE CALIDAD ----------.
* Excluir: falló IMC, flag de velocidad, o tiempo total biológicamente imposible (<90 s).
COMPUTE CALIDAD_OK = (IMC_CONTROL = 1 AND FLAG_RAPIDEZ = 0 AND RT_TOTAL_MS >= 90000).
VARIABLE LABELS CALIDAD_OK 'Pasa filtros de calidad (1=sí)'.
VALUE LABELS CALIDAD_OK 0 'Excluir' 1 'Incluir'.
FREQUENCIES VARIABLES=CALIDAD_OK.
* Para análisis: filtrar a casos válidos.
* FILTER BY CALIDAD_OK.  /* descomentar para aplicar */.

* ---------- 8. FIABILIDAD (Alpha de Cronbach) ----------.
RELIABILITY
  /VARIABLES=EYA_01_R EYA_02 EYA_03 EYA_04_R EYA_05 EYA_06 EYA_07
  /SCALE('D1 Cognitiva') ALL
  /MODEL=ALPHA
  /STATISTICS=DESCRIPTIVE CORR
  /SUMMARY=TOTAL.
RELIABILITY
  /VARIABLES=EYA_08 EYA_09 EYA_10 EYA_11 EYA_12 EYA_13 EYA_14
  /SCALE('D2 Afectiva') ALL
  /MODEL=ALPHA
  /STATISTICS=DESCRIPTIVE CORR
  /SUMMARY=TOTAL.
RELIABILITY
  /VARIABLES=EYA_16 EYA_17 EYA_18 EYA_19 EYA_20 EYA_21
  /SCALE('D3 Conductual') ALL
  /MODEL=ALPHA
  /STATISTICS=DESCRIPTIVE CORR
  /SUMMARY=TOTAL.
RELIABILITY
  /VARIABLES=EYA_22 EYA_23 EYA_24 EYA_25 EYA_26 EYA_27 EYA_28
  /SCALE('D4 Identitaria') ALL
  /MODEL=ALPHA
  /STATISTICS=DESCRIPTIVE CORR
  /SUMMARY=TOTAL.

* ---------- 9. DESCRIPTIVOS ----------.
FREQUENCIES VARIABLES=EDAD SEXO CARRERA ANO_ACADEMICO USO_IA_FREQ
  /STATISTICS=MEAN MEDIAN MODE STDDEV MIN MAX.
DESCRIPTIVES VARIABLES=D1_COGNITIVA D2_AFECTIVA D3_CONDUCTUAL D4_IDENTITARIA EYA_TOTAL
  /STATISTICS=MEAN STDDEV MIN MAX.
