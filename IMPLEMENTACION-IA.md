# UNIBE Elect — Especificación de implementación para una IA

> **Para la persona que usa este archivo:** colócalo en la raíz del repositorio `unibe-elect` y dile a tu agente de programación (Claude Code, Cursor, etc.): *«Lee `IMPLEMENTACION-IA.md` completo y ejecútalo fase por fase. No te salgas del alcance definido ahí.»*
>
> **Para la IA:** este documento es tu única fuente de verdad sobre el alcance. Es **cerrado**: lo que está aquí se hace completo; lo que no está aquí, no se hace. Léelo entero antes de escribir una sola línea.

---

## 1. Objetivo y resultado final

Implementar **por completo** el sistema UNIBE Elect (votaciones estudiantiles) sobre el repositorio base que ya existe, de modo que al terminar:

1. Existen **cuatro microservicios funcionales y conectados entre sí** (Identidad, Elecciones, Votación, Resultados), un gateway y un frontend **sencillo** en React.
2. Todo arranca con **un solo comando** desde la raíz del repositorio, sin pasos previos: `docker compose up --build`.
3. Se puede recorrer el flujo completo desde el navegador: el administrador crea y publica una elección, los estudiantes votan una sola vez de forma anónima, el administrador cierra la elección, genera el escrutinio y publica los resultados, y los estudiantes los ven.
4. Un script automático (`node scripts/e2e.js`) comprueba ese flujo completo contra el sistema levantado y termina con éxito.

El diseño visual **no es objetivo** de esta entrega: el frontend debe ser funcional, limpio y simple. Más adelante el equipo decidirá una mejora de diseño.

---

## 2. Punto de partida (ya existe, no lo rehagas)

El repositorio base ya contiene, funcionando:

- Estructura de carpetas: `services/{identidad,elecciones,votacion,resultados}`, `gateway`, `frontend`, `infra/postgres`, `docs`, `keys`, `scripts`.
- Cada servicio: Express 5 en **CommonJS**, `GET /health`, middlewares (`autenticar`, `requerirRol`, `claveInterna`, `validar`, manejo central de errores, registro de peticiones), utilidades de respuestas, paginación y errores, cliente interno `llamarInterno`, clientes hacia otros servicios con modo simulado (`USAR_MOCKS`), `openapi.yaml` (resúmenes), `README.md` por módulo y pruebas Jest + Supertest.
- Gateway con proxy por prefijo, CORS, límites de peticiones y bloqueo de `/internal`.
- Frontend React + Vite con rutas por módulo en `src/features/*` y cliente HTTP en `src/shared/api/cliente.js`.
- `docker-compose.yml` de desarrollo, `infra/postgres/init-dbs.sh` (una base y un usuario por servicio), CI en `.github/workflows/ci.yml`, ESLint y Prettier.
- Documentos de referencia que **debes leer primero**: `README.md`, `docs/CONTRATOS.md`, `docs/FLUJO-GIT.md` y el `README.md` de cada módulo.

Antes de cambiar nada, **comprueba la línea base**: levanta el sistema actual y confirma que los `/health` responden. Si no puedes ejecutar Docker en tu entorno, dilo explícitamente al inicio y en el reporte final: no puedes declarar nada como «verificado» sin haberlo ejecutado.

---

## 3. Límites del trabajo (alcance cerrado)

### 3.1 Qué DEBES hacer

- Implementar todos los endpoints definidos en las secciones 7 a 10, con los formatos exactos indicados.
- Persistir los datos con **Prisma + PostgreSQL**, una base de datos por servicio, con **migraciones versionadas** en el repositorio.
- Implementar la autenticación JWT (RS256), los roles, las llamadas internas entre servicios y las reglas de anonimato.
- Construir el frontend sencillo de la sección 12.
- Lograr el arranque con un solo comando (sección 4).
- Escribir las pruebas y el script `e2e` (sección 13).
- Actualizar `openapi.yaml` de cada servicio para que coincida con lo implementado, y los `README.md` (sección 17).

### 3.2 Qué NO DEBES hacer (fuera de alcance)

- No agregar funcionalidades que no estén aquí: **nada** de verificación de correo, recuperación de contraseña, refresh tokens, notificaciones, WebSockets, resultados en vivo, voto con varias papeletas/cargos, exportación a PDF, subida de imágenes (la foto de una candidatura es solo una URL de texto), internacionalización, modo oscuro ni paneles de estadísticas extra.
- No introducir un broker de mensajes (RabbitMQ, Kafka, etc.): la comunicación entre servicios es **HTTP síncrono** por rutas `/internal`.
- No migrar a TypeScript, no cambiar Express 5, no cambiar CommonJS en los servicios, no cambiar de ORM.
- No agregar librerías de UI, de estado global, de formularios, de gráficos ni frameworks de CSS en el frontend. Solo `react`, `react-dom` y `react-router-dom`. Los gráficos de resultados son barras hechas con CSS.
- No agregar servicios, contenedores ni bases de datos nuevos (la única adición permitida es el contenedor auxiliar de claves de la sección 4).
- No reestructurar carpetas ni renombrar archivos existentes salvo que esta especificación lo indique.
- No cambiar los contratos de `docs/CONTRATOS.md` ni las rutas de los `openapi.yaml`. Si algo es imposible de cumplir, regístralo como desviación (sección 3.4) en lugar de cambiarlo en silencio.
- No hacer `git push`, no tocar ramas remotas ni configurar el repositorio remoto.
- No dejar código muerto, comentarios de relleno ni `TODO` sin resolver en lo entregado.

### 3.3 Decisiones ya tomadas (no se discuten)

- Backend: Node.js 20, Express 5, CommonJS. Base de datos: PostgreSQL 16. ORM y migraciones: **Prisma** (versión 7, ver sección 5) en los **cuatro** servicios.
- Frontend: React 18 + Vite + react-router-dom 6, JavaScript (sin TypeScript), CSS plano en un único `styles.css` con variables CSS (para facilitar un rediseño posterior).
- Idioma: toda la interfaz, mensajes de error y documentación en **español**. Nombres de campos de API en español y camelCase.
- Roles: `ESTUDIANTE` y `ADMINISTRADOR`. Un administrador **no vota**.
- Una elección = un cargo. Se vota por una candidatura **o en blanco**.

### 3.4 Desviaciones permitidas respecto a la documentación previa (las únicas)

1. **Abrir una elección de inmediato.** Al publicar, `fechaApertura` puede ser hasta 5 minutos anterior al momento actual (en lugar de exigir fecha futura), para poder abrir elecciones al instante en demostraciones. El formulario del frontend ofrece una casilla «Abrir ahora» que usa la hora actual.
2. **Importación CSV por JSON.** `POST /api/v1/usuarios/importar` recibe `{ "csv": "<contenido del archivo>" }` (no multipart). El frontend lee el archivo con `FileReader` y lo envía como texto. Solo en esta ruta, el límite del cuerpo sube a 5 MB.
3. **Cancelar** solo aplica a elecciones `PUBLICADA` que no estén `CERRADA`. Un borrador se elimina, no se cancela.
4. **Dominio de correo.** Si `DOMINIO_CORREO_INSTITUCIONAL` está vacío, se acepta cualquier correo válido. Los datos de prueba usan el dominio ficticio `unibe.edu.ec` (el real está pendiente de definir).
5. **Claves JWT mediante volúmenes de Docker** en lugar de la carpeta `keys/` del anfitrión (ver sección 4).

Cualquier otra desviación debe documentarse en `docs/DECISIONES.md` (qué, por qué y qué alternativa se descartó) y mencionarse en el reporte final.

### 3.5 Si algo es ambiguo

No te detengas a preguntar salvo bloqueo real. Elige la opción **más simple que sea coherente** con `docs/CONTRATOS.md` y con este documento, y regístrala en `docs/DECISIONES.md`.

---

## 4. Arranque con un solo comando

**Requisito:** en una máquina limpia con Docker (sin `node_modules`, sin `.env`, sin claves generadas), desde la raíz:

`docker compose up --build`

debe dejar el sistema completamente funcional, **sin ningún paso previo** (nada de `npm install`, `npm run claves` ni copiar `.env`). Para lograrlo:

1. **Claves JWT automáticas.** Añade un servicio auxiliar `claves` en `docker-compose.yml` (imagen `node:20-alpine`, ejecuta `scripts/generar-claves.js` adaptado para leer las rutas de salida desde variables de entorno). Escribe la clave **privada** en un volumen nombrado `jwt_private` y la **pública** en otro volumen `jwt_public`. Es idempotente (no regenera si ya existen). Identidad monta ambos volúmenes; los otros tres servicios montan **solo** `jwt_public` en solo lectura. Todos los servicios dependen de `claves` con la condición `service_completed_successfully`. Deja de montar `./keys` y mantén `npm run claves` solo como utilidad opcional.
2. **Sin `.env` obligatorio.** Todas las variables tienen valores por defecto de desarrollo dentro de `docker-compose.yml` (ya usa `${VAR:-valor}`). El `.env.example` queda como referencia opcional.
3. **Bases de datos y usuarios** se crean con `infra/postgres/init-dbs.sh`. Agrega `CREATEDB` a cada `CREATE USER` (solo desarrollo) para que Prisma pueda crear la base sombra al generar migraciones.
4. **Migraciones automáticas.** Cada servicio, al arrancar, ejecuta `prisma generate` y `prisma migrate deploy` (script `predev` en `package.json`). Identidad además ejecuta su **seed idempotente** (sección 7.5).
5. **Healthchecks.** Cada servicio define un `healthcheck` de Compose contra su `GET /health` (con `wget -qO-` dentro de la imagen alpine). El gateway depende de los cuatro servicios en estado `service_healthy`; el frontend depende del gateway `service_healthy`. Así, cuando el comando termina de levantar, todo está listo.
6. **Límites del gateway configurables.** Los límites de peticiones del gateway pasan a leerse de variables de entorno (`LIMITE_GENERAL`, `LIMITE_LOGIN`, `LIMITE_VOTACION`) con los valores actuales como predeterminados. En `docker-compose.yml` (desarrollo) se fijan valores altos (por ejemplo 100000) para que `scripts/e2e.js` pueda ejecutarse varias veces sin ser bloqueado.
7. **Reinicio limpio:** `docker compose down -v && docker compose up --build` debe funcionar siempre desde cero.
8. Documenta en el `README.md` raíz **solo** este comando como forma de arrancar, además de `docker compose up --build -V` para cuando cambien dependencias (por los volúmenes anónimos de `node_modules`) y `docker compose down -v` para reiniciar los datos.

**Señal de «listo»:** `http://localhost:3000/health` responde `ok`, `http://localhost:5173` carga el frontend y `node scripts/e2e.js` termina con código 0.

---

## 5. Prisma: notas técnicas comunes a los cuatro servicios

Verifica en la documentación oficial vigente antes de aplicar; Prisma 7 cambió respecto a versiones anteriores:

- Dependencias por servicio: `prisma` (dev), `@prisma/client` y `@prisma/adapter-pg` (producción). `pg` ya está instalado. `prisma` y `@prisma/client` en la **misma versión mayor** (7).
- Archivo `prisma.config.ts` en la raíz de cada servicio: importa `dotenv/config` (Prisma no carga el `.env` solo), indica la ruta del esquema, la carpeta de migraciones y la URL desde `DATABASE_URL`.
- En `prisma/schema.prisma`: generador `prisma-client`, `output = "../generated/prisma"` y **`moduleFormat = "cjs"`** (los servicios son CommonJS). El bloque `datasource` solo declara `provider = "postgresql"`.
- El cliente se instancia en `src/config/prisma.js` con el adaptador `PrismaPg` alimentado por `DATABASE_URL`, y se exporta como **instancia única**. Elimina el `Pool` de `pg` de `src/config/db.js` y haz que `comprobarConexion` ejecute un `SELECT 1` con Prisma.
- La carpeta `generated/` se agrega al `.gitignore`. Las carpetas `prisma/migrations` (incluido `migration_lock.toml`) **sí se versionan**. Borra las carpetas vacías `migrations/` del esqueleto.
- `migrate dev` no genera el cliente automáticamente en Prisma 7: ejecuta `prisma generate` de forma explícita.
- Si en Alpine aparece un error relacionado con `openssl`, agrega `RUN apk add --no-cache openssl` al Dockerfile.
- **CI:** agrega a `.github/workflows/ci.yml` un paso `npx prisma generate` (con una `DATABASE_URL` de relleno) antes de `npm test` en los cuatro servicios.
- Todas las reglas de unicidad críticas (doble voto, correo, código estudiantil, comprobante, un escrutinio por elección) se declaran **en el esquema** (`@unique` / `@@unique`), no solo en código.

---

## 6. Convenciones y códigos de error

Se respetan íntegramente las convenciones de `docs/CONTRATOS.md` (prefijo `/api/v1`, formato `{ data }` / `{ data, meta }` / `{ error: { codigo, mensaje } }`, paginación `pagina`/`limite`, UUID, fechas ISO 8601 UTC, `X-Internal-Key`, token con `sub`, `rol`, `correo`, `facultad`, `carrera`).

Códigos de error estables que **debes** usar (los `mensaje` van en español, legibles):

| Módulo | Código | HTTP |
| --- | --- | --- |
| Común | `DATOS_INVALIDOS`, `NO_AUTENTICADO`, `SIN_PERMISO`, `NO_ENCONTRADO`, `ERROR_INTERNO` | 400, 401, 403, 404, 500 |
| Identidad | `CORREO_EXISTENTE`, `CODIGO_EXISTENTE` | 409 |
| Identidad | `CORREO_NO_INSTITUCIONAL` | 422 |
| Identidad | `CREDENCIALES_INVALIDAS` | 401 |
| Identidad | `DEMASIADOS_INTENTOS` | 429 |
| Elecciones | `ELECCION_NO_EDITABLE`, `CANDIDATURAS_INSUFICIENTES`, `FECHAS_INVALIDAS`, `ELECCION_NO_ABIERTA`, `ELECCION_NO_CANCELABLE` | 422 |
| Votación | `NO_HABILITADO` | 403 |
| Votación | `YA_VOTO` | 409 |
| Votación | `ELECCION_NO_ABIERTA`, `CANDIDATURA_INVALIDA`, `ELECCION_NO_CERRADA` | 422 |
| Resultados | `ELECCION_NO_CERRADA`, `ESCRUTINIO_NO_GENERADO` | 422 |
| Gateway | `SERVICIO_NO_DISPONIBLE`, `DEMASIADAS_PETICIONES` | 502/503, 429 |

Todo endpoint valida su entrada con `validar(...)` (Zod) y responde `400 DATOS_INVALIDOS` con `detalles` por campo.

---

## 7. Módulo Identidad (puerto 4001, base `unibe_identidad`)

### 7.1 Modelo de datos (Prisma)

Enums `Rol` (`ESTUDIANTE`, `ADMINISTRADOR`) y `Estado` (`ACTIVO`, `INACTIVO`). Modelo `Usuario` mapeado a la tabla `usuarios`: `id` (UUID), `nombres`, `apellidos`, `correo` (único, en minúsculas), `contrasenaHash`, `codigoEstudiantil` (único), `facultad`, `carrera`, `rol` (por defecto `ESTUDIANTE`), `estado` (por defecto `ACTIVO`), `creadoEn`, `actualizadoEn`; índice en (`facultad`, `carrera`).

### 7.2 Endpoints públicos

- `POST /api/v1/auth/registro` — cuerpo: `nombres`, `apellidos`, `correo`, `contrasena` (mínimo 8 caracteres), `codigoEstudiantil`, `facultad`, `carrera`. Crea siempre rol `ESTUDIANTE`. **201** con `data` = usuario (sin contraseña). Errores: `CORREO_EXISTENTE`, `CODIGO_EXISTENTE`, `CORREO_NO_INSTITUCIONAL`.
- `POST /api/v1/auth/login` — cuerpo: `correo`, `contrasena`. **200** con `data: { token, usuario }`. El token es un JWT **RS256** de 1 hora con `sub`, `rol`, `correo`, `facultad`, `carrera`. Credenciales incorrectas, correo inexistente o usuario inactivo responden **el mismo** `401 CREDENCIALES_INVALIDAS`. Tras 5 intentos fallidos del mismo correo en 15 minutos responde `429 DEMASIADOS_INTENTOS` (contador en memoria; se reinicia con un login exitoso).
- `GET /api/v1/auth/me` — autenticado. `data` = usuario actual.
- `POST /api/v1/auth/cambiar-contrasena` — autenticado. Cuerpo: `contrasenaActual`, `contrasenaNueva` (mínimo 8). **204**. `401 CREDENCIALES_INVALIDAS` si la actual es incorrecta.
- `GET /api/v1/auth/clave-publica` — público. `data: { clavePublica }` (PEM).

El objeto **usuario** que se devuelve siempre tiene: `id`, `nombres`, `apellidos`, `correo`, `codigoEstudiantil`, `facultad`, `carrera`, `rol`, `estado`, `creadoEn`.

### 7.3 Endpoints de administración (rol `ADMINISTRADOR`)

- `GET /api/v1/usuarios` — lista paginada; filtros `facultad`, `carrera`, `rol`, `estado`, `busqueda` (coincidencia parcial, sin distinguir mayúsculas, en nombres, apellidos, correo y código).
- `GET /api/v1/usuarios/:id` — detalle (`404 NO_ENCONTRADO`).
- `PATCH /api/v1/usuarios/:id` — admite `nombres`, `apellidos`, `facultad`, `carrera`, `estado`.
- `PATCH /api/v1/usuarios/:id/rol` — cuerpo `{ rol }`. Un administrador no puede quitarse su propio rol (`422 DATOS_INVALIDOS`).
- `POST /api/v1/usuarios/importar` — cuerpo `{ csv }`. La primera fila es el encabezado con las columnas `nombres,apellidos,correo,codigoEstudiantil,facultad,carrera,contrasena`. Máximo 2000 filas. **200** con `data: { creados, omitidos, errores: [{ fila, motivo }] }`. Una fila duplicada o inválida no detiene el resto.

### 7.4 Endpoint interno

- `GET /internal/usuarios/conteo?facultades=a,b&carreras=x,y` — solo usuarios `ACTIVO` con rol `ESTUDIANTE`; filtros vacíos = todos. Formato en `docs/CONTRATOS.md`: `{ data: { total, porGrupo: [{ facultad, carrera, total }] } }`.

### 7.5 Datos de prueba (seed idempotente, se ejecuta al arrancar)

Usa «upsert» por correo para que reiniciar no duplique nada.

- 1 administrador: `admin@unibe.edu.ec` / `Admin12345!`.
- 12 estudiantes `estudiante01@unibe.edu.ec` … `estudiante12@unibe.edu.ec`, todos con contraseña `Estudiante123!`, códigos `E0001`…`E0012`, distribuidos así: 01–04 Ingeniería / Software; 05–06 Ingeniería / Sistemas; 07–09 Ciencias Empresariales / Administración; 10–12 Derecho / Derecho.

El script `e2e` y la documentación dependen de estas credenciales exactas.

---

## 8. Módulo Elecciones (puerto 4002, base `unibe_elecciones`)

### 8.1 Modelo de datos

- `Eleccion`: `id`, `titulo`, `descripcion` (opcional), `fechaApertura`, `fechaCierre`, `facultadesPermitidas` (lista de texto, vacía = todas), `carrerasPermitidas` (lista de texto, vacía = todas), `estadoGuardado` (`BORRADOR` | `PUBLICADA` | `CANCELADA`, por defecto `BORRADOR`), `creadaPor`, `creadoEn`, `actualizadoEn`.
- `Candidatura`: `id`, `eleccionId` (relación con borrado en cascada), `nombre`, `descripcion` (opcional), `fotoUrl` (opcional, solo URL), `orden` (entero, por defecto 0).

### 8.2 Estado efectivo (se calcula, nunca se guarda ni usa tareas programadas)

- `estadoGuardado` = `BORRADOR` → `BORRADOR`; `CANCELADA` → `CANCELADA`.
- `PUBLICADA` → `PROGRAMADA` si ahora < `fechaApertura`; `ABIERTA` si `fechaApertura` ≤ ahora < `fechaCierre`; `CERRADA` si ahora ≥ `fechaCierre`.

Toda respuesta que incluya una elección expone el campo `estado` con el **estado efectivo**.

### 8.3 Formas de respuesta

- **Elección:** `id`, `titulo`, `descripcion`, `fechaApertura`, `fechaCierre`, `facultadesPermitidas`, `carrerasPermitidas`, `estado`, `creadoEn`, `actualizadoEn`. El detalle (`GET /:id`) añade `candidaturas`.
- **Candidatura:** `id`, `eleccionId`, `nombre`, `descripcion`, `fotoUrl`, `orden`.

### 8.4 Endpoints de administración (rol `ADMINISTRADOR`)

- `POST /api/v1/elecciones` — cuerpo: `titulo`, `descripcion?`, `fechaApertura`, `fechaCierre`, `facultadesPermitidas?`, `carrerasPermitidas?`. **201**, queda en borrador. `fechaCierre` debe ser posterior a `fechaApertura` (`FECHAS_INVALIDAS`).
- `PATCH /api/v1/elecciones/:id` y `DELETE /api/v1/elecciones/:id` — solo en `BORRADOR` (`422 ELECCION_NO_EDITABLE`). DELETE responde 204.
- `POST /api/v1/elecciones/:id/publicar` — solo desde `BORRADOR`. Exige al menos **2 candidaturas** (`CANDIDATURAS_INSUFICIENTES`) y fechas válidas: cierre posterior a apertura y apertura no anterior a 5 minutos atrás (`FECHAS_INVALIDAS`). Devuelve la elección.
- `POST /api/v1/elecciones/:id/cerrar` — solo si el estado efectivo es `ABIERTA` (`422 ELECCION_NO_ABIERTA`); fija `fechaCierre` = ahora.
- `POST /api/v1/elecciones/:id/cancelar` — solo si `estadoGuardado` es `PUBLICADA` y el estado efectivo no es `CERRADA` (`422 ELECCION_NO_CANCELABLE`).
- `POST /api/v1/elecciones/:id/candidaturas`, `PATCH …/candidaturas/:candidaturaId`, `DELETE …/candidaturas/:candidaturaId` — solo en `BORRADOR` (`422 ELECCION_NO_EDITABLE`). Cuerpo de alta: `nombre`, `descripcion?`, `fotoUrl?`, `orden?`.

### 8.5 Endpoints para usuarios autenticados

- `GET /api/v1/elecciones` — lista paginada, filtro opcional `estado` (sobre el estado efectivo). La administración ve todas; el estudiante **no** ve borradores.
- `GET /api/v1/elecciones/disponibles` — rol `ESTUDIANTE`. Elecciones con estado efectivo `ABIERTA` en las que su `facultad` y `carrera` (del token) son elegibles. Cada elemento es una elección más `yaVoto` (booleano), obtenido de Votación con `participaciones/consultar`. **Declarar esta ruta antes de `/:id`.**
- `GET /api/v1/elecciones/:id` — detalle. Un estudiante recibe `404 NO_ENCONTRADO` si es un borrador.
- `GET /api/v1/elecciones/:id/candidaturas` — lista ordenada por `orden`. Mismo criterio de visibilidad.

### 8.6 Endpoints internos

- `POST /internal/elecciones/:id/validar-voto` — cuerpo `{ facultad, carrera, candidaturaId }`. Evalúa en este orden y devuelve el primer fallo: `ELECCION_NO_ABIERTA` (estado efectivo distinto de `ABIERTA`), `NO_HABILITADO` (facultad/carrera fuera de los criterios), `CANDIDATURA_INVALIDA` (id que no pertenece a la elección; `null` = voto en blanco, siempre válido). Responde `{ data: { valido: true } }` o `{ data: { valido: false, motivo } }`.
- `GET /internal/elecciones/:id` — elección completa con `candidaturas`, criterios y `estado` efectivo, en el formato de `docs/CONTRATOS.md`.

### 8.7 Elegibilidad

Un estudiante es elegible si (`facultadesPermitidas` está vacía **o** contiene su facultad) **y** (`carrerasPermitidas` está vacía **o** contiene su carrera). Comparación exacta tras recortar espacios.

---

## 9. Módulo Votación (puerto 4003, base `unibe_votacion`)

### 9.1 Modelo de datos — dos tablas **sin relación entre sí**

- `Participacion`: `id`, `eleccionId`, `usuarioId`, `facultad`, `carrera`, `comprobante` (único), `fecha`. Restricción `@@unique([eleccionId, usuarioId])`.
- `Voto`: `id` (UUID **aleatorio**), `eleccionId`, `candidaturaId` (nulo = voto en blanco), `dia` (tipo fecha, **sin hora**). Índice en `eleccionId`. **Sin ninguna columna ni relación que apunte a un usuario ni a `Participacion`.**

### 9.2 Endpoints (rol `ESTUDIANTE`; un administrador recibe `403 SIN_PERMISO`)

- `POST /api/v1/votacion/elecciones/:id/votos` — cuerpo `{ candidaturaId }` (cadena o `null`).
  1. Llama a Elecciones `validar-voto` con la facultad y carrera **del token**. Si no es válido: `NO_HABILITADO` → 403; `ELECCION_NO_ABIERTA` y `CANDIDATURA_INVALIDA` → 422.
  2. Abre **una transacción** de Prisma que crea la `Participacion` y el `Voto`.
  3. Si la unicidad de `Participacion` se viola (error `P2002`), revierte y responde `409 YA_VOTO`.
  4. **201** con `data: { comprobante, fecha }`. El comprobante es un código aleatorio (12 caracteres alfanuméricos en mayúsculas, generado con `crypto`).
- `GET /api/v1/votacion/elecciones/:id/mi-participacion` — `data: { haVotado, fecha?, comprobante? }`. Nunca revela por quién votó.

### 9.3 Endpoints internos

- `GET /internal/votacion/elecciones/:id/conteo` — solo si Elecciones indica estado efectivo `CERRADA`; si no, `422 ELECCION_NO_CERRADA`. Devuelve `{ totalVotos, votosEnBlanco, porCandidatura: [{ candidaturaId, votos }] }`.
- `GET /internal/votacion/elecciones/:id/participacion` — misma condición. Devuelve `{ total, porGrupo: [{ facultad, carrera, votaron }] }` calculado desde `Participacion`.
- `POST /internal/votacion/participaciones/consultar` — cuerpo `{ eleccionIds, usuarioId }`; devuelve `{ eleccionesVotadas: [ids] }`.

### 9.4 Reglas de anonimato (obligatorias y verificables)

- Ningún log, tabla, campo ni respuesta relaciona a un usuario con una candidatura. El cuerpo de las peticiones de voto no se registra (ni aquí ni en el gateway).
- No se guarda la hora exacta del voto, solo el día; los ids de voto son UUID aleatorios.
- La garantía contra el doble voto es la restricción única de la base de datos, no una consulta previa. Diez peticiones simultáneas del mismo estudiante deben producir exactamente **1** voto y **9** respuestas `409 YA_VOTO`.
- El comprobante solo confirma participación.

---

## 10. Módulo Resultados (puerto 4004, base `unibe_resultados`)

### 10.1 Modelo de datos

- `Escrutinio`: `id`, `eleccionId` (**único**), `titulo` (copia), `estado` (`GENERADO` | `PUBLICADO`), `totalVotos`, `votosEnBlanco`, `totalHabilitados`, `participacion` (decimal, porcentaje), `empate` (booleano), `generadoEn`, `publicadoEn?`.
- `EscrutinioCandidatura`: `escrutinioId`, `candidaturaId`, `nombre` (copia), `votos`, `porcentaje`, `ganadora` (booleano).
- `EscrutinioGrupo`: `escrutinioId`, `facultad`, `carrera`, `votaron`, `habilitados`.

### 10.2 Cómo se genera el escrutinio

1. Consulta a Elecciones (`GET /internal/elecciones/:id`): debe estar `CERRADA`, si no `422 ELECCION_NO_CERRADA`. Obtiene candidaturas y criterios.
2. Consulta a Votación (`conteo` y `participacion`).
3. Consulta a Identidad (`conteo`) con los criterios de la elección para el total de habilitados y su distribución por grupo.
4. Calcula y **guarda como copia fija**. Reglas: porcentaje por candidatura = `votos / totalVotos × 100` (dos decimales; 0 si no hay votos), calculado sobre el total emitido **incluidos los blancos**; todas las candidaturas aparecen aunque tengan 0 votos; participación = `participantes / totalHabilitados × 100` (dos decimales; 0 si no hay habilitados); `ganadora` = la de más votos; si hay empate en el primer lugar, `empate = true` y se marcan todas las empatadas como `ganadora`; con 0 votos no hay ganadora. `EscrutinioGrupo` incluye los grupos con 0 votantes.
5. Es **idempotente**: si ya existe, se devuelve el existente sin recalcular.

### 10.3 Forma de respuesta del escrutinio

`data` = `{ eleccionId, titulo, estado, totalVotos, votosEnBlanco, totalHabilitados, participacion, empate, candidaturas: [{ candidaturaId, nombre, votos, porcentaje, ganadora }], participacionPorGrupo: [{ facultad, carrera, votaron, habilitados }], generadoEn, publicadoEn }`.

### 10.4 Endpoints

- `POST /api/v1/resultados/elecciones/:id/escrutinio` — `ADMINISTRADOR`. **201** si lo crea, **200** si ya existía.
- `POST /api/v1/resultados/elecciones/:id/publicar` — `ADMINISTRADOR`. `422 ESCRUTINIO_NO_GENERADO` si no existe. Pasa a `PUBLICADO` y fija `publicadoEn`. Si ya estaba publicado, responde 200 sin cambios.
- `GET /api/v1/resultados/elecciones/:id/participacion` — `ADMINISTRADOR`. `data: { totalVotos, totalHabilitados, participacion, porGrupo: [...] }`. `404` si no hay escrutinio.
- `GET /api/v1/resultados/elecciones/:id/exportar` — `ADMINISTRADOR`. Responde un **CSV** (UTF-8 con BOM, `Content-Disposition: attachment`): encabezado `candidatura,votos,porcentaje`, una fila por candidatura, una fila `Voto en blanco` y una fila final `Total`.
- `GET /api/v1/resultados` — autenticado. Lista paginada de resultados con campos `eleccionId`, `titulo`, `estado`, `publicadoEn`, `generadoEn`. El estudiante solo ve los `PUBLICADO`; el administrador ve todos.
- `GET /api/v1/resultados/elecciones/:id` — autenticado. El estudiante recibe `404 NO_ENCONTRADO` si no está publicado; el administrador ve cualquier escrutinio existente.

---

## 11. Gateway (puerto 3000)

Se mantiene como está (enrutamiento por prefijo, bloqueo de `/internal`, sin leer cuerpos). Cambios permitidos: límites configurables por variables de entorno (sección 4) y la mejora de errores del proxy si hiciera falta. No añade lógica de negocio ni verifica tokens.

---

## 12. Frontend (React, sencillo y funcional)

### 12.1 Reglas generales

- Solo `react`, `react-dom`, `react-router-dom`. CSS plano en `src/styles.css` con **variables CSS** para colores, tipografía y espaciado, de forma que un rediseño posterior sea cambiar ese archivo. Sin librerías de componentes ni de gráficos.
- Estructura: una carpeta por módulo en `src/features/*` (ya existen), más `src/shared/` (cliente HTTP, sesión, componentes comunes). Completa `src/shared/api/cliente.js`.
- **Sesión:** el token y el usuario se guardan en `sessionStorage` y en un contexto de React (`AuthContext`). Si la API responde 401, se cierra la sesión y se redirige a `/login`.
- **Rutas protegidas** por rol: un estudiante no puede abrir pantallas de administración y viceversa (redirige al inicio de su rol).
- Todas las pantallas muestran estados de **carga**, **error** (usando `error.mensaje` de la API) y **vacío**. Formularios con etiquetas visibles, validación básica y botón deshabilitado mientras se envía. Textos 100 % en español. Responsive básico (que se use bien en móvil).
- Las fechas se muestran en hora de Ecuador (`America/Guayaquil`).

### 12.2 Pantallas

**Públicas:** `/login` (correo y contraseña) y `/registro` (todos los campos del registro).

**Estudiante:**
- `/elecciones` — elecciones disponibles; cada una muestra título, fechas y si ya votó (con botón «Votar» si no).
- `/elecciones/:id/votar` — papeleta: candidaturas con nombre, descripción y foto (si hay URL) en opciones de selección única, más «Voto en blanco». Un paso de confirmación («¿Confirmas tu voto?») antes de enviar. Tras votar, muestra el **comprobante**. Si ya votó o la elección no está abierta, muestra un mensaje claro.
- `/resultados` y `/resultados/:id` — lista de resultados publicados y detalle con barras CSS por candidatura, votos en blanco, participación y ganadora (o empate).
- `/perfil` — datos del usuario y cambio de contraseña.

**Administrador:**
- `/admin/usuarios` — tabla paginada con filtros y búsqueda; cambiar rol y estado de un usuario; sección para importar CSV (selector de archivo y resumen del resultado).
- `/admin/elecciones` — lista de elecciones con su estado y filtro por estado.
- `/admin/elecciones/nueva` y `/admin/elecciones/:id` — formulario de la elección (con casilla «Abrir ahora» que fija la apertura a la hora actual), gestión de candidaturas (alta, edición y baja en la misma página) y botones **Publicar**, **Cerrar**, **Cancelar** y **Eliminar** que solo aparecen cuando el estado efectivo los permite.
- `/admin/resultados/:id` — botón «Generar escrutinio» (si la elección está cerrada), vista del escrutinio, tabla de participación por facultad y carrera, botón **Publicar resultados** y botón **Exportar CSV** (descarga con `fetch` + `Blob`, porque requiere el encabezado `Authorization`). Desde la lista de elecciones cerradas debe haber un acceso directo a esta pantalla.

**Navegación:** barra superior con los enlaces del rol activo, nombre del usuario y «Cerrar sesión».

---

## 13. Pruebas y verificación

### 13.1 Pruebas unitarias por servicio (Jest, sin base de datos real)

Mockea la capa de acceso a datos y cubre como mínimo:
- **Identidad:** registro (duplicados y dominio), login (credenciales, usuario inactivo, límite de intentos), claims del token, importación CSV (filas válidas e inválidas).
- **Elecciones:** cálculo del estado efectivo (todos los casos y los bordes de fecha), elegibilidad, reglas de publicación, edición solo en borrador, `validar-voto` en el orden definido.
- **Votación:** flujo de emisión (válido, no habilitado, elección no abierta, candidatura inválida, `P2002` → `YA_VOTO`), voto en blanco, rechazo del rol administrador, conteo solo con elección cerrada.
- **Resultados:** cálculo de porcentajes y participación, voto en blanco, 0 votos, empate, idempotencia, exportación CSV.

Las pruebas existentes deben seguir pasando. `npm test` en cada servicio y en el gateway debe terminar en verde.

### 13.2 Script `scripts/e2e.js` (Node 20, sin dependencias, usa `fetch`)

Ejecutado contra el sistema levantado (gateway en `http://localhost:3000`, configurable con la variable `API_URL`), debe ser **repetible** (cada ejecución crea su propia elección con título único) y salir con código 0 si todo pasa o con código distinto de 0 indicando el paso que falló. Recorre:

1. `/health` del gateway.
2. Login del administrador y de los 12 estudiantes de prueba; login incorrecto → 401; ruta de administración con token de estudiante → 403; sin token → 401; `/internal/...` por el gateway → 404.
3. Admin crea una elección (apertura = ahora, cierre = +1 hora, sin restricciones), le agrega 3 candidaturas, la publica; intentar publicarla con menos de 2 candidaturas (en otra elección) → 422.
4. Los estudiantes ven la elección en `disponibles`. Una elección restringida a «Derecho» **no** aparece para un estudiante de Ingeniería y su voto allí → 403.
5. Votan los 12 estudiantes (por ejemplo 5 / 4 / 2 para las candidaturas y 1 en blanco; ajusta los números para que sumen 12). Segundo voto del mismo estudiante → 409 `YA_VOTO`.
6. **Concurrencia:** 10 peticiones simultáneas de voto de un mismo estudiante que aún no votó (usa un estudiante reservado para esta prueba) → exactamente 1 respuesta 201 y 9 respuestas 409.
7. Antes del cierre, generar escrutinio → 422 `ELECCION_NO_CERRADA`. El administrador cierra la elección; votar después → 422.
8. Admin genera el escrutinio; verifica totales, porcentajes, ganadora y participación contra los votos emitidos; generarlo de nuevo devuelve el mismo resultado (200).
9. Un estudiante no ve el resultado (404) hasta que el admin lo publica; después lo ve y coincide con el del admin. La exportación CSV tiene el formato definido.
10. **Anonimato:** verifica que ninguna respuesta de la API expone el voto de un usuario concreto, y (mediante una consulta de comprobación documentada en el propio script, por ejemplo con `docker compose exec postgres psql …` opcional) que la tabla `Voto` no contiene columnas de usuario.

Al terminar imprime un resumen con ✔/✘ por paso.

### 13.3 Calidad

`npm run lint` y `npm run format:check` (raíz) en verde; `npm run build` del frontend en verde; CI actualizado (sección 5).

---

## 14. Orden de trabajo por fases

Trabaja **en este orden** y no avances a la siguiente fase si la actual no está verificada (pruebas y, cuando aplique, ejecución real). Crea una rama local `feature/implementacion-ia` y un commit por fase (mensaje en español con prefijo `feat:`/`chore:`/`test:`/`docs:`). No hagas `push`.

0. **Línea base:** leer documentos, levantar el sistema actual y comprobar `/health`.
1. **Infraestructura de arranque único** (sección 4) y **Prisma común** (sección 5) aplicados a los cuatro servicios, con el esquema vacío o mínimo que permita arrancar y migrar.
2. **Identidad** completa (sección 7) con sus pruebas.
3. **Elecciones** completa (sección 8) con sus pruebas.
4. **Votación** completa (sección 9) con sus pruebas, integrada con Elecciones **sin** mocks.
5. **Resultados** completa (sección 10) con sus pruebas, integrada con los otros tres **sin** mocks.
6. **Gateway:** variables de límites y comprobación del enrutamiento completo.
7. **Frontend** (sección 12), pantalla por pantalla contra el gateway real.
8. **`scripts/e2e.js`**, CI, `openapi.yaml`, README y `docs/DECISIONES.md`.
9. **Verificación final desde cero:** `docker compose down -v` → `docker compose up --build` → `node scripts/e2e.js`, más lint, formato, pruebas y build.

---

## 15. Criterios de aceptación (checklist final)

La entrega está **terminada** solo si todo lo siguiente es cierto:

- [ ] `docker compose down -v && docker compose up --build` en una máquina limpia levanta todo sin pasos previos.
- [ ] Los `/health` de los cuatro servicios responden `ok` con `baseDatos: ok`, y el gateway y el frontend responden.
- [ ] `node scripts/e2e.js` termina con código 0.
- [ ] Las 4 bases de datos tienen sus migraciones aplicadas automáticamente; las migraciones están versionadas en `prisma/migrations` de cada servicio.
- [ ] Los usuarios de prueba de la sección 7.5 existen y funcionan; reiniciar no duplica datos.
- [ ] Se puede recorrer el flujo completo desde el navegador con ambos roles (sección 12.2).
- [ ] El doble voto es imposible (prueba de concurrencia en verde) y no existe forma de relacionar un usuario con su voto.
- [ ] `/internal/*` no es accesible desde el gateway y exige `X-Internal-Key` en los servicios.
- [ ] `npm test` en los cuatro servicios y el gateway, `npm run lint`, `npm run format:check` y el build del frontend están en verde.
- [ ] Ningún secreto, `.env`, clave ni `node_modules` está versionado. `generated/` está ignorado.
- [ ] Cada `openapi.yaml` coincide con lo implementado y los `README.md` están actualizados.
- [ ] No se agregó nada de la lista «fuera de alcance» (sección 3.2).

---

## 16. Reporte final obligatorio

Al terminar, entrega un reporte breve con:

1. **Cómo arrancar** (el comando) y las credenciales de prueba.
2. **Resultados reales** de la verificación: salida resumida de `e2e`, pruebas, lint y build. Indica explícitamente **qué ejecutaste de verdad y qué no pudiste ejecutar** (por ejemplo, si no tuviste Docker).
3. **Desviaciones** respecto a este documento (idealmente ninguna fuera de las permitidas) y **supuestos** tomados, con enlace a `docs/DECISIONES.md`.
4. **Limitaciones conocidas** y cualquier cosa que quede pendiente.

No declares algo como hecho si no lo verificaste.

---

## 17. Documentación a actualizar

- `README.md` raíz: arranque con un solo comando, credenciales de prueba, URLs, cómo reiniciar los datos y cómo ejecutar `e2e`. Elimina los pasos antiguos de `npm install` / `npm run claves` / `.env` como requisitos.
- `README.md` de cada módulo: marca los endpoints implementados, describe el modelo de datos y las reglas clave.
- `docs/CONTRATOS.md`: solo si añades campos **compatibles** (nunca cambiando los existentes); registra cualquier cambio en `docs/DECISIONES.md`.
- `docs/DECISIONES.md`: nuevo archivo con las decisiones, supuestos y desviaciones.