const express = require('express'); const cors = require('cors');
function internalKey() {
  const configured = process.env.CLAVE_INTERNA;
  if (!configured) {
    throw new Error('CLAVE_INTERNA debe configurarse antes de iniciar el servicio');
  }
  if (process.env.NODE_ENV === 'production') {
    if (Buffer.byteLength(configured) < 32) {
      throw new Error('Producción requiere CLAVE_INTERNA aleatoria de al menos 32 bytes');
    }
  }
  return configured;
}
function isolatedTestDatabase(service) {
  if (process.env.NODE_ENV !== 'test' || process.env.E2E_ISOLATED_DATABASE !== 'true') return false;
  const prefix = process.env.E2E_TEST_DATABASE_PREFIX || '';
  if (!/^unibe_test(?:_[a-z0-9_]+)?$/.test(prefix)) return false;
  try {
    const actual = new URL(process.env.DATABASE_URL).pathname.slice(1);
    return decodeURIComponent(actual) === `${prefix}_${service}`;
  } catch {
    return false;
  }
}
function createApp(service) {
  internalKey();
  const app = express(); app.disable('x-powered-by'); app.use(cors()); app.use(express.json({ limit: '5mb' }));
  app.get('/health', async (_req, res) => { let baseDatos = 'ok'; try { if (app.locals.prisma) await app.locals.prisma.$queryRaw`SELECT 1`; } catch { baseDatos = 'error'; } res.status(baseDatos === 'ok' ? 200 : 503).json({ data: { estado: baseDatos === 'ok' ? 'ok' : 'degradado', servicio: service, baseDatos, e2eAislado: isolatedTestDatabase(service) } }); });
  app.use((req, res, next) => { if (req.path.startsWith('/internal/') && req.get('X-Internal-Key') !== internalKey()) return res.status(401).json({ error: { codigo: 'NO_AUTENTICADO', mensaje: 'Clave interna inválida' } }); next(); });
  return app;
}
function error(res, status, codigo, mensaje, detalles) { const e = { codigo, mensaje }; if (detalles) e.detalles = detalles; return res.status(status).json({ error: e }); }
module.exports = { createApp, error, isolatedTestDatabase };
