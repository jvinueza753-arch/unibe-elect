const bcrypt = require('bcryptjs');
const { createHash } = require('node:crypto');
const { contrasenaSchema } = require('./password-validation');
const { incrementarIntentos } = require('./intentos');
const { registerPasswordResetRoutes } = require('./password-reset');

const STUDENT_ID = '00000000-0000-4000-8000-000000000001';
const ADMIN_ID = '00000000-0000-4000-8000-000000000002';

function createDatabase() {
  const user = {
    id: STUDENT_ID,
    correo: 'reset-test@example.invalid',
    rol: 'ESTUDIANTE',
    estado: 'ACTIVO',
    sessionVersion: 0,
    contrasenaHash: bcrypt.hashSync('old-test-password', 4),
  };
  const admin = {
    id: ADMIN_ID,
    correo: 'admin-test@example.invalid',
    rol: 'ADMINISTRADOR',
    estado: 'ACTIVO',
    nombres: 'Admin',
    apellidos: 'Test',
  };
  const users = new Map([[user.id, user], [admin.id, admin]]);
  const requests = [];
  const rateWindows = new Map();
  const matches = (item, where = {}) => {
    if (where.id && typeof where.id === 'string' && item.id !== where.id) return false;
    if (where.id?.not && item.id === where.id.not) return false;
    if (where.usuarioId && item.usuarioId !== where.usuarioId) return false;
    if (typeof where.estado === 'string' && item.estado !== where.estado) return false;
    if (where.estado?.in && !where.estado.in.includes(item.estado)) return false;
    if (where.estado?.not && item.estado === where.estado.not) return false;
    if (where.codigoHash && item.codigoHash !== where.codigoHash) return false;
    if (where.codigoExpira?.lte && !(item.codigoExpira && item.codigoExpira <= where.codigoExpira.lte)) return false;
    if (where.codigoExpira?.gt && !(item.codigoExpira && item.codigoExpira > where.codigoExpira.gt)) return false;
    if (where.solicitadaEn?.lte && !(item.solicitadaEn <= where.solicitadaEn.lte)) return false;
    if (where.solicitadaEn?.gt && !(item.solicitadaEn > where.solicitadaEn.gt)) return false;
    if (where.resueltaEn?.lt && !(item.resueltaEn && item.resueltaEn < where.resueltaEn.lt)) return false;
    if (where.usuario && (item.usuarioId !== user.id
      || (where.usuario.estado && user.estado !== where.usuario.estado)
      || (where.usuario.rol && user.rol !== where.usuario.rol))) return false;
    if (where.usuario?.is?.OR) {
      const searchFilters = where.usuario.is.OR;
      const matchesSearch = searchFilters.some((filter) => {
        const value = users.get(item.usuarioId)?.[Object.keys(filter)[0]];
        return value?.toLowerCase().includes(filter[Object.keys(filter)[0]].contains.toLowerCase());
      });
      if (!matchesSearch) return false;
    }
    return true;
  };
  const withRelations = (item) => ({
    ...item,
    usuario: users.get(item.usuarioId),
    aprobadaPor: users.get(item.aprobadaPorId) || null,
    rechazadaPor: users.get(item.rechazadaPorId) || null,
    reemitidaPor: users.get(item.reemitidaPorId) || null,
  });

  const db = {
    usuario: {
      findUnique: jest.fn(async ({ where }) => (
        where.correo ? [...users.values()].find((entry) => entry.correo === where.correo) || null
          : users.get(where.id) || null
      )),
      update: jest.fn(async ({ where, data }) => {
        const target = users.get(where.id);
        if (data.sessionVersion?.increment) target.sessionVersion += data.sessionVersion.increment;
        Object.assign(target, Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'sessionVersion')));
        return target;
      }),
    },
    solicitudRecuperacion: {
      updateMany: jest.fn(async ({ where, data }) => {
        const found = requests.filter((item) => matches(item, where));
        found.forEach((item) => Object.assign(item, data));
        return { count: found.length };
      }),
      findFirst: jest.fn(async ({ where, include }) => {
        const item = requests.find((entry) => matches(entry, where));
        if (!item) return null;
        return include?.usuario ? withRelations(item) : item;
      }),
      findUnique: jest.fn(async ({ where, include }) => {
        const item = requests.find((entry) => entry.id === where.id);
        return item ? (include?.usuario ? withRelations(item) : item) : null;
      }),
      create: jest.fn(async ({ data }) => {
        if (requests.some((item) => item.usuarioId === data.usuarioId && ['PENDIENTE', 'APROBADA'].includes(item.estado))) {
          throw Object.assign(new Error('Unique active request'), { code: 'P2002' });
        }
        const item = {
          id: `request-${requests.length + 1}`,
          estado: 'PENDIENTE',
          solicitadaEn: new Date(),
          ...data,
        };
        requests.push(item);
        return item;
      }),
      findMany: jest.fn(async ({ where, skip = 0, take = 100, orderBy }) => {
        const found = requests.filter((item) => matches(item, where));
        if (orderBy?.solicitadaEn === 'desc') found.sort((a, b) => b.solicitadaEn - a.solicitadaEn);
        return found.slice(skip, skip + take).map(withRelations);
      }),
      count: jest.fn(async ({ where }) => requests.filter((item) => matches(item, where)).length),
      deleteMany: jest.fn(async ({ where }) => {
        const remaining = requests.filter((item) => !matches(item, where));
        const count = requests.length - remaining.length;
        requests.splice(0, requests.length, ...remaining);
        return { count };
      }),
    },
    $transaction: jest.fn(async (work) => work(db)),
    $queryRaw: jest.fn(async (_strings, key, expiry, now, ceiling) => {
      const current = rateWindows.get(key);
      const next = !current || current.expiraEn <= now
        ? { intentos: 1, expiraEn: expiry }
        : { intentos: Math.min(ceiling, current.intentos + 1), expiraEn: current.expiraEn };
      rateWindows.set(key, next);
      return [{ intentos: next.intentos }];
    }),
    limiteIntento: {
      findUnique: jest.fn(async ({ where }) => rateWindows.get(where.clave) || null),
      deleteMany: jest.fn(async ({ where }) => {
        if (where.clave) return { count: Number(rateWindows.delete(where.clave)) };
        for (const [key, value] of rateWindows) {
          if (value.expiraEn <= where.expiraEn.lte) rateWindows.delete(key);
        }
        return { count: 0 };
      }),
    },
    testUser: user,
    testAdmin: admin,
    testRequests: requests,
    testRateWindows: rateWindows,
  };
  return db;
}

function createRouteHarness(db) {
  const routes = new Map();
  const app = {
    post(path, ...handlers) { routes.set(`POST ${path}`, handlers); },
    get(path, ...handlers) { routes.set(`GET ${path}`, handlers); },
  };
  const error = (res, status, codigo, mensaje, detalles) => res.status(status).json({
    error: { codigo, mensaje, ...(detalles ? { detalles } : {}) },
  });
  const passthrough = (_req, _res, next) => next();
  const requireRole = () => passthrough;
  registerPasswordResetRoutes(app, { db, error, autenticar: passthrough, requerirRol: requireRole });
  return routes;
}

async function invoke(handler, req) {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { this.ended = true; return this; },
  };
  await handler(req, res);
  return res;
}

const requestPath = '/api/v1/auth/solicitudes-recuperacion';
const resetPath = '/api/v1/auth/restablecer-contrasena';
const approvePath = '/api/v1/admin/solicitudes-recuperacion/:id/aprobar';
const rejectPath = '/api/v1/admin/solicitudes-recuperacion/:id/rechazar';
const reissuePath = '/api/v1/admin/solicitudes-recuperacion/:id/reemitir';
const listPath = '/api/v1/admin/solicitudes-recuperacion';

async function requestReset(db, routes, correo = db.testUser.correo) {
  return invoke(routes.get(`POST ${requestPath}`)[0], { body: { correo } });
}

async function approve(db, routes, id) {
  return invoke(routes.get(`POST ${approvePath}`)[2], {
    params: { id },
    usuario: { sub: db.testAdmin.id },
  });
}

async function reissue(db, routes, id) {
  return invoke(routes.get(`POST ${reissuePath}`)[2], {
    params: { id },
    usuario: { sub: db.testAdmin.id },
  });
}

async function reset(routes, codigo, contrasenaNueva = 'new-test-password-2026') {
  return invoke(routes.get(`POST ${resetPath}`)[0], { body: { codigo, contrasenaNueva } });
}

describe('flujo de recuperación de contraseña', () => {
  test('completa un ciclo y permite una nueva solicitud al mismo estudiante', async () => {
    const db = createDatabase();
    const routes = createRouteHarness(db);
    expect((await requestReset(db, routes)).statusCode).toBe(202);
    const approved = await approve(db, routes, db.testRequests[0].id);
    expect(approved.statusCode).toBe(200);
    const code = approved.body.data.codigo;
    expect(db.testRequests[0].codigoHash).toBe(createHash('sha256').update(code).digest('hex'));
    expect(db.testRequests[0].aprobadaPorId).toBe(db.testAdmin.id);
    expect(db.testRequests[0].aprobadaEn).toBeInstanceOf(Date);

    expect((await reset(routes, code)).statusCode).toBe(204);
    expect(db.testRequests[0].estado).toBe('COMPLETADA');
    expect(db.testRequests[0].codigoHash).toBeNull();
    expect(db.testUser.sessionVersion).toBe(1);
    expect(await bcrypt.compare('new-test-password-2026', db.testUser.contrasenaHash)).toBe(true);

    expect((await requestReset(db, routes)).statusCode).toBe(202);
    expect(db.testRequests).toHaveLength(2);
    expect(db.testRequests[1].estado).toBe('PENDIENTE');
  });

  test('vence el código aprobado y permite una solicitud nueva', async () => {
    const db = createDatabase();
    const routes = createRouteHarness(db);
    await requestReset(db, routes);
    const approved = await approve(db, routes, db.testRequests[0].id);
    db.testRequests[0].codigoExpira = new Date(Date.now() - 1000);

    expect((await requestReset(db, routes)).statusCode).toBe(202);
    expect(db.testRequests[0].estado).toBe('EXPIRADA');
    expect(db.testRequests[0].codigoHash).toBeNull();
    expect(db.testRequests).toHaveLength(2);
    expect((await reset(routes, approved.body.data.codigo)).statusCode).toBe(400);
  });

  test('permite reemitir código aprobado vigente e invalida el anterior', async () => {
    const db = createDatabase();
    const routes = createRouteHarness(db);
    await requestReset(db, routes);
    const approved = await approve(db, routes, db.testRequests[0].id);
    const reissued = await reissue(db, routes, db.testRequests[0].id);

    expect(reissued.statusCode).toBe(200);
    expect(db.testRequests[0].reemitidaPorId).toBe(db.testAdmin.id);
    expect(db.testRequests[0].reemitidaEn).toBeInstanceOf(Date);
    expect((await reset(routes, approved.body.data.codigo)).statusCode).toBe(400);
    expect((await reset(routes, reissued.body.data.codigo)).statusCode).toBe(204);
  });

  test('refresca una solicitud pendiente sin duplicarla', async () => {
    const db = createDatabase();
    const routes = createRouteHarness(db);
    await requestReset(db, routes);
    const originalDate = new Date(Date.now() - 60 * 60 * 1000);
    db.testRequests[0].solicitadaEn = originalDate;

    expect((await requestReset(db, routes)).statusCode).toBe(202);
    expect(db.testRequests).toHaveLength(1);
    expect(db.testRequests[0].solicitadaEn.getTime()).toBeGreaterThan(originalDate.getTime());
  });

  test('vence solicitudes pendientes por antigüedad configurable', async () => {
    const db = createDatabase();
    const routes = createRouteHarness(db);
    await requestReset(db, routes);
    const pendingTtlHours = Number(process.env.RECUPERACION_PENDIENTE_TTL_HORAS || 72);
    db.testRequests[0].solicitadaEn = new Date(Date.now() - (pendingTtlHours + 1) * 60 * 60 * 1000);
    const listed = await invoke(routes.get(`GET ${listPath}`)[2], {
      query: {},
      usuario: { sub: db.testAdmin.id },
    });

    expect(listed.statusCode).toBe(200);
    expect(db.testRequests[0].estado).toBe('EXPIRADA');
    expect(db.testRequests[0].resueltaEn).toBeInstanceOf(Date);
  });

  test('permite una solicitud nueva después de rechazar y registra actor/fecha', async () => {
    const db = createDatabase();
    const routes = createRouteHarness(db);
    await requestReset(db, routes);
    const rejected = await invoke(routes.get(`POST ${rejectPath}`)[2], {
      params: { id: db.testRequests[0].id },
      usuario: { sub: db.testAdmin.id },
    });

    expect(rejected.statusCode).toBe(204);
    expect(db.testRequests[0].estado).toBe('RECHAZADA');
    expect(db.testRequests[0].rechazadaPorId).toBe(db.testAdmin.id);
    expect(db.testRequests[0].rechazadaEn).toBeInstanceOf(Date);
    await requestReset(db, routes);
    expect(db.testRequests).toHaveLength(2);
  });

  test('no bloquea por correo tras más de cinco solicitudes repetidas', async () => {
    const db = createDatabase();
    const routes = createRouteHarness(db);
    const responses = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      responses.push(await requestReset(db, routes));
    }

    expect(responses.map((response) => response.statusCode)).toEqual([202, 202, 202, 202, 202, 202]);
    expect(db.testRequests).toHaveLength(1);
  });

  test('normaliza mayúsculas/espacios y mantiene la respuesta genérica para cuentas inelegibles', async () => {
    const db = createDatabase();
    const routes = createRouteHarness(db);
    const timings = [];
    const start = Date.now();
    const normalized = await requestReset(db, routes, '  RESET-TEST@EXAMPLE.INVALID  ');
    timings.push(Date.now() - start);
    const expected = normalized.body;
    expect(db.testRequests).toHaveLength(1);

    db.testRequests.splice(0);
    db.testUser.estado = 'INACTIVO';
    const inactiveStart = Date.now();
    const inactive = await requestReset(db, routes);
    timings.push(Date.now() - inactiveStart);
    db.testUser.estado = 'ACTIVO';
    db.testUser.rol = 'ADMINISTRADOR';
    const adminStart = Date.now();
    const administrator = await requestReset(db, routes);
    timings.push(Date.now() - adminStart);
    db.testUser.rol = 'ESTUDIANTE';
    const unknownStart = Date.now();
    const unknown = await requestReset(db, routes, 'missing@example.invalid');
    timings.push(Date.now() - unknownStart);

    for (const result of [inactive, administrator, unknown]) {
      expect(result.statusCode).toBe(normalized.statusCode);
      expect(result.body).toEqual(expected);
    }
    expect(db.testRequests).toHaveLength(0);
    expect(Math.min(...timings)).toBeGreaterThanOrEqual(240);
    expect(Math.max(...timings) - Math.min(...timings)).toBeLessThan(100);
  });

  test('reinicia el bloqueo de login, revoca sesiones e invalida otras solicitudes', async () => {
    const db = createDatabase();
    const routes = createRouteHarness(db);
    const loginKey = `login:${createHash('sha256').update(db.testUser.correo).digest('hex')}`;
    db.testRateWindows.set(loginKey, { intentos: 5, expiraEn: new Date(Date.now() + 60000) });
    await requestReset(db, routes);
    const approved = await approve(db, routes, db.testRequests[0].id);
    db.testRequests.push({
      id: 'other-open-request',
      usuarioId: db.testUser.id,
      estado: 'PENDIENTE',
      solicitadaEn: new Date(),
    });

    expect((await reset(routes, approved.body.data.codigo)).statusCode).toBe(204);
    expect(db.testRateWindows.has(loginKey)).toBe(false);
    expect(db.testUser.sessionVersion).toBe(1);
    expect(db.testRequests[1].estado).toBe('EXPIRADA');
  });

  test('no permite reutilizar la contraseña actual y valida el máximo bcrypt en bytes', async () => {
    const db = createDatabase();
    const routes = createRouteHarness(db);
    await requestReset(db, routes);
    const approved = await approve(db, routes, db.testRequests[0].id);
    const reused = await reset(routes, approved.body.data.codigo, 'old-test-password');

    expect(reused.statusCode).toBe(400);
    expect(reused.body.error.codigo).toBe('CONTRASENA_REUTILIZADA');
    expect(db.testRequests[0].estado).toBe('APROBADA');
    expect(contrasenaSchema.safeParse('é'.repeat(36)).success).toBe(true);
    expect(contrasenaSchema.safeParse('é'.repeat(37)).success).toBe(false);
  });

  test('rechaza una contraseña débil durante la recuperación sin consumir el código', async () => {
    const db = createDatabase();
    const routes = createRouteHarness(db);
    await requestReset(db, routes);
    const approved = await approve(db, routes, db.testRequests[0].id);
    const response = await reset(routes, approved.body.data.codigo, 'password1');

    expect(response.statusCode).toBe(400);
    expect(response.body.error.codigo).toBe('DATOS_INVALIDOS');
    expect(response.body.error.detalles.contrasena).toContain('LONGITUD_MINIMA');
    expect(response.body.error.detalles.contrasena).toContain('CONTRASENA_COMUN');
    expect(db.testRequests[0].estado).toBe('APROBADA');
  });

  test('dos aprobaciones concurrentes de una solicitud solo emiten un código', async () => {
    const db = createDatabase();
    const routes = createRouteHarness(db);
    await requestReset(db, routes);
    const results = await Promise.all([
      approve(db, routes, db.testRequests[0].id),
      approve(db, routes, db.testRequests[0].id),
    ]);

    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 409]);
  });

  test('dos restablecimientos concurrentes con el mismo código solo consumen una vez', async () => {
    const db = createDatabase();
    const routes = createRouteHarness(db);
    await requestReset(db, routes);
    const approved = await approve(db, routes, db.testRequests[0].id);
    const results = await Promise.all([
      reset(routes, approved.body.data.codigo, 'concurrent-password-one-2026'),
      reset(routes, approved.body.data.codigo, 'concurrent-password-two-2027'),
    ]);

    expect(results.map((result) => result.statusCode).sort()).toEqual([204, 400]);
    expect(db.testUser.sessionVersion).toBe(1);
  });

  test('la lista prioriza pendientes y devuelve paginación y contador', async () => {
    const db = createDatabase();
    const routes = createRouteHarness(db);
    db.testRequests.push(
      { id: 'approved', usuarioId: db.testUser.id, estado: 'APROBADA', solicitadaEn: new Date(Date.now() + 1000), codigoExpira: new Date(Date.now() + 3600000) },
      { id: 'pending', usuarioId: db.testUser.id, estado: 'PENDIENTE', solicitadaEn: new Date() },
    );
    const listed = await invoke(routes.get(`GET ${listPath}`)[2], {
      query: { pagina: '1', limite: '1', busqueda: 'reset-test' },
      usuario: { sub: db.testAdmin.id },
    });
    const result = listed.body.data;

    expect(listed.statusCode).toBe(200);
    expect(result.items[0].id).toBe('pending');
    expect(result.meta).toMatchObject({ pagina: 1, limite: 1, total: 2, totalPaginas: 2, pendientes: 1 });
  });

  test('el contador atómico de login respeta su ventana y límite', async () => {
    const db = createDatabase();
    const now = Date.parse('2026-10-24T12:00:00.000Z');
    const key = 'login:synthetic-test-digest';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(await incrementarIntentos(db, key, now, 60 * 60 * 1000, 5)).toBe(attempt + 1);
    }
    expect(await incrementarIntentos(db, key, now, 60 * 60 * 1000, 5)).toBe(6);
    expect(await incrementarIntentos(db, key, now + 60 * 60 * 1000 + 1, 60 * 60 * 1000, 5)).toBe(1);
  });
});
