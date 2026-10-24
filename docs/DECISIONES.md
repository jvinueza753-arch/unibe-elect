# Decisiones, supuestos y desviaciones

- El proyecto se generó desde cero a partir de `IMPLEMENTACION-IA.md`.
- Las claves JWT se guardan en volúmenes Docker nombrados, separados entre privada y pública.
- Se usa una base PostgreSQL por microservicio; la tabla de votos no guarda identidad y no tiene relación con participaciones.
- Las contraseñas se almacenan con bcrypt y los JWT se firman con RS256.
- La interfaz inicial cubre autenticación, registro, votación básica, perfil, listado de elecciones y resultados. La gestión avanzada de candidaturas/usuarios y todas las pantallas administrativas especificadas requieren completar iteraciones posteriores.
- No se pudo ejecutar Docker en el entorno de generación; por tanto, no se declara que el arranque, migraciones o pruebas E2E hayan sido verificados en ejecución real.
