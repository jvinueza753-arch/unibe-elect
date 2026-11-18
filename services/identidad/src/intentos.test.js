const {
  incrementarIntentosConExpiracion,
  obtenerEstadoIntentos,
} = require('./intentos');

function createDb() {
  const rows = new Map();
  return {
    rows,
    limiteIntento: {
      findUnique: jest.fn(async ({ where }) => rows.get(where.clave) || null),
    },
    $queryRaw: jest.fn(async (_query, clave, expiracionInicial, ahora, max, nuevaExpiracion) => {
      const actual = rows.get(clave);
      const next = !actual || actual.expiraEn <= ahora
        ? { intentos: 1, expiraEn: expiracionInicial }
        : { intentos: Math.min(max, actual.intentos + 1), expiraEn: actual.expiraEn };
      rows.set(clave, next);
      return [{ intentos: next.intentos, expiraEn: next.expiraEn }];
    }),
  };
}

describe('ventanas de intentos de inicio de sesión', () => {
  test('devuelve expiración y contador mientras la ventana siga activa', async () => {
    const db = createDb();
    const now = Date.parse('2026-11-13T20:00:00.000Z');
    db.rows.set('login:test', { intentos: 4, expiraEn: new Date(now + 60000) });

    await expect(obtenerEstadoIntentos(db, 'login:test', now)).resolves.toEqual({
      intentos: 4,
      expiraEn: new Date(now + 60000),
    });
  });

  test('trata una ventana vencida como desbloqueada', async () => {
    const db = createDb();
    const now = Date.parse('2026-11-13T20:00:00.000Z');
    db.rows.set('login:test', { intentos: 5, expiraEn: new Date(now) });

    await expect(obtenerEstadoIntentos(db, 'login:test', now)).resolves.toEqual({
      intentos: 0,
      expiraEn: null,
    });
  });

  test('incrementa atómicamente y conserva la expiración de la ventana original', async () => {
    const db = createDb();
    const now = Date.parse('2026-11-13T20:00:00.000Z');
    const duration = 15 * 60 * 1000;

    const first = await incrementarIntentosConExpiracion(db, 'login:test', now, duration, 5);
    const second = await incrementarIntentosConExpiracion(db, 'login:test', now + 1000, duration, 5);

    expect(first).toEqual({ intentos: 1, expiraEn: new Date(now + duration) });
    expect(second).toEqual(first && { intentos: 2, expiraEn: first.expiraEn });
  });
});
