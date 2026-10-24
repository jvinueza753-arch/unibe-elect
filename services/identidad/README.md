# Microservicio UNIBE Elect

Microservicio Express 5 en CommonJS, con PostgreSQL y Prisma. Las migraciones se aplican al iniciar el contenedor y `/health` verifica la conexión a la base de datos.

- Autenticación: JWT RS256 validado con la clave pública.
- Comunicación interna: encabezado `X-Internal-Key`.
- Modelo de datos: `prisma/schema.prisma`.
- Migraciones versionadas: `prisma/migrations/`.
- Recuperación de contraseña: el estudiante solicita el cambio; un administrador aprueba, entrega manualmente el código de un solo uso y el estudiante establece una contraseña nueva. El código se almacena como hash y vence después de una hora.

Los contratos y reglas de negocio completos están definidos en `../../IMPLEMENTACION-IA.md`.
