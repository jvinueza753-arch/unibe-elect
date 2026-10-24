const express = require('express'); const cors = require('cors');
function createApp(service) {
  const app = express(); app.disable('x-powered-by'); app.use(cors()); app.use(express.json({ limit: '5mb' }));
  app.get('/health', async (_req, res) => { let baseDatos = 'ok'; try { if (app.locals.prisma) await app.locals.prisma.$queryRaw`SELECT 1`; } catch { baseDatos = 'error'; } res.status(baseDatos === 'ok' ? 200 : 503).json({ data: { estado: baseDatos === 'ok' ? 'ok' : 'degradado', servicio: service, baseDatos } }); });
  app.use((req, res, next) => { if (req.path.startsWith('/internal/') && req.get('X-Internal-Key') !== process.env.CLAVE_INTERNA) return res.status(401).json({ error: { codigo: 'NO_AUTENTICADO', mensaje: 'Clave interna inválida' } }); next(); });
  return app;
}
function error(res, status, codigo, mensaje, detalles) { const e = { codigo, mensaje }; if (detalles) e.detalles = detalles; return res.status(status).json({ error: e }); }
module.exports = { createApp, error };
