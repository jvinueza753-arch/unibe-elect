# Microservicio UNIBE Elect

Microservicio Express 5 en CommonJS, con PostgreSQL y Prisma. Las migraciones se aplican al iniciar el contenedor y `/health` verifica la conexión a la base de datos.

- Autenticación: JWT RS256 validado con la clave pública.
- Comunicación interna: encabezado `X-Internal-Key`.
- Modelo de datos: `prisma/schema.prisma`.
- Migraciones versionadas: `prisma/migrations/`.

Los contratos actuales están en `openapi.yaml` y `../../docs/CONTRATOS.md`; la especificación inicial `IMPLEMENTACION-IA.md` no describe las ampliaciones posteriores.

Se admiten elecciones de candidaturas, referéndum (Sí/No/Abstención) y planchas. Cada elección permite configurar `candidaturasRequeridas` (entre 2 y 100); las planchas también configuran los cargos obligatorios. Publicar valida las opciones fijas y la integridad de cada plancha. Los paneles autenticados exponen estados de elecciones y cifras agregadas de participación, sin conteos por candidatura durante la votación.

Las fotos PNG, JPEG y WebP se almacenan en la base de Elecciones, hasta 2 MiB por candidatura. La API valida el tipo y la firma básica del archivo antes de almacenarlo.

El cierre anticipado requiere un motivo de 5–500 caracteres y se registra atómicamente con el actor, el correo visible y la hora. `fechaCierre` siempre conserva el cierre programado. La clasificación de estados se centraliza en `src/estado.js` para las rutas públicas, paneles e internos.
