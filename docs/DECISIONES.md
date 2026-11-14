# Decisiones, supuestos y desviaciones

- El proyecto se generó desde cero a partir de `IMPLEMENTACION-IA.md`.
- Las claves JWT se guardan en volúmenes Docker nombrados, separados entre privada y pública.
- Se usa una base PostgreSQL por microservicio; la tabla de votos no guarda identidad y no tiene relación con participaciones.
- Las contraseñas se almacenan con bcrypt y los JWT se firman con RS256.
- Las elecciones admiten candidaturas, referéndum y planchas. Las opciones de referéndum son fijas; en planchas, los cargos exigidos se configuran por elección y se validan antes de publicar.
- Las fotos de candidaturas se guardan en la base de Elecciones, se limitan a 2 MiB y se validan por tipo y firma básica. La imagen se entrega desde una ruta pública con `nosniff`; no se acepta SVG.
- El orden aleatorio de la papeleta es estable para el mismo estudiante y elección, para que una revisión o reintento no cambie las posiciones vistas por esa persona.
- El escrutinio guarda un snapshot con claves ordenadas y su SHA-256. La verificación compara el snapshot y registra actor y hora; este mecanismo aporta detección de alteraciones, no autenticidad criptográfica ni firma digital.
- La decisión de desempate se graba primero mediante escritura condicional en Elecciones y luego se aplica en una transacción de Resultados. Si se interrumpe el proceso entre ambas escrituras, el mismo actor, candidatura y hash pueden reintentar la aplicación. Tras resolverlo se recalcula y verifica la huella antes de publicar.
- El acta PDF se genera solo después de publicar y verificar el escrutinio. Las descargas CSV y PDF requieren rol administrador.
- El E2E usa un proyecto Compose, bases y volúmenes con nombres exclusivos; el script exige confirmación explícita de aislamiento y verifica que todos los servicios apunten a `unibe_test_*` antes de enviar mutaciones.
- La política de contraseñas es única y se aplica en el backend: mínimo 10, máximo 128 caracteres, máximo 72 bytes UTF-8, una letra y un número, sin incluir código estudiantil ni parte local del correo de al menos cuatro caracteres. La detección de contraseñas comunes normaliza tildes, mayúsculas y sustituciones leet sencillas; su lista no se expone por API.
- El cierre anticipado se registra en campos separados (`cerradaEn`, actor, correo y motivo), sin alterar `fechaCierre`, que representa siempre la fecha programada. La actualización condicional de una elección abierta es atómica; un único cierre concurrente gana.
