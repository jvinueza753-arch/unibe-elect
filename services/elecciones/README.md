# Microservicio UNIBE Elect

Microservicio Express 5 en CommonJS, con PostgreSQL y Prisma. Las migraciones se aplican al iniciar el contenedor y `/health` verifica la conexión a la base de datos.

- Autenticación: JWT RS256 validado con la clave pública.
- Comunicación interna: encabezado `X-Internal-Key`.
- Modelo de datos: `prisma/schema.prisma`.
- Migraciones versionadas: `prisma/migrations/`.

Los contratos y reglas de negocio completos están definidos en `../../IMPLEMENTACION-IA.md`.

Cada elección permite configurar `candidaturasRequeridas` (entre 2 y 100). Publicar un borrador se rechaza hasta registrar esa cantidad. Los paneles autenticados exponen estados de elecciones y cifras agregadas de participación, sin conteos por candidatura durante la votación.
