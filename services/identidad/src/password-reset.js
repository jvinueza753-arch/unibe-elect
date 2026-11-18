const { createHash, randomBytes } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { reiniciarIntentos, limpiarIntentosExpirados } = require('./intentos');
const { validarPoliticaContrasena } = require('./password-validation');

const REQUEST_MESSAGE = 'Si existe una cuenta estudiantil activa con ese correo, la solicitud será revisada por un administrador.';
const INVALID_CODE_MESSAGE = 'El código no es válido o ya venció. Solicita una nueva recuperación.';
const CODE_TTL_MS = 60 * 60 * 1000;
const REQUEST_RESPONSE_MIN_MS = 250;
const EMPTY_USER_ID = '00000000-0000-0000-0000-000000000000';

function positiveIntegerEnv(name, defaultValue) {
  const value = Number(process.env[name] || defaultValue);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} debe ser un entero positivo`);
  }
  return value;
}

const PENDING_TTL_MS = positiveIntegerEnv('RECUPERACION_PENDIENTE_TTL_HORAS', 72) * 60 * 60 * 1000;
const RETENTION_MS = positiveIntegerEnv('RECUPERACION_RETENCION_DIAS', 90) * 24 * 60 * 60 * 1000;

const resetRequestSchema = z.object({
  correo: z.string().trim().email().max(254),
});
const resetPasswordSchema = z.object({
  codigo: z.string().trim().min(32).max(200),
  contrasenaNueva: z.string(),
});
const listQuerySchema = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
  estado: z.enum(['PENDIENTE', 'APROBADA', 'RECHAZADA', 'COMPLETADA', 'EXPIRADA']).optional(),
  busqueda: z.string().trim().max(254).optional(),
});

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function generarContrasenaTemporal(usuario) {
  let contrasena;
  do {
    contrasena = randomBytes(24).toString('base64url');
  } while (validarPoliticaContrasena(contrasena, {
    correo: usuario.correo,
    codigoEstudiantil: usuario.codigoEstudiantil,
  }).length);
  return contrasena;
}

async function limpiarSolicitudesRecuperacion(db, ahora = new Date()) {
  const pendientesVencidasAntes = new Date(ahora.getTime() - PENDING_TTL_MS);
  const retenerDesde = new Date(ahora.getTime() - RETENTION_MS);
  await db.solicitudRecuperacion.updateMany({
    where: { estado: 'PENDIENTE', solicitadaEn: { lte: pendientesVencidasAntes } },
    data: { estado: 'EXPIRADA', resueltaEn: ahora },
  });
  await db.solicitudRecuperacion.updateMany({
    where: { estado: 'APROBADA', codigoExpira: { lte: ahora } },
    data: { estado: 'EXPIRADA', codigoHash: null, codigoExpira: null, resueltaEn: ahora },
  });
  await db.solicitudRecuperacion.deleteMany({
    where: {
      estado: { in: ['RECHAZADA', 'COMPLETADA', 'EXPIRADA'] },
      resueltaEn: { lt: retenerDesde },
    },
  });
  await limpiarIntentosExpirados(db, ahora.getTime());
}

async function padRequestResponse(startedAt) {
  const remaining = REQUEST_RESPONSE_MIN_MS - (performance.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}

function solicitudWhere(search, estado) {
  const where = {};
  if (estado) where.estado = estado;
  if (search) {
    where.usuario = {
      is: {
        OR: ['correo', 'codigoEstudiantil'].map((field) => ({
          [field]: { contains: search, mode: 'insensitive' },
        })),
      },
    };
  }
  return where;
}

function actorSelect() {
  return { select: { id: true, nombres: true, apellidos: true, correo: true } };
}

function includeSolicitud() {
  return {
    usuario: { select: { nombres: true, apellidos: true, correo: true, codigoEstudiantil: true } },
    aprobadaPor: actorSelect(),
    rechazadaPor: actorSelect(),
    reemitidaPor: actorSelect(),
  };
}

function registerPasswordResetRoutes(app, { db, error, autenticar, requerirRol }) {
  app.post('/api/v1/auth/solicitudes-recuperacion', async (req, res) => {
    const startedAt = performance.now();
    const parsed = resetRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return error(res, 400, 'DATOS_INVALIDOS', 'Ingresa un correo electrónico válido');
    }

    const now = new Date();
    const correo = parsed.data.correo.toLowerCase();
    const usuario = await db.usuario.findUnique({ where: { correo } });
    await limpiarSolicitudesRecuperacion(db, now);
    const userId = usuario?.rol === 'ESTUDIANTE' && usuario.estado === 'ACTIVO'
      ? usuario.id
      : EMPTY_USER_ID;

    try {
      await db.$transaction(async (tx) => {
        const activa = await tx.solicitudRecuperacion.findFirst({
          where: { usuarioId: userId, estado: { in: ['PENDIENTE', 'APROBADA'] } },
        });
        if (userId === EMPTY_USER_ID) return;
        if (activa?.estado === 'PENDIENTE') {
          await tx.solicitudRecuperacion.updateMany({
            where: { id: activa.id, usuarioId: userId, estado: 'PENDIENTE' },
            data: { solicitadaEn: now },
          });
          return;
        }
        if (activa?.estado === 'APROBADA') return;

        await tx.solicitudRecuperacion.create({ data: { usuarioId: userId } });
      });
    } catch (cause) {
      if (cause.code !== 'P2002') throw cause;
      await db.solicitudRecuperacion.updateMany({
        where: { usuarioId: userId, estado: 'PENDIENTE' },
        data: { solicitadaEn: now },
      });
    }

    await padRequestResponse(startedAt);
    return res.status(202).json({ data: { mensaje: REQUEST_MESSAGE } });
  });

  app.post('/api/v1/auth/restablecer-contrasena', async (req, res) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return error(res, 400, 'DATOS_INVALIDOS', 'Ingresa un código válido y una contraseña');
    }

    const now = new Date();
    const codigoHash = digest(parsed.data.codigo);
    const solicitud = await db.solicitudRecuperacion.findFirst({
      where: {
        codigoHash,
        estado: 'APROBADA',
        codigoExpira: { gt: now },
        usuario: { estado: 'ACTIVO', rol: 'ESTUDIANTE' },
      },
      include: { usuario: true },
    });
    if (!solicitud) return error(res, 400, 'CODIGO_INVALIDO', INVALID_CODE_MESSAGE);

    if (await bcrypt.compare(parsed.data.contrasenaNueva, solicitud.usuario.contrasenaHash)) {
      return error(res, 400, 'CONTRASENA_REUTILIZADA', 'Elige una contraseña distinta de la actual');
    }

    const reglasIncumplidas = validarPoliticaContrasena(parsed.data.contrasenaNueva, {
      correo: solicitud.usuario.correo,
      codigoEstudiantil: solicitud.usuario.codigoEstudiantil,
    });
    if (reglasIncumplidas.length) {
      return error(
        res,
        400,
        'DATOS_INVALIDOS',
        'La contraseña no cumple los requisitos de seguridad',
        { contrasena: reglasIncumplidas },
      );
    }

    const contrasenaHash = await bcrypt.hash(parsed.data.contrasenaNueva, 12);
    const completada = await db.$transaction(async (tx) => {
      const actualizada = await tx.solicitudRecuperacion.updateMany({
        where: {
          id: solicitud.id,
          estado: 'APROBADA',
          codigoHash,
          codigoExpira: { gt: now },
        },
        data: {
          estado: 'COMPLETADA',
          codigoHash: null,
          codigoExpira: null,
          resueltaEn: now,
        },
      });
      if (actualizada.count !== 1) return false;

      await tx.usuario.update({
        where: { id: solicitud.usuarioId, estado: 'ACTIVO', rol: 'ESTUDIANTE' },
        data: { contrasenaHash, sessionVersion: { increment: 1 } },
      });
      await tx.solicitudRecuperacion.updateMany({
        where: {
          usuarioId: solicitud.usuarioId,
          id: { not: solicitud.id },
          estado: { in: ['PENDIENTE', 'APROBADA'] },
        },
        data: {
          estado: 'EXPIRADA',
          codigoHash: null,
          codigoExpira: null,
          resueltaEn: now,
        },
      });
      await reiniciarIntentos(tx, `login:${digest(solicitud.usuario.correo)}`);
      return true;
    });

    if (!completada) return error(res, 400, 'CODIGO_INVALIDO', INVALID_CODE_MESSAGE);
    return res.status(204).end();
  });

  app.get('/api/v1/admin/solicitudes-recuperacion', autenticar, requerirRol('ADMINISTRADOR'), async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return error(res, 400, 'DATOS_INVALIDOS', 'Los filtros o la paginación no son válidos');
    }

    await limpiarSolicitudesRecuperacion(db);
    const { pagina, limite, estado, busqueda } = parsed.data;
    const where = solicitudWhere(busqueda, estado);
    const [total, pendientes] = await Promise.all([
      db.solicitudRecuperacion.count({ where }),
      db.solicitudRecuperacion.count({ where: solicitudWhere(busqueda, 'PENDIENTE') }),
    ]);
    const skip = (pagina - 1) * limite;
    const orderBy = { solicitadaEn: 'desc' };
    let solicitudes;

    if (estado || skip >= pendientes) {
      const remainingWhere = estado
        ? where
        : { ...where, estado: { not: 'PENDIENTE' } };
      solicitudes = await db.solicitudRecuperacion.findMany({
        where: remainingWhere,
        skip: estado ? skip : skip - pendientes,
        take: limite,
        orderBy,
        include: includeSolicitud(),
      });
    } else {
      const primeras = await db.solicitudRecuperacion.findMany({
        where: solicitudWhere(busqueda, 'PENDIENTE'),
        skip,
        take: limite,
        orderBy,
        include: includeSolicitud(),
      });
      const restantes = primeras.length < limite
        ? await db.solicitudRecuperacion.findMany({
          where: { ...where, estado: { not: 'PENDIENTE' } },
          take: limite - primeras.length,
          orderBy,
          include: includeSolicitud(),
        })
        : [];
      solicitudes = [...primeras, ...restantes];
    }

    return res.json({
      data: {
        items: solicitudes,
        meta: {
          pagina,
          limite,
          total,
          totalPaginas: Math.ceil(total / limite),
          pendientes,
        },
      },
    });
  });

  app.post('/api/v1/admin/solicitudes-recuperacion/:id/aprobar', autenticar, requerirRol('ADMINISTRADOR'), async (req, res) => {
    const ahora = new Date();
    const limitePendiente = new Date(ahora.getTime() - PENDING_TTL_MS);
    const solicitud = await db.solicitudRecuperacion.findUnique({
      where: { id: req.params.id },
      include: { usuario: true },
    });
    if (!solicitud) {
      return error(res, 404, 'SOLICITUD_NO_DISPONIBLE', 'La solicitud ya no está pendiente');
    }
    if (solicitud.estado !== 'PENDIENTE') {
      return error(res, 409, 'SOLICITUD_NO_DISPONIBLE', 'La solicitud cambió y ya no está pendiente');
    }
    if (solicitud.usuario.estado !== 'ACTIVO' || solicitud.usuario.rol !== 'ESTUDIANTE') {
      return error(res, 422, 'USUARIO_NO_ELEGIBLE', 'Solo se pueden aprobar solicitudes de estudiantes activos');
    }

    const contrasenaTemporal = generarContrasenaTemporal(solicitud.usuario);
    const contrasenaHash = await bcrypt.hash(contrasenaTemporal, 12);
    try {
      const aprobada = await db.$transaction(async (tx) => {
        await tx.solicitudRecuperacion.updateMany({
          where: {
            usuarioId: solicitud.usuarioId,
            estado: 'APROBADA',
            codigoExpira: { lte: ahora },
          },
          data: { estado: 'EXPIRADA', codigoHash: null, codigoExpira: null, resueltaEn: ahora },
        });
        const aprobada = await tx.solicitudRecuperacion.updateMany({
          where: {
            id: solicitud.id,
            estado: 'PENDIENTE',
            solicitadaEn: { gt: limitePendiente },
          },
          data: {
            estado: 'COMPLETADA',
            codigoHash: null,
            codigoExpira: null,
            aprobadaPorId: req.usuario.sub,
            aprobadaEn: ahora,
            resueltaEn: ahora,
          },
        });
        if (aprobada.count !== 1) return aprobada;

        await tx.usuario.update({
          where: { id: solicitud.usuarioId, estado: 'ACTIVO', rol: 'ESTUDIANTE' },
          data: { contrasenaHash, sessionVersion: { increment: 1 } },
        });
        await tx.solicitudRecuperacion.updateMany({
          where: {
            usuarioId: solicitud.usuarioId,
            id: { not: solicitud.id },
            estado: { in: ['PENDIENTE', 'APROBADA'] },
          },
          data: {
            estado: 'EXPIRADA',
            codigoHash: null,
            codigoExpira: null,
            resueltaEn: ahora,
          },
        });
        await reiniciarIntentos(tx, `login:${digest(solicitud.usuario.correo)}`);
        return aprobada;
      });
      if (aprobada.count !== 1) {
        return error(res, 409, 'SOLICITUD_NO_DISPONIBLE', 'La solicitud cambió o venció mientras se procesaba');
      }
    } catch (cause) {
      if (cause.code === 'P2002') {
        return error(res, 409, 'RECUPERACION_ACTIVA', 'El estudiante ya tiene una recuperación activa');
      }
      throw cause;
    }

    return res.json({
      data: {
        solicitudId: solicitud.id,
        correo: solicitud.usuario.correo,
        contrasenaTemporal,
        mensaje: 'Entrega esta contraseña temporal al estudiante por un canal seguro. Solo se mostrará una vez; debe cambiarla después de iniciar sesión.',
      },
    });
  });

  app.post('/api/v1/admin/solicitudes-recuperacion/:id/reemitir', autenticar, requerirRol('ADMINISTRADOR'), async (req, res) => {
    const ahora = new Date();
    const solicitud = await db.solicitudRecuperacion.findUnique({
      where: { id: req.params.id },
      include: { usuario: true },
    });
    if (!solicitud || solicitud.estado !== 'APROBADA' || !solicitud.codigoExpira || solicitud.codigoExpira <= ahora) {
      return error(res, 409, 'SOLICITUD_NO_DISPONIBLE', 'Solo se puede reemitir un código aprobado que siga vigente');
    }
    if (solicitud.usuario.estado !== 'ACTIVO' || solicitud.usuario.rol !== 'ESTUDIANTE') {
      return error(res, 422, 'USUARIO_NO_ELEGIBLE', 'Solo se pueden reemitir códigos para estudiantes activos');
    }

    const codigo = randomBytes(32).toString('base64url');
    const codigoHash = digest(codigo);
    const codigoExpira = new Date(ahora.getTime() + CODE_TTL_MS);
    const resultado = await db.solicitudRecuperacion.updateMany({
      where: {
        id: solicitud.id,
        estado: 'APROBADA',
        codigoHash: solicitud.codigoHash,
        codigoExpira: { gt: ahora },
      },
      data: {
        codigoHash,
        codigoExpira,
        reemitidaPorId: req.usuario.sub,
        reemitidaEn: ahora,
      },
    });
    if (resultado.count !== 1) {
      return error(res, 409, 'SOLICITUD_NO_DISPONIBLE', 'El código cambió o venció mientras se procesaba');
    }

    return res.json({
      data: {
        solicitudId: solicitud.id,
        correo: solicitud.usuario.correo,
        codigo,
        codigoExpira,
        mensaje: 'Código reemitido. El código anterior quedó invalidado; entrega este por un canal seguro.',
      },
    });
  });

  app.post('/api/v1/admin/solicitudes-recuperacion/:id/rechazar', autenticar, requerirRol('ADMINISTRADOR'), async (req, res) => {
    const ahora = new Date();
    const limitePendiente = new Date(ahora.getTime() - PENDING_TTL_MS);
    const resultado = await db.solicitudRecuperacion.updateMany({
      where: {
        id: req.params.id,
        estado: 'PENDIENTE',
        solicitadaEn: { gt: limitePendiente },
      },
      data: {
        estado: 'RECHAZADA',
        resueltaEn: ahora,
        rechazadaPorId: req.usuario.sub,
        rechazadaEn: ahora,
      },
    });
    if (resultado.count !== 1) {
      return error(res, 409, 'SOLICITUD_NO_DISPONIBLE', 'La solicitud ya no está pendiente o venció');
    }
    return res.status(204).end();
  });
}

module.exports = { limpiarSolicitudesRecuperacion, registerPasswordResetRoutes };
