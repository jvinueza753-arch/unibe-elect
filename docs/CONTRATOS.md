# Contratos API

Las rutas públicas usan el prefijo `/api/v1`; las respuestas exitosas usan `{ "data": ... }`, y los errores `{ "error": { "codigo": "...", "mensaje": "..." } }`. Las rutas internas usan `/internal` y requieren el encabezado `X-Internal-Key`; no son accesibles desde el gateway.

## Identidad
- `POST /api/v1/auth/registro`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/cambiar-contrasena`
- `POST /api/v1/auth/solicitudes-recuperacion` crea una solicitud genérica para cuentas estudiantiles activas; la respuesta no revela si existe el correo.
- `POST /api/v1/auth/restablecer-contrasena` recibe el código aprobado, de un solo uso, y la nueva contraseña.
- `GET /api/v1/admin/solicitudes-recuperacion` lista solicitudes para administradores.
- `POST /api/v1/admin/solicitudes-recuperacion/:id/aprobar` aprueba y muestra el código una única vez; el administrador lo entrega al estudiante por un canal seguro. Vence en una hora.
- `POST /api/v1/admin/solicitudes-recuperacion/:id/rechazar` rechaza una solicitud pendiente.
- `GET /api/v1/auth/clave-publica`
- `GET /api/v1/usuarios`, `GET /api/v1/usuarios/:id`, `PATCH /api/v1/usuarios/:id`, `PATCH /api/v1/usuarios/:id/rol`, `POST /api/v1/usuarios/importar`
- `GET /internal/usuarios/conteo`

## Elecciones
- CRUD de `/api/v1/elecciones`, candidaturas anidadas, publicar, cerrar y cancelar.
- `GET /api/v1/elecciones/disponibles`
- `GET /api/v1/elecciones/estudiante` devuelve elecciones elegibles y si el estudiante ya participó.
- `GET /api/v1/elecciones/panel-administrador` devuelve elecciones abiertas y totales agregados de participación.
- `GET /api/v1/elecciones/:id/participacion` devuelve participación general de una elección abierta; nunca votos por candidatura.
- Al crear un borrador se puede definir `candidaturasRequeridas` (2–100, predeterminado 2); publicar se bloquea hasta alcanzar la cantidad.
- `POST /internal/elecciones/:id/validar-voto`, `GET /internal/elecciones/:id`

## Votación
- `POST /api/v1/votacion/elecciones/:id/votos`
- `GET /api/v1/votacion/elecciones/:id/mi-participacion`
- `GET /internal/votacion/elecciones/:id/total-participacion` entrega solo un total, sin identidades ni contenido del voto.
- Conteo y participación en `/internal/votacion/elecciones/:id/*` y consulta de participaciones en `/internal/votacion/participaciones/consultar`.

## Resultados
- Generar y publicar escrutinio en `/api/v1/resultados/elecciones/:id/*`.
- Listar `/api/v1/resultados`; detalle `/api/v1/resultados/elecciones/:id`; exportación CSV `/api/v1/resultados/elecciones/:id/exportar`.
