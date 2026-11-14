const { z } = require('zod');
const { createApp, error } = require('/shared/http');
const { autenticar, requerirRol } = require('/shared/auth');
const { llamarInterno } = require('/shared/interno');
const db = require('./db');
const {
  comprobantePublico,
  esComprobanteValido,
  registrarVoto,
  verificarComprobante,
} = require('./registrar-voto');

const app = createApp('votacion');
app.locals.prisma = db;

// Los comprobantes y el estado de participación son datos sensibles: no deben almacenarse en cachés.
app.use('/api/v1/votacion', (req, res, next) => {
  res.set('Cache-Control', 'no-store, private');
  res.set('Pragma', 'no-cache');
  res.set('X-Content-Type-Options', 'nosniff');
  next();
});

require('./participacion')(app, db);

const internal = (process.env.ELECCIONES_URL || 'http://elecciones:4002').replace(/\/$/, '');
const uuidSchema = z.string().uuid();

const votoSchema = z.object({
  // Es obligatorio enviar la propiedad. null representa explícitamente voto en blanco.
  candidaturaId: z.string().uuid().nullable(),
}).strict();

const consultaParticipacionesSchema = z.object({
  usuarioId: z.string().uuid(),
  eleccionIds: z.array(z.string().uuid()).max(100),
}).strict();

function idValido(id) {
  return uuidSchema.safeParse(id).success;
}

app.post(
  '/api/v1/votacion/elecciones/:id/votos',
  autenticar,
  requerirRol('ESTUDIANTE'),
  async (req, res) => {
    if (!idValido(req.params.id)) {
      return error(res, 400, 'ID_INVALIDO', 'El identificador de la elección no es válido');
    }

    const datos = votoSchema.safeParse(req.body);
    if (!datos.success) {
      return error(
        res,
        400,
        'DATOS_INVALIDOS',
        'Debes enviar candidaturaId como UUID o null para votar en blanco',
      );
    }

    const { candidaturaId } = datos.data;
    let validacion;

    try {
      validacion = await llamarInterno(
        `${internal}/internal/elecciones/${req.params.id}/validar-voto`,
        {
          method: 'POST',
          body: JSON.stringify({
            facultad: req.usuario.facultad,
            carrera: req.usuario.carrera,
            candidaturaId,
          }),
        },
      );
    } catch (err) {
      console.error('No fue posible validar la elección antes de registrar el voto:', err.message);
      return error(res, 503, 'SERVICIO_NO_DISPONIBLE', 'No se pudo validar la elección');
    }

    if (!validacion?.valido) {
      const motivo = validacion?.motivo || 'ELECCION_NO_ABIERTA';

      if (motivo === 'NO_HABILITADO') {
        return error(res, 403, 'NO_HABILITADO', 'No estás habilitado para esta elección');
      }

      return error(
        res,
        422,
        motivo,
        motivo === 'CANDIDATURA_INVALIDA'
          ? 'La candidatura no pertenece a esta elección'
          : 'La elección no está abierta',
      );
    }

    try {
      const result = await registrarVoto(db, {
        eleccionId: req.params.id,
        usuarioId: req.usuario.sub,
        facultad: req.usuario.facultad,
        carrera: req.usuario.carrera,
        candidaturaId,
      });

      return res.status(201).json({ data: comprobantePublico(result) });
    } catch (err) {
      // La restricción única de PostgreSQL es la protección definitiva ante concurrencia.
      if (err.code === 'P2002') {
        return error(res, 409, 'YA_VOTO', 'Ya registraste tu voto en esta elección');
      }

      throw err;
    }
  },
);

app.get(
  '/api/v1/votacion/elecciones/:id/mi-participacion',
  autenticar,
  requerirRol('ESTUDIANTE'),
  async (req, res) => {
    if (!idValido(req.params.id)) {
      return error(res, 400, 'ID_INVALIDO', 'El identificador de la elección no es válido');
    }

    const participacion = await db.participacion.findUnique({
      where: {
        eleccionId_usuarioId: {
          eleccionId: req.params.id,
          usuarioId: req.usuario.sub,
        },
      },
      select: { fecha: true, comprobante: true },
    });

    return res.json({
      data: participacion
        ? { haVotado: true, fecha: participacion.fecha, comprobante: participacion.comprobante }
        : { haVotado: false },
    });
  },
);

// Verificación pública: el comprobante es un secreto aleatorio; la respuesta no revela identidad ni selección.
app.get('/api/v1/votacion/comprobantes/:comprobante/verificar', async (req, res) => {
  const { comprobante } = req.params;

  if (!esComprobanteValido(comprobante)) {
    return error(res, 400, 'COMPROBANTE_INVALIDO', 'El comprobante debe tener 12 caracteres alfanuméricos en mayúsculas');
  }

  const verificacion = await verificarComprobante(db, comprobante);

  if (!verificacion) {
    return error(res, 404, 'COMPROBANTE_NO_ENCONTRADO', 'No existe una participación asociada a ese comprobante');
  }

  return res.json({ data: verificacion });
});

async function asegurarCerrada(id) {
  const eleccion = await llamarInterno(`${internal}/internal/elecciones/${id}`);

  if (eleccion?.estado !== 'CERRADA') {
    throw Object.assign(new Error('La elección debe estar cerrada'), { code: 'ELECCION_NO_CERRADA' });
  }
}

app.get('/internal/votacion/elecciones/:id/conteo', async (req, res) => {
  if (!idValido(req.params.id)) {
    return error(res, 400, 'ID_INVALIDO', 'El identificador de la elección no es válido');
  }

  try {
    await asegurarCerrada(req.params.id);
  } catch (err) {
    return error(
      res,
      err.code === 'ELECCION_NO_CERRADA' ? 422 : 503,
      err.code || 'SERVICIO_NO_DISPONIBLE',
      err.message || 'No se pudo consultar el estado de la elección',
    );
  }

  const rows = await db.voto.groupBy({
    by: ['candidaturaId'],
    where: { eleccionId: req.params.id },
    _count: { _all: true },
  });

  const totalVotos = rows.reduce((total, row) => total + row._count._all, 0);
  const votosEnBlanco = rows.find((row) => row.candidaturaId === null)?._count._all || 0;

  return res.json({
    data: {
      totalVotos,
      votosEnBlanco,
      porCandidatura: rows
        .filter((row) => row.candidaturaId)
        .map((row) => ({ candidaturaId: row.candidaturaId, votos: row._count._all })),
    },
  });
});

app.get('/internal/votacion/elecciones/:id/participacion', async (req, res) => {
  if (!idValido(req.params.id)) {
    return error(res, 400, 'ID_INVALIDO', 'El identificador de la elección no es válido');
  }

  try {
    await asegurarCerrada(req.params.id);
  } catch (err) {
    return error(
      res,
      err.code === 'ELECCION_NO_CERRADA' ? 422 : 503,
      err.code || 'SERVICIO_NO_DISPONIBLE',
      err.message || 'No se pudo consultar el estado de la elección',
    );
  }

  const grupos = await db.participacion.groupBy({
    by: ['facultad', 'carrera'],
    where: { eleccionId: req.params.id },
    _count: { _all: true },
  });

  const total = await db.participacion.count({ where: { eleccionId: req.params.id } });

  return res.json({
    data: {
      total,
      porGrupo: grupos.map((grupo) => ({
        facultad: grupo.facultad,
        carrera: grupo.carrera,
        votaron: grupo._count._all,
      })),
    },
  });
});

app.post('/internal/votacion/participaciones/consultar', async (req, res) => {
  const datos = consultaParticipacionesSchema.safeParse(req.body);

  if (!datos.success) {
    return error(res, 400, 'DATOS_INVALIDOS', 'usuarioId debe ser UUID y eleccionIds una lista de hasta 100 UUID');
  }

  const rows = await db.participacion.findMany({
    where: {
      usuarioId: datos.data.usuarioId,
      eleccionId: { in: datos.data.eleccionIds },
    },
    select: { eleccionId: true },
  });

  return res.json({ data: { eleccionesVotadas: rows.map((row) => row.eleccionId) } });
});

app.use((req, res) => error(res, 404, 'NO_ENCONTRADO', 'Ruta no encontrada'));

app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') {
    return error(res, 400, 'JSON_INVALIDO', 'El cuerpo de la solicitud no contiene JSON válido');
  }

  if (err.type === 'entity.too.large') {
    return error(res, 413, 'SOLICITUD_DEMASIADO_GRANDE', 'El cuerpo de la solicitud supera el tamaño permitido');
  }

  console.error('Error no controlado en el microservicio de votación:', err);
  return error(res, 500, 'ERROR_INTERNO', 'Ocurrió un error interno');
});

const server = app.listen(process.env.PORT || 4003, () => console.log('Votación listo'));

process.on('SIGTERM', async () => {
  server.close();
  await db.$disconnect();
});