# Microservicio UNIBE Elect

Microservicio Express 5 en CommonJS, con PostgreSQL y Prisma. Las migraciones se aplican al iniciar el contenedor y `/health` verifica la conexión a la base de datos.

- Autenticación: JWT RS256 validado con la clave pública.
- Comunicación interna: encabezado `X-Internal-Key`.
- Modelo de datos: `prisma/schema.prisma`.
- Migraciones versionadas: `prisma/migrations/`.
- Recuperación de contraseña: el estudiante solicita el cambio; un administrador aprueba, entrega manualmente el código de un solo uso y el estudiante establece una contraseña nueva. El código se almacena como hash y vence después de una hora.
- Contraseñas: registro, importación CSV, cambio y recuperación comparten una política del backend (10–128 caracteres, máximo 72 bytes UTF-8, letra y número, sin código/correo ni coincidencias con la lista de contraseñas comunes). `GET /api/v1/auth/politica-contrasena` publica las reglas, nunca la lista.
- Login: el contador compartido por correo normalizado bloquea al quinto intento durante 15 minutos. `401` informa intentos restantes y `429` incluye la expiración y `Retry-After`; las cuentas existentes y desconocidas siguen el mismo contador.

Los contratos y reglas de negocio completos están definidos en `../../IMPLEMENTACION-IA.md`.
