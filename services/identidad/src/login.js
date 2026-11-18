const { createHash } = require('node:crypto');
const bcrypt = require('bcryptjs');
const {
  incrementarIntentosConExpiracion,
  obtenerEstadoIntentos,
  reiniciarIntentos,
} = require('./intentos');

const MAX_LOGIN_INTENTOS = 5;
const LOGIN_VENTANA_MS = 15 * 60 * 1000;

function hashCorreo(correo) {
  return createHash('sha256').update(correo).digest('hex');
}

function segundosRestantes(expiraEn, ahora) {
  return Math.max(1, Math.ceil((expiraEn.getTime() - ahora) / 1000));
}

function responderBloqueo(res, error, expiraEn, ahora, intentosMaximos) {
  const reintentarEnSegundos = segundosRestantes(expiraEn, ahora);
  res.set('Retry-After', String(reintentarEnSegundos));
  return error(
    res,
    429,
    'DEMASIADOS_INTENTOS',
    'Demasiados intentos fallidos. Por seguridad, intenta de nuevo más tarde.',
    {
      reintentarEnSegundos,
      bloqueadoHasta: expiraEn.toISOString(),
      intentosMaximos,
    },
  );
}

function crearHandlerLogin({ db, error, emitir, publico, ahora = Date.now }) {
  return async (req, res) => {
    const correo = String(req.body?.correo || '').trim().toLowerCase();
    const claveIntento = `login:${hashCorreo(correo)}`;
    const ahoraMs = ahora();
    const estado = await obtenerEstadoIntentos(db, claveIntento, ahoraMs);
    if (estado.intentos >= MAX_LOGIN_INTENTOS) {
      return responderBloqueo(res, error, estado.expiraEn, ahoraMs, MAX_LOGIN_INTENTOS);
    }

    const usuario = await db.usuario.findUnique({ where: { correo } });
    const valido = usuario && usuario.estado === 'ACTIVO'
      && await bcrypt.compare(String(req.body?.contrasena || ''), usuario.contrasenaHash);
    if (!valido) {
      const limite = await incrementarIntentosConExpiracion(
        db,
        claveIntento,
        ahoraMs,
        LOGIN_VENTANA_MS,
        MAX_LOGIN_INTENTOS,
      );
      if (limite.intentos >= MAX_LOGIN_INTENTOS) {
        return responderBloqueo(res, error, limite.expiraEn, ahora(), MAX_LOGIN_INTENTOS);
      }
      return error(
        res,
        401,
        'CREDENCIALES_INVALIDAS',
        'Correo o contraseña incorrectos',
        { intentosRestantes: Math.max(0, MAX_LOGIN_INTENTOS - limite.intentos) },
      );
    }

    await reiniciarIntentos(db, claveIntento);
    const usuarioPublico = publico(usuario);
    const token = emitir({
      sub: usuario.id,
      sv: usuario.sessionVersion,
      rol: usuario.rol,
      correo: usuario.correo,
      facultad: usuario.facultad,
      carrera: usuario.carrera,
    });
    return res.json({ data: { token, usuario: usuarioPublico } });
  };
}

module.exports = { crearHandlerLogin };
