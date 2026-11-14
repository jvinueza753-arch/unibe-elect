# UNIBE Elect

Sistema académico de votación estudiantil construido desde cero con cuatro microservicios Node.js/Express, PostgreSQL, Prisma 7, JWT RS256, gateway y frontend React.

## Arranque

Requisito: Docker Desktop con Docker Compose habilitado. Desde la raíz del proyecto:

```bash
docker compose up --build
```

El primer arranque crea cuatro bases de datos, genera claves JWT y aplica las migraciones automáticamente. URLs: frontend `http://localhost:5173`, gateway `http://localhost:3000/health`.

Para reconstruir imágenes cuando cambien dependencias, ejecuta `docker compose up --build -V`. No elimines volúmenes ni reinicies bases de datos que puedan contener datos activos.

Las cuentas de demostración no se crean por defecto. Para una instalación de desarrollo aislada, copia `.env.example` a `.env` y configura `ALLOW_DEMO_SEED=true`, `DEMO_ADMIN_PASSWORD` y `DEMO_STUDENT_PASSWORD` (cada contraseña debe tener al menos 16 caracteres). Docker Compose envía esos valores al microservicio de identidad. Nunca habilites la semilla en producción.

## Servicios

| Servicio | Puerto | Responsabilidad |
|---|---:|---|
| Identidad | Interno | Registro, login RS256, usuarios y roles; acceso host mediante el gateway |
| Elecciones | 4002 | Elecciones de candidaturas, referéndum y planchas; candidaturas, imágenes y elegibilidad |
| Votación | 4003 | Participación y votos separados para preservar anonimato |
| Resultados | 4004 | Escrutinio con huella verificable, desempate, publicación, CSV y acta PDF |
| Gateway | 3000 | Enrutamiento HTTP y límites de peticiones |
| Frontend | 5173 | Interfaz React en español |

## Pruebas

Las pruebas unitarias se ejecutan por servicio con su comando `npm test`. También puedes compilar el frontend con `npm run build` en `frontend`. Para el E2E, levanta una instancia aparte con cuatro bases y volúmenes exclusivos:

```powershell
docker compose -p unibe-elect-e2e -f docker-compose.yml -f docker-compose.e2e.yml up -d --build
$env:E2E_API_URL = "http://localhost:3100"
$env:E2E_TEST_DATABASE_PREFIX = "unibe_test"
$env:E2E_ISOLATION_CONFIRMED = "YES"
node scripts/e2e.js
```

El script verifica que el gateway y los cuatro servicios confirmen las bases `unibe_test_*` antes de enviar solicitudes. Cubre autenticación y recuperación, tipos de elección, validación de planchas, imágenes, anonimato y unicidad del voto, cierre anticipado, generación/verificación/desempate/publicación y descarga del acta PDF. Los registros E2E permanecen solo en el volumen aislado. Para borrar exclusivamente ese entorno de prueba cuando ya no lo necesites, ejecuta `docker compose -p unibe-elect-e2e -f docker-compose.yml -f docker-compose.e2e.yml down -v`; no uses ese comando con el proyecto normal.

Para una ejecución nueva sin reutilizar datos E2E anteriores, define `E2E_VOLUME_PREFIX` con un nombre único antes de `docker compose`; las bases y claves de prueba usarán ese prefijo. La CI incluye el identificador de ejecución para mantener sus volúmenes aislados entre ejecuciones.

## Seguridad y alcance

La clave privada JWT solo se monta en Identidad. Los otros servicios reciben la clave pública. En producción, define `CLAVE_INTERNA` con un secreto aleatorio de al menos 32 bytes; el arranque de los servicios rechaza claves ausentes o débiles. Los endpoints `/internal/*` exigen `X-Internal-Key` y el gateway los bloquea. Las tablas `participaciones` y `votos` son independientes; `votos` no tiene campos de usuario ni relación con participación. La restricción única `(eleccionId, usuarioId)` impide doble voto incluso bajo concurrencia.

El panel administrativo muestra la participación y las personas pendientes por elección abierta. El panel estudiantil muestra elecciones abiertas o programadas, fechas de cierre, recordatorios de voto y participación agregada; los votos por candidatura se mantienen ocultos hasta publicar el escrutinio. La cantidad mínima de candidaturas es configurable en cada borrador. La administración también puede descargar la plantilla CSV de estudiantes.

El frontend está dividido por pantallas y ofrece asistentes accesibles para el registro, la configuración de elecciones y el voto, además de gestión de candidaturas y resultados. Este repositorio sigue siendo una base académica: antes de uso real requiere revisión independiente de seguridad y privacidad, procedimientos institucionales aprobados y validación operacional en el entorno de despliegue.
