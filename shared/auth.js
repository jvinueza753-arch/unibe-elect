const jwt = require('jsonwebtoken'); const fs = require('node:fs');
function publicKey() { return fs.readFileSync(process.env.JWT_PUBLIC_KEY_PATH || '/run/jwt/public/public.pem', 'utf8'); }
function privateKey() { return fs.readFileSync(process.env.JWT_PRIVATE_KEY_PATH || '/run/jwt/private/private.pem', 'utf8'); }
async function autenticar(req, res, next) {
  const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ error: { codigo: 'NO_AUTENTICADO', mensaje: 'Debes iniciar sesión' } });
  }

  let claims;
  try {
    claims = jwt.verify(token, publicKey(), { algorithms: ['RS256'] });
  } catch {
    return res.status(401).json({ error: { codigo: 'NO_AUTENTICADO', mensaje: 'Token inválido o vencido' } });
  }
  if (!claims.sub || !Number.isSafeInteger(claims.sv) || claims.sv < 0) {
    return res.status(401).json({ error: { codigo: 'NO_AUTENTICADO', mensaje: 'Token inválido o vencido' } });
  }

  try {
    const identityUrl = process.env.IDENTIDAD_URL;
    const internalKey = process.env.CLAVE_INTERNA;
    if (!identityUrl || !internalKey) {
      console.error('Falta configuración para validar sesiones');
      return res.status(503).json({ error: { codigo: 'SERVICIO_NO_DISPONIBLE', mensaje: 'No se pudo validar la sesión' } });
    }

    const response = await fetch(new URL('/internal/auth/sesion-valida', identityUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Internal-Key': internalKey },
      body: JSON.stringify({ sub: claims.sub, sv: claims.sv }),
      signal: AbortSignal.timeout(2000),
    });
    if (response.status === 401) {
      return res.status(401).json({ error: { codigo: 'NO_AUTENTICADO', mensaje: 'La sesión ya no es válida' } });
    }
    if (response.status !== 204) {
      return res.status(503).json({ error: { codigo: 'SERVICIO_NO_DISPONIBLE', mensaje: 'No se pudo validar la sesión' } });
    }
  } catch (cause) {
    console.error('Falló la validación central de sesión', { code: cause.code || cause.name || 'ERROR' });
    return res.status(503).json({ error: { codigo: 'SERVICIO_NO_DISPONIBLE', mensaje: 'No se pudo validar la sesión' } });
  }

  req.usuario = claims;
  return next();
}
function requerirRol(...roles) { return (req, res, next) => !req.usuario ? res.status(401).json({ error: { codigo: 'NO_AUTENTICADO', mensaje: 'Debes iniciar sesión' } }) : !roles.includes(req.usuario.rol) ? res.status(403).json({ error: { codigo: 'SIN_PERMISO', mensaje: 'No tienes permisos para esta operación' } }) : next(); }
function emitir(claims) { return jwt.sign(claims, privateKey(), { algorithm: 'RS256', expiresIn: '1h' }); }
module.exports = { autenticar, requerirRol, emitir, publicKey };
