# Microservicio UNIBE Elect

Microservicio Express 5 en CommonJS, con PostgreSQL y Prisma. Las migraciones se aplican al iniciar el contenedor y `/health` verifica la conexión a la base de datos.

- Autenticación: JWT RS256 validado con la clave pública.
- Comunicación interna: encabezado `X-Internal-Key`.
- Modelo de datos: `prisma/schema.prisma`.
- Migraciones versionadas: `prisma/migrations/`.

Los contratos actuales están en `openapi.yaml` y `../../docs/CONTRATOS.md`; la especificación inicial `IMPLEMENTACION-IA.md` no describe las ampliaciones posteriores.

El escrutinio conserva un snapshot JSON canónico y una huella SHA-256. Un administrador debe verificar la huella y documentar el desempate (si existe) antes de publicar. Las exportaciones CSV y el acta PDF están disponibles para resultados publicados; el PDF requiere además una verificación vigente.
