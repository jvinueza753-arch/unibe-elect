const { crearHandlerCerrar } = require('./cierre');
const { estado, cierreAnticipado } = require('./estado');

const ADMIN = {
  sub: '00000000-0000-4000-8000-000000000001',
  correo: 'admin@unibe.edu.ec',
};
const NOW = new Date('2026-11-13T20:00:00.000Z');

function election() {
  return {
    id: '00000000-0000-4000-8000-000000000010',
    estadoGuardado: 'PUBLICADA',
    fechaApertura: new Date(NOW.getTime() - 60_000),
    fechaCierre: new Date(NOW.getTime() + 60_000),
    cerradaEn: null,
  };
}

function createHarness(initialElection = election()) {
  let current = { ...initialElection };
  const db = {
    eleccion: {
      findUnique: jest.fn(async () => ({ ...current })),
      updateMany: jest.fn(async ({ where, data }) => {
        if (current.id !== where.id || current.estadoGuardado !== where.estadoGuardado
          || current.cerradaEn !== where.cerradaEn
          || current.fechaApertura > where.fechaApertura.lte
          || current.fechaCierre <= where.fechaCierre.gt) {
          return { count: 0 };
        }
        current = { ...current, ...data };
        return { count: 1 };
      }),
    },
  };
  const error = (res, status, codigo, mensaje, detalles) => res.status(status).json({
    error: { codigo, mensaje, ...(detalles ? { detalles } : {}) },
  });
  const salida = (value) => ({
    ...value,
    estado: estado(value, NOW),
    cierreAnticipado: cierreAnticipado(value),
  });
  const handler = crearHandlerCerrar({ db, error, salida, ahora: () => NOW });
  const invoke = async (body = { motivo: 'Cierre por incidencia técnica' }) => {
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; return this; },
    };
    await handler({ params: { id: initialElection.id }, body, usuario: ADMIN }, res);
    return res;
  };
  return { db, invoke, get current() { return current; } };
}

describe('cierre anticipado de elecciones', () => {
  test('exige motivo y conserva la fecha de cierre programada', async () => {
    const harness = createHarness();
    const invalid = await harness.invoke({ motivo: 'no' });

    expect(invalid.statusCode).toBe(400);
    expect(harness.db.eleccion.updateMany).not.toHaveBeenCalled();

    const response = await harness.invoke();
    expect(response.statusCode).toBe(200);
    expect(response.body.data).toMatchObject({
      cerradaEn: NOW,
      cerradaPor: ADMIN.sub,
      cerradaPorCorreo: ADMIN.correo,
      motivoCierre: 'Cierre por incidencia técnica',
      cierreAnticipado: true,
      estado: 'CERRADA',
    });
    expect(response.body.data.fechaCierre).toEqual(new Date(NOW.getTime() + 60_000));
  });

  test('la escritura condicional permite un solo ganador entre cierres concurrentes', async () => {
    const harness = createHarness();
    const results = await Promise.all([harness.invoke(), harness.invoke()]);

    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 422]);
    expect(harness.db.eleccion.updateMany).toHaveBeenCalledTimes(2);
  });

  test('rechaza una elección que ya no está abierta', async () => {
    const closed = { ...election(), fechaCierre: new Date(NOW.getTime() - 1) };
    const harness = createHarness(closed);

    expect((await harness.invoke()).statusCode).toBe(422);
    expect(harness.db.eleccion.updateMany).not.toHaveBeenCalled();
  });
});
