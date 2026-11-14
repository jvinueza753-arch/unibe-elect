# Recuperación segura de cuentas

## Solicitud y vigencia

- Solo se crean solicitudes para estudiantes activos. Los mensajes y el estado HTTP no confirman si el correo existe; las solicitudes válidas tienen un tiempo mínimo de respuesta común.
- Una solicitud pendiente no se duplica: una nueva petición refresca `solicitadaEn` y su prioridad. Las pendientes vencen después del valor de `RECUPERACION_PENDIENTE_TTL_HORAS` (72 horas por defecto).
- Si existe una solicitud aprobada con código vigente, no se crea otra. El administrador puede reemitir desde el panel; la emisión reemplaza el hash anterior atómicamente y el código anterior deja de funcionar.
- Los códigos tienen 256 bits aleatorios, solo se almacena SHA-256, vencen en una hora y se consumen una sola vez. No deben aparecer en logs.
- El servicio realiza un barrido periódico y también al consultar/solicitar recuperación: marca pendientes y códigos vencidos como `EXPIRADA` y elimina estados terminales tras `RECUPERACION_RETENCION_DIAS` (90 días por defecto).

## Límites, contraseñas y sesiones

- El gateway limita solicitudes a 10 por IP/hora y restablecimientos a 20 por IP/15 minutos. No se bloquea por correo objetivo, para evitar que terceros agoten la cuota de recuperación de una víctima. La limitación por IP no reemplaza controles de abuso en el perímetro de producción.
- En `docker-compose.yml`, `LIMITE_GENERAL`, `LIMITE_LOGIN` y `LIMITE_VOTACION` conservan valores heredados de `100000`; no deben considerarse protección efectiva contra abuso. Se mantienen fuera de este cambio para no alterar tráfico ajeno a recuperación y requieren una revisión de capacidad y límites específica.
- Las contraseñas aceptan 8–128 caracteres, pero como bcrypt solo utiliza 72 bytes se rechazan valores que excedan 72 bytes UTF-8. Registro, cambio y recuperación usan la misma regla. La contraseña actual no se puede reutilizar.
- Los JWT contienen `sv` (versión de sesión). Todos los microservicios validan la versión vigente con Identidad; una indisponibilidad de Identidad falla cerrada con `503`. Un cambio o restablecimiento incrementa `sessionVersion`, invalida los JWT anteriores y limpia el bloqueo `login:<SHA-256 del correo normalizado>`.
- El restablecimiento completa la solicitud, invalida otras solicitudes abiertas y actualiza la contraseña dentro de una transacción. En dos aprobaciones o consumos concurrentes, la escritura condicional permite un solo ganador; la otra petición recibe conflicto/código inválido.
- Una recuperación no modifica elecciones ni votos. Si la elección sigue abierta, el estudiante inicia sesión de nuevo y continúa sujeto a las reglas normales de elegibilidad y participación.

## Panel administrativo

La lista usa paginación explícita de 20 elementos (máximo API 100), filtro por estado y búsqueda por correo/código estudiantil. Las pendientes se muestran primero y el contador se actualiza mediante sondeo cada 30 segundos. Las fechas se muestran en la zona horaria del navegador. La aprobación, el rechazo y la última reemisión registran actor y fecha. El código nuevo solo se devuelve en la respuesta de aprobación/reemisión y debe entregarse por un canal seguro.

## Recuperación administrativa y continuidad

La recuperación de estudiantes nunca debe utilizarse para cuentas `ADMINISTRADOR`; no existe un endpoint público o de autoservicio para recuperar administradores. Para una cuenta administrativa bloqueada:

1. Verificar identidad por un canal institucional preestablecido y registrar el caso; requerir aprobación de dos personas autorizadas (operaciones/seguridad).
2. No desactivar ni degradar al último administrador activo. La API rechaza estos cambios con `409 ULTIMO_ADMIN`; si hay que recuperar al único administrador, usar el procedimiento break-glass controlado de operaciones, no el panel público.
3. En una sesión de base de datos restringida y auditada, restablecer la credencial con hash bcrypt generado fuera de logs y aumentar `sessionVersion` en la misma transacción. Si la política institucional exige un reemplazo, crear y verificar el administrador alternativo antes de desactivar el anterior.
4. Confirmar acceso con el titular por canal seguro, revisar el registro de auditoría, revocar/rotar las credenciales temporales de operación y cerrar el caso.

Nunca enviar códigos, contraseñas, hashes, tokens ni claves internas a logs o tickets. El endpoint interno de validación de sesiones requiere `X-Internal-Key` y queda bloqueado por el gateway público.
