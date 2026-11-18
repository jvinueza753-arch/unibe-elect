const { createApp, error } = require('/shared/http');
const db = require('./db');

const app = createApp('elecciones');
app.locals.prisma = db;

require('./dashboard')(app, db);
require('./rutas')(app, db);

app.use((req, res) => error(res, 404, 'NO_ENCONTRADO', 'Ruta no encontrada'));
app.use((cause, _req, res, _next) => {
  if (cause.type === 'entity.too.large') {
    const isImageLimit = cause.limit === 2 * 1024 * 1024;
    return error(
      res,
      413,
      isImageLimit ? 'IMAGEN_DEMASIADO_GRANDE' : 'SOLICITUD_DEMASIADO_GRANDE',
      isImageLimit ? 'La imagen no puede superar 2 MB' : 'La solicitud supera el tamaño permitido',
    );
  }
  if (cause.type === 'entity.parse.failed') {
    return error(res, 400, 'DATOS_INVALIDOS', 'El cuerpo de la solicitud no es JSON válido');
  }
  console.error(cause);
  return error(res, 500, 'ERROR_INTERNO', 'Ocurrió un error interno');
});

const server = app.listen(process.env.PORT || 4002, () => console.log('Elecciones listo'));
process.on('SIGTERM', async () => {
  server.close();
  await db.$disconnect();
});
