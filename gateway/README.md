# Gateway

Gateway HTTP que enruta `/api/v1/auth`, `/api/v1/usuarios` y `/api/v1/admin/solicitudes-recuperacion` a Identidad, `/api/v1/elecciones` a Elecciones, `/api/v1/votacion` a Votación y `/api/v1/resultados` a Resultados. Bloquea `/internal/*` con 404 y aplica límites configurables por variables de entorno. Los límites de login y globales devuelven errores JSON con `Retry-After` y segundos restantes; las solicitudes de recuperación también tienen límites configurables.
