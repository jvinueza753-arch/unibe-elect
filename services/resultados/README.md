# Microservicio UNIBE Elect

Microservicio Express 5 en CommonJS, con PostgreSQL y Prisma. Las migraciones se aplican al iniciar el contenedor y `/health` verifica la conexión a la base de datos.

- Autenticación: JWT RS256 validado con la clave pública.
- Comunicación interna: encabezado `X-Internal-Key`.
- Modelo de datos: `prisma/schema.prisma`.
- Migraciones versionadas: `prisma/migrations/`.

Los contratos y reglas de negocio completos están definidos en `../../IMPLEMENTACION-IA.md`.
