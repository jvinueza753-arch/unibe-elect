const { createHash, randomBytes } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { z } = require('zod');

const REQUEST_MESSAGE = 'Si existe una cuenta estudiantil activa con ese correo, la solicitud será revisada por un administrador.';
const INVALID_CODE_MESSAGE = 'El código no es válido o ya venció. Solicita una nueva recuperación.';
const CODE_TTL_MS = 60 * 60 * 1000;
const requestAttempts = new Map();
let cleanupTicks = 0;

const resetRequestSchema = z.object({
  correo: z.string().trim().email(),
});
const resetPasswordSchema = z.object({
  codigo: z.string().trim().min(32).max(200),
  contrasenaNueva: z.string().min(8).max(128),
});

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function allowRequest(key, now, limit = 5) {
  const current = requestAttempts.get(key);
  if (!current || current.expiresAt <= now) {
    if (requestAttempts.size >= 10000) return false;
    requestAttempts.set(key, { count: 1, expiresAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

function cleanupRequestAttempts(now) {
  cleanupTicks += 1;
  if (requestAttempts.size < 1000 || cleanupTicks % 100 !== 0) return;
  for (const [key, attempt] of requestAttempts) {
    if (attempt.expiresAt <= now) requestAttempts.delete(key);
  }
}

function registerPasswordResetRoutes(app, { db, error, autenticar, requerirRol }) {
  app.post('/api/v1/auth/solicitudes-recuperacion', async (req, res) => {
    const parsed = resetRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return error(res, 400, 'DATOS_INVALIDOS', 'Ingresa un correo electrónico válido');
    }

    const now = Date.now();
    cleanupRequestAttempts(now);
    const correo = parsed.data.correo.toLowerCase();
    const emailKey = `correo:${digest(correo)}`;
    if (!allowRequest(emailKey, now)) {
      return error(res, 429, 'DEMASIADAS_SOLICITUDES', 'Has realizado demasiadas solicitudes. Inténtalo más tarde.');
    }

    const usuario = await db.usuario.findUnique({ where: { correo } });
    if (usuario?.rol === 'ESTUDIANTE' && usuario.estado === 'ACTIVO') {
      await db.solicitudRecuperacion.updateMany({
        where: {
          usuarioId: usuario.id,
          estado: 'APROBADA',
          codigoExpira: { lte: new Date(now) },
        },
        data: { estado: 'EXPIRADA', resueltaEn: new Date(now) },
      });
      const activa = await db.solicitudRecuperacion.findFirst({
        where: { usuarioId: usuario.id, estado: { in: ['PENDIENTE', 'APROBADA'] } },
      });
      if (!activa) {
        try {
          await db.solicitudRecuperacion.create({ data: { usuarioId: usuario.id } });
        } catch (cause) {
          if (cause.code !== 'P2002') throw cause;
        }
      }
    }

    return res.status(202).json({ data: { mensaje: REQUEST_MESSAGE } });
  });

  app.post('/api/v1/auth/restablecer-contrasena', async (req, res) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return error(res, 400, 'DATOS_INVALIDOS', 'Ingresa un código válido y una contraseña de al menos 8 caracteres');
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
    });
    if (!solicitud) return error(res, 400, 'CODIGO_INVALIDO', INVALID_CODE_MESSAGE);

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
        data: { contrasenaHash },
      });
      return true;
    });

    if (!completada) return error(res, 400, 'CODIGO_INVALIDO', INVALID_CODE_MESSAGE);
    return res.status(204).end();
  });

  app.get('/api/v1/admin/solicitudes-recuperacion', autenticar, requerirRol('ADMINISTRADOR'), async (_req, res) => {
    const now = new Date();
    await db.solicitudRecuperacion.updateMany({
      where: { estado: 'APROBADA', codigoExpira: { lte: now } },
      data: { estado: 'EXPIRADA', resueltaEn: now },
    });
    const solicitudes = await db.solicitudRecuperacion.findMany({
      take: 100,
      orderBy: { solicitadaEn: 'desc' },
      include: {
        usuario: { select: { nombres: true, apellidos: true, correo: true, codigoEstudiantil: true } },
      },
    });
    return res.json({
      data: solicitudes.map(({ id, estado, solicitadaEn, codigoExpira, resueltaEn, usuario }) => ({
        id, estado, solicitadaEn, codigoExpira, resueltaEn, usuario,
      })),
    });
  });

  app.post('/api/v1/admin/solicitudes-recuperacion/:id/aprobar', autenticar, requerirRol('ADMINISTRADOR'), async (req, res) => {
    const solicitud = await db.solicitudRecuperacion.findUnique({
      where: { id: req.params.id },
      include: { usuario: true },
    });
    if (!solicitud || solicitud.estado !== 'PENDIENTE') {
      return error(res, 404, 'SOLICITUD_NO_DISPONIBLE', 'La solicitud ya no está pendiente');
    }
    if (solicitud.usuario.estado !== 'ACTIVO' || solicitud.usuario.rol !== 'ESTUDIANTE') {
      return error(res, 422, 'USUARIO_NO_ELEGIBLE', 'Solo se pueden aprobar solicitudes de estudiantes activos');
    }

    const codigo = randomBytes(32).toString('base64url');
    const codigoHash = digest(codigo);
    const ahora = new Date();
    const codigoExpira = new Date(ahora.getTime() + CODE_TTL_MS);
    try {
      const aprobada = await db.$transaction(async (tx) => {
        await tx.solicitudRecuperacion.updateMany({
          where: {
            usuarioId: solicitud.usuarioId,
            estado: 'APROBADA',
            codigoExpira: { lte: ahora },
          },
          data: { estado: 'EXPIRADA', resueltaEn: ahora },
        });
        return tx.solicitudRecuperacion.updateMany({
          where: { id: solicitud.id, estado: 'PENDIENTE' },
          data: { estado: 'APROBADA', codigoHash, codigoExpira },
        });
      });
      if (aprobada.count !== 1) {
        return error(res, 409, 'SOLICITUD_NO_DISPONIBLE', 'La solicitud cambió mientras se procesaba');
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
        codigo,
        codigoExpira,
        mensaje: 'Entrega este código al estudiante por un canal seguro. Solo se mostrará una vez.',
      },
    });
  });

  app.post('/api/v1/admin/solicitudes-recuperacion/:id/rechazar', autenticar, requerirRol('ADMINISTRADOR'), async (req, res) => {
    const resultado = await db.solicitudRecuperacion.updateMany({
      where: { id: req.params.id, estado: 'PENDIENTE' },
      data: { estado: 'RECHAZADA', resueltaEn: new Date() },
    });
    if (resultado.count !== 1) {
      return error(res, 404, 'SOLICITUD_NO_DISPONIBLE', 'La solicitud ya no está pendiente');
    }
    return res.status(204).end();
  });
}

module.exports = { registerPasswordResetRoutes };
