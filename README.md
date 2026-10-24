# UNIBE Elect

Sistema académico de votación estudiantil construido desde cero con cuatro microservicios Node.js/Express, PostgreSQL, Prisma 7, JWT RS256, gateway y frontend React.

## Arranque

Requisito: Docker Desktop con Docker Compose habilitado. Desde la raíz del proyecto:

```bash
docker compose up --build
```

El primer arranque crea cuatro bases de datos, genera claves JWT y aplica las migraciones automáticamente. URLs: frontend `http://localhost:5173`, gateway `http://localhost:3000/health`.

Para reiniciar todos los datos: `docker compose down -v` y luego `docker compose up --build`. Si cambian dependencias, reconstruye con `docker compose up --build -V`.

## Credenciales de demostración

- Administrador: `admin@unibe.edu.ec` / `Admin12345!`
- Estudiantes: `estudiante01@unibe.edu.ec` … `estudiante12@unibe.edu.ec` / `Estudiante123!`

Estas credenciales son solo para desarrollo académico; no usar en producción.

## Servicios

| Servicio | Puerto | Responsabilidad |
|---|---:|---|
| Identidad | 4001 | Registro, login RS256, usuarios y roles |
| Elecciones | 4002 | Elecciones, candidaturas, fechas y elegibilidad |
| Votación | 4003 | Participación y votos separados para preservar anonimato |
| Resultados | 4004 | Escrutinio fijo, publicación y exportación CSV |
| Gateway | 3000 | Enrutamiento HTTP y límites de peticiones |
| Frontend | 5173 | Interfaz React en español |

## Pruebas

Con el sistema levantado, ejecutar `node scripts/e2e.js`. El script usa `fetch` de Node 20 y necesita el backend disponible. No declares una verificación como exitosa sin ejecutarla.

## Seguridad y alcance

La clave privada JWT solo se monta en Identidad. Los otros servicios reciben la clave pública. Los endpoints `/internal/*` exigen `X-Internal-Key` y el gateway los bloquea. Las tablas `participaciones` y `votos` son independientes; `votos` no tiene campos de usuario ni relación con participación. La restricción única `(eleccionId, usuarioId)` impide doble voto incluso bajo concurrencia.

El panel administrativo muestra la participación y las personas pendientes por elección abierta. El panel estudiantil muestra elecciones abiertas o programadas, fechas de cierre, recordatorios de voto y participación agregada; los votos por candidatura se mantienen ocultos hasta publicar el escrutinio. La cantidad mínima de candidaturas es configurable en cada borrador. La administración también puede descargar la plantilla CSV de estudiantes.

El frontend está dividido por pantallas y usa Tailwind CSS, notificaciones integradas y confirmaciones personalizadas. Este repositorio sigue siendo una base académica: antes de uso real deben completarse las pruebas de seguridad y privacidad, la recuperación de contraseñas con aprobación administrativa y la validación integral en Docker.
