const bcrypt = require('bcryptjs');
const { crearHandlerLogin } = require('./login');

const STUDENT = {
  id: '00000000-0000-4000-8000-000000000001',
  correo: 'estudiante@example.invalid',
  nombres: 'Estudiante',
  apellidos: 'Prueba',
  codigoEstudiantil: 'E2026',
  facultad: 'Ingeniería',
  carrera: 'Software',
  rol: 'ESTUDIANTE',
  estado: 'ACTIVO',
  sessionVersion: 0,
  contrasenaHash: bcrypt.hashSync('Student-Password-2026!', 4),
};

function createHarness() {
  const attempts = new Map();
  const userLookup = jest.fn(async ({ where }) => (
    where.correo === STUDENT.correo ? STUDENT : null
  ));
  const db = {
    usuario: { findUnique: userLookup },
    limiteIntento: {
      findUnique: jest.fn(async ({ where }) => attempts.get(where.clave) || null),
      deleteMany: jest.fn(async ({ where }) => ({ count: Number(attempts.delete(where.clave)) })),
    },
    $queryRaw: jest.fn(async (_query, clave, expiracionInicial, ahora, max) => {
      const current = attempts.get(clave);
      const next = !current || current.expiraEn <= ahora
        ? { intentos: 1, expiraEn: expiracionInicial }
        : { intentos: Math.min(max, current.intentos + 1), expiraEn: current.expiraEn };
      attempts.set(clave, next);
      return [{ intentos: next.intentos, expiraEn: next.expiraEn }];
    }),
  };
  const error = (res, status, codigo, mensaje, detalles) => res.status(status).json({
    error: { codigo, mensaje, ...(detalles ? { detalles } : {}) },
  });
  let now = Date.parse('2026-11-13T20:00:00.000Z');
  const handler = crearHandlerLogin({
    db,
    error,
    emitir: () => 'test-token',
    publico: ({ contrasenaHash, ...user }) => user,
    ahora: () => now,
  });
  const invoke = async (correo, contrasena = 'incorrecta') => {
    const headers = {};
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      set(name, value) { headers[name.toLowerCase()] = value; return this; },
      json(body) { this.body = body; return this; },
      headers,
    };
    await handler({ body: { correo, contrasena } }, res);
    return res;
  };
  return { attempts, db, invoke, get now() { return now; }, set now(value) { now = value; } };
}

describe('respuesta del login ante intentos fallidos', () => {
  test('incluye intentos restantes sin diferenciar cuentas existentes', async () => {
    const harness = createHarness();
    const known = await harness.invoke(STUDENT.correo);
    const unknown = await harness.invoke('desconocido@example.invalid');

    expect(known.statusCode).toBe(401);
    expect(known.body.error).toMatchObject({
      codigo: 'CREDENCIALES_INVALIDAS',
      detalles: { intentosRestantes: 4 },
    });
    expect(unknown.body.error).toMatchObject({
      codigo: 'CREDENCIALES_INVALIDAS',
      detalles: { intentosRestantes: 4 },
    });
  });

  test('el quinto fallo bloquea inmediatamente y entrega expiración y Retry-After', async () => {
    const harness = createHarness();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await harness.invoke(STUDENT.correo);
    }

    const response = await harness.invoke(STUDENT.correo);
    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toBe('900');
    expect(response.body.error).toMatchObject({
      codigo: 'DEMASIADOS_INTENTOS',
      mensaje: 'Demasiados intentos fallidos. Por seguridad, intenta de nuevo más tarde.',
      detalles: {
        reintentarEnSegundos: 900,
        bloqueadoHasta: new Date(harness.now + 15 * 60 * 1000).toISOString(),
        intentosMaximos: 5,
      },
    });
    expect(harness.db.usuario.findUnique).toHaveBeenCalledTimes(5);

    const blocked = await harness.invoke(STUDENT.correo);
    expect(blocked.statusCode).toBe(429);
    expect(harness.db.usuario.findUnique).toHaveBeenCalledTimes(5);
  });

  test('permite volver a intentar cuando vence la ventana', async () => {
    const harness = createHarness();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await harness.invoke(STUDENT.correo);
    }
    harness.now += 15 * 60 * 1000 + 1;

    const response = await harness.invoke(STUDENT.correo);
    expect(response.statusCode).toBe(401);
    expect(response.body.error.detalles.intentosRestantes).toBe(4);
  });

  test('una credencial válida limpia la ventana de intentos', async () => {
    const harness = createHarness();
    await harness.invoke(STUDENT.correo);

    const response = await harness.invoke(STUDENT.correo, 'Student-Password-2026!');
    expect(response.statusCode).toBe(200);
    expect(response.body.data.token).toBe('test-token');
    expect(harness.attempts.size).toBe(0);
  });
});
