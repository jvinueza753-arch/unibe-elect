const bcrypt = require('bcryptjs');
const { createHash } = require('node:crypto');
const { incrementarIntentos } = require('./intentos');
const { registerPasswordResetRoutes } = require('./password-reset');

function response() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { this.ended = true; return this; },
  };
}

function createDatabase() {
  const user = {
    id: 'isolated-test-student',
    correo: 'reset-test@example.invalid',
    rol: 'ESTUDIANTE',
    estado: 'ACTIVO',
    contrasenaHash: bcrypt.hashSync('old-test-password', 4),
  };
  const requests = [];
  const rateWindows = new Map();
  const db = {
    usuario: {
      findUnique: jest.fn(async () => user),
      update: jest.fn(async ({ data }) => Object.assign(user, data)),
    },
    solicitudRecuperacion: {
      updateMany: jest.fn(async ({ where, data }) => {
        const matches = requests.filter((item) => (
          (!where.id || item.id === where.id)
          && (!where.usuarioId || item.usuarioId === where.usuarioId)
          && (!where.estado || item.estado === where.estado)
        ));
        matches.forEach((item) => Object.assign(item, data));
        return { count: matches.length };
      }),
      findFirst: jest.fn(async ({ where }) => requests.find((item) => (
        item.usuarioId === where.usuarioId
        || item.codigoHash === where.codigoHash
      )) || null),
      create: jest.fn(async ({ data }) => {
        const item = {
          id: `isolated-reset-${requests.length + 1}`,
          estado: 'PENDIENTE',
          solicitadaEn: new Date(),
          ...data,
        };
        requests.push(item);
        return item;
      }),
      findUnique: jest.fn(async ({ where }) => {
        const item = requests.find((request) => request.id === where.id);
        return item ? { ...item, usuario: user } : null;
      }),
    },
    $transaction: jest.fn(async (work) => work(db)),
    $queryRaw: jest.fn(async (strings, ...values) => {
      const key = values[0];
      const expiresAt = values[1];
      const now = values[2];
      const ceiling = values[3];
      const current = rateWindows.get(key);
      const next = !current || current.expiraEn <= now
        ? { intentos: 1, expiraEn: expiresAt }
        : { intentos: Math.min(ceiling, current.intentos + 1), expiraEn: current.expiraEn };
      rateWindows.set(key, next);
      return [{ intentos: next.intentos }];
    }),
    limiteIntento: {
      findUnique: jest.fn(async ({ where }) => rateWindows.get(where.clave) || null),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    testUser: user,
    testRequests: requests,
  };
  return db;
}

function createRouteHarness(db) {
  const routes = new Map();
  const app = {
    post(path, ...handlers) { routes.set(`POST ${path}`, handlers); },
    get(path, ...handlers) { routes.set(`GET ${path}`, handlers); },
  };
  const error = (res, status, codigo, mensaje) => res.status(status).json({ error: { codigo, mensaje } });
  const autenticar = (req, res, next) => req.role ? next() : error(res, 401, 'NO_AUTENTICADO', 'Debes iniciar sesión');
  const requerirRol = (role) => (req, res, next) => req.role === role
    ? next()
    : error(res, 403, 'SIN_PERMISO', 'No tienes permisos');
  registerPasswordResetRoutes(app, { db, error, autenticar, requerirRol });
  return routes;
}

async function invoke(handler, req) {
  const res = response();
  await handler(req, res);
  return res;
}

describe('flujo de recuperación de contraseña', () => {
  test('estudiante pide código, administrador aprueba y el estudiante lo usa una sola vez', async () => {
    const db = createDatabase();
    const routes = createRouteHarness(db);
    const requested = await invoke(routes.get('POST /api/v1/auth/solicitudes-recuperacion')[0], {
      body: { correo: db.testUser.correo },
    });
    expect(requested.statusCode).toBe(202);
    expect(db.testRequests).toHaveLength(1);

    const approvalHandlers = routes.get('POST /api/v1/admin/solicitudes-recuperacion/:id/aprobar');
    let denied = response();
    approvalHandlers[1]({ params: { id: db.testRequests[0].id }, role: 'ESTUDIANTE' }, denied, () => {});
    expect(denied.statusCode).toBe(403);

    const approved = await invoke(approvalHandlers[2], {
      params: { id: db.testRequests[0].id },
      role: 'ADMINISTRADOR',
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.body.data.codigo).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(db.testRequests[0].codigoHash).toBe(
      createHash('sha256').update(approved.body.data.codigo).digest('hex'),
    );
    expect(db.testRequests[0].codigoHash).not.toBe(approved.body.data.codigo);

    const resetHandler = routes.get('POST /api/v1/auth/restablecer-contrasena')[0];
    const reset = await invoke(resetHandler, {
      body: {
        codigo: approved.body.data.codigo,
        contrasenaNueva: 'only-a-test-password',
      },
    });
    expect(reset.statusCode).toBe(204);
    expect(await bcrypt.compare('only-a-test-password', db.testUser.contrasenaHash)).toBe(true);
    expect(await bcrypt.compare('old-test-password', db.testUser.contrasenaHash)).toBe(false);
    expect(db.testRequests[0].estado).toBe('COMPLETADA');
    expect(db.testRequests[0].codigoHash).toBeNull();

    const replay = await invoke(resetHandler, {
      body: {
        codigo: approved.body.data.codigo,
        contrasenaNueva: 'second-test-password',
      },
    });
    expect(replay.statusCode).toBe(400);
    expect(await bcrypt.compare('only-a-test-password', db.testUser.contrasenaHash)).toBe(true);
  });

  test('comparte el límite atómico entre instancias y reinicia al vencer la ventana', async () => {
    const db = createDatabase();
    const now = Date.parse('2026-10-24T12:00:00.000Z');
    const sql = jest.fn(db.$queryRaw);
    db.$queryRaw = sql;
    const key = 'correo:synthetic-test-digest';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(await incrementarIntentos(db, key, now, 60 * 60 * 1000, 5)).toBe(attempt + 1);
    }
    expect(await incrementarIntentos(db, key, now, 60 * 60 * 1000, 5)).toBe(6);
    expect(await incrementarIntentos(db, key, now + 60 * 60 * 1000 + 1, 60 * 60 * 1000, 5)).toBe(1);
    expect(sql.mock.calls[0][0].join(' ')).toContain('ON CONFLICT ("clave") DO UPDATE');
  });

  test('responde de forma indistinguible para un correo sin cuenta', async () => {
    const db = createDatabase();
    const handler = createRouteHarness(db).get('POST /api/v1/auth/solicitudes-recuperacion')[0];
    const existing = await invoke(handler, { body: { correo: db.testUser.correo } });
    db.usuario.findUnique.mockResolvedValueOnce(null);
    const unknown = await invoke(handler, { body: { correo: 'no-account@example.invalid' } });

    expect(unknown.statusCode).toBe(existing.statusCode);
    expect(unknown.body).toEqual(existing.body);
    expect(db.testRequests).toHaveLength(1);
  });
});
