const jwt = require('jsonwebtoken'); const fs = require('node:fs');
function publicKey() { return fs.readFileSync(process.env.JWT_PUBLIC_KEY_PATH || '/run/jwt/public/public.pem', 'utf8'); }
function privateKey() { return fs.readFileSync(process.env.JWT_PRIVATE_KEY_PATH || '/run/jwt/private/private.pem', 'utf8'); }
function autenticar(req, res, next) { const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, ''); if (!token) return res.status(401).json({ error: { codigo: 'NO_AUTENTICADO', mensaje: 'Debes iniciar sesión' } }); try { req.usuario = jwt.verify(token, publicKey(), { algorithms: ['RS256'] }); next(); } catch { return res.status(401).json({ error: { codigo: 'NO_AUTENTICADO', mensaje: 'Token inválido o vencido' } }); } }
function requerirRol(...roles) { return (req, res, next) => !req.usuario ? res.status(401).json({ error: { codigo: 'NO_AUTENTICADO', mensaje: 'Debes iniciar sesión' } }) : !roles.includes(req.usuario.rol) ? res.status(403).json({ error: { codigo: 'SIN_PERMISO', mensaje: 'No tienes permisos para esta operación' } }) : next(); }
function emitir(claims) { return jwt.sign(claims, privateKey(), { algorithm: 'RS256', expiresIn: '1h' }); }
module.exports = { autenticar, requerirRol, emitir, publicKey };
