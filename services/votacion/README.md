# Microservicio UNIBE Elect

Microservicio Express 5 en CommonJS, con PostgreSQL y Prisma. Las migraciones se aplican al iniciar el contenedor y `/health` verifica la conexión a la base de datos.

- Autenticación: JWT RS256 validado con la clave pública.
- Comunicación interna: encabezado `X-Internal-Key`.
- Modelo de datos: `prisma/schema.prisma`.
- Migraciones versionadas: `prisma/migrations/`.

Los contratos y reglas de negocio completos están definidos en `../../IMPLEMENTACION-IA.md`.

El servicio entrega únicamente el total agregado de participaciones a los servicios internos; el conteo no contiene identidades y no se consulta el contenido de los votos para los paneles de participación en vivo.
