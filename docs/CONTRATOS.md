# Contratos API

Las rutas públicas usan el prefijo `/api/v1`; las respuestas exitosas usan `{ "data": ... }`, y los errores `{ "error": { "codigo": "...", "mensaje": "..." } }`. Las rutas internas usan `/internal` y requieren el encabezado `X-Internal-Key`; no son accesibles desde el gateway.

## Identidad
- `POST /api/v1/auth/registro`
- `GET /api/v1/auth/politica-contrasena` devuelve longitud mínima, límite bcrypt en bytes y reglas sin revelar la lista interna de contraseñas comunes.
- `POST /api/v1/auth/login` conserva la respuesta genérica de credenciales para cuentas existentes y desconocidas. El `401 CREDENCIALES_INVALIDAS` incluye `detalles.intentosRestantes`; al quinto fallo responde `429 DEMASIADOS_INTENTOS`, con `Retry-After`, `detalles.reintentarEnSegundos`, `bloqueadoHasta` e `intentosMaximos`.
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/cambiar-contrasena` requiere la contraseña actual y devuelve `204` al actualizarla. Registro, cambio, importación CSV y recuperación exigen al menos 10 caracteres, máximo 128 caracteres y 72 bytes UTF-8, letra, número, no coincidencia con código/correo y ausencia de contraseñas comunes. Los incumplimientos responden `400 DATOS_INVALIDOS` con `detalles.contrasena` como lista de códigos. Un `401 CREDENCIALES_INVALIDAS` indica que la contraseña actual no coincide; la sesión solo debe cerrarse cuando el error sea `401 NO_AUTENTICADO`.
- `POST /api/v1/auth/solicitudes-recuperacion` acepta solicitudes genéricas para cuentas estudiantiles activas. Una solicitud pendiente existente se refresca; una aprobada y vigente permanece abierta para reemisión. La respuesta no revela si existe el correo.
- `POST /api/v1/auth/restablecer-contrasena` recibe un código hash-only, de un solo uso y con vencimiento de una hora, y una contraseña nueva que cumple la política y es distinta de la actual.
- `GET /api/v1/admin/solicitudes-recuperacion` acepta `pagina`, `limite` (máximo 100), `estado` y `busqueda` (correo o código estudiantil); devuelve `data.items` y `data.meta`, con pendientes primero y contador.
- `POST /api/v1/admin/solicitudes-recuperacion/:id/aprobar` aprueba y muestra el código una única vez; se registra administrador y fecha. El código se entrega al estudiante por un canal seguro.
- `POST /api/v1/admin/solicitudes-recuperacion/:id/reemitir` genera un código nuevo para una solicitud aprobada vigente e invalida el anterior en la misma escritura condicional.
- `POST /api/v1/admin/solicitudes-recuperacion/:id/rechazar` rechaza una solicitud pendiente y registra administrador y fecha.
- La política completa de expiración, límites, auditoría y recuperación administrativa está en [RECUPERACION-CUENTAS.md](./RECUPERACION-CUENTAS.md).
- `GET /api/v1/auth/clave-publica`
- `GET /api/v1/usuarios`, `GET /api/v1/usuarios/:id`, `PATCH /api/v1/usuarios/:id`, `PATCH /api/v1/usuarios/:id/rol`, `POST /api/v1/usuarios/importar`
- `GET /internal/usuarios/conteo`

## Elecciones
- CRUD de `/api/v1/elecciones`, candidaturas anidadas, publicar, cerrar y cancelar. `POST /api/v1/elecciones/:id/cerrar` requiere `{ motivo }` (5–500 caracteres), registra actor y hora, y conserva `fechaCierre` como cierre programado; devuelve `cierreAnticipado` en el detalle.
- `GET /api/v1/elecciones/catalogos` devuelve los tipos, facultades, carreras, cargos de plancha y opciones fijas de referéndum.
- `POST /api/v1/elecciones` acepta `tipo`: `CANDIDATURAS` (predeterminado), `REFERENDUM` o `PLANCHAS`. Un referéndum requiere `pregunta` y genera automáticamente Sí, No y Abstención. Una elección de planchas puede definir `cargosRequeridos`; cada plancha tiene integrantes con cargo y nombre. Todas pueden guardar descripción, lema y hasta diez propuestas por candidatura.
- `GET /api/v1/elecciones/:id/candidaturas` devuelve las candidaturas e integrantes; para estudiantes, el orden se baraja de forma determinista por estudiante y elección cuando `ordenAleatorio` está activo.
- `POST`, `PATCH` y `DELETE /api/v1/elecciones/:id/candidaturas[/:candidaturaId]` permiten administrar candidaturas de borradores. Las opciones de referéndum son fijas. Publicar valida la cantidad requerida, las opciones del referéndum y que cada plancha cubra los cargos configurados.
- `PUT /api/v1/elecciones/:id/candidaturas/:candidaturaId/foto` recibe bytes PNG, JPEG o WebP (máximo 2 MB) y valida tipo y firma. `GET /api/v1/elecciones/imagenes/:id` sirve la imagen con `X-Content-Type-Options: nosniff`; `DELETE` sobre la ruta de foto la elimina.
- `GET /api/v1/elecciones/disponibles`
- `GET /api/v1/elecciones/estudiante` devuelve elecciones elegibles y si el estudiante ya participó.
- `GET /api/v1/elecciones/panel-administrador` devuelve elecciones abiertas y totales agregados de participación.
- `GET /api/v1/elecciones/:id/participacion` devuelve participación general de una elección abierta; nunca votos por candidatura.
- Al crear un borrador se puede definir `candidaturasRequeridas` (2–100, predeterminado 2); publicar se bloquea hasta alcanzar la cantidad.
- `POST /internal/elecciones/:id/validar-voto`, `GET /internal/elecciones/:id`.
- `POST /internal/elecciones/:id/desempate` es de uso exclusivo entre servicios y exige `X-Internal-Key`; recibe candidatura, actor, motivo y hash canónico. Una escritura condicional impide registrar más de una decisión.

## Votación
- `POST /api/v1/votacion/elecciones/:id/votos`
- `GET /api/v1/votacion/elecciones/:id/mi-participacion`
- `GET /internal/votacion/elecciones/:id/total-participacion` entrega solo un total, sin identidades ni contenido del voto.
- Conteo y participación en `/internal/votacion/elecciones/:id/*` y consulta de participaciones en `/internal/votacion/participaciones/consultar`.

## Resultados
- `POST /api/v1/resultados/elecciones/:id/escrutinio` genera un snapshot canónico y una huella SHA-256; es idempotente.
- `POST /api/v1/resultados/elecciones/:id/verificar` recalcula la huella y registra quién y cuándo verificó.
- `POST /api/v1/resultados/elecciones/:id/desempatar` requiere un escrutinio generado, verificado y empatado, más `{ candidaturaId, motivo }`. La decisión se registra condicionalmente en Elecciones y se aplica transaccionalmente en Resultados; luego se vuelve a verificar la huella antes de publicar.
- `POST /api/v1/resultados/elecciones/:id/publicar` exige huella verificada y empate resuelto, si aplica.
- `GET /api/v1/resultados`; detalle `/api/v1/resultados/elecciones/:id`; participación administrativa `/api/v1/resultados/elecciones/:id/participacion`; CSV `/api/v1/resultados/elecciones/:id/exportar`; acta PDF `/api/v1/resultados/elecciones/:id/acta.pdf`.
- El acta PDF solo está disponible para resultados publicados y verificados. La huella SHA-256 detecta cambios del snapshot, pero no es una firma digital ni sustituye una firma institucional.
