# Frontend

Aplicación React 18 + Vite en español. Ejecuta dentro de Docker en el puerto 5173 y usa el proxy de Vite para dirigir `/api/*` al gateway. Las pantallas y los componentes compartidos están separados por módulos en `src/`; los estilos combinan Tailwind CSS con reglas de interfaz compartidas.

Los paneles se actualizan cada minuto. El panel estudiantil muestra elecciones abiertas o programadas, fechas de cierre, recordatorios de voto y participación general. Nunca muestra votos parciales por candidatura; el escrutinio se consulta únicamente después de su publicación.

Desde la administración de usuarios se puede descargar la plantilla CSV. Sus encabezados requeridos son `nombres,apellidos,correo,codigoEstudiantil,facultad,carrera,contrasena`.

La recuperación de contraseña crea una solicitud para revisión administrativa. Al aprobarla, el administrador entrega al estudiante un código de un solo uso que vence en una hora; el estudiante lo usa para establecer una nueva contraseña.

Para validar la aplicación: `npm run build`.
