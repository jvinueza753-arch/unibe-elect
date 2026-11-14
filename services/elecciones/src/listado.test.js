const { buildElectionWhere, listarElecciones, parsePagination } = require('./listado');

describe('filtro y paginación de elecciones', () => {
  const now = new Date('2026-10-24T12:00:00.000Z');

  test('administra filtro antes de paginar por estado calculado desde fechas', async () => {
    const db = {
      eleccion: {
        count: jest.fn().mockResolvedValue(21),
        findMany: jest.fn().mockResolvedValue([{ id: 'page-2' }]),
      },
    };

    const result = await listarElecciones(
      db,
      { rol: 'ADMINISTRADOR', estado: 'ABIERTA', pagina: 2, limite: 20, now },
      (election) => election,
    );

    expect(db.eleccion.count).toHaveBeenCalledWith({
      where: {
        estadoGuardado: 'PUBLICADA',
        cerradaEn: null,
        fechaApertura: { lte: now },
        fechaCierre: { gt: now },
      },
    });
    expect(db.eleccion.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: buildElectionWhere('ADMINISTRADOR', 'ABIERTA', now),
      skip: 20,
      take: 20,
    }));
    expect(result).toEqual({
      data: [{ id: 'page-2' }],
      meta: { pagina: 2, limite: 20, total: 21, totalPaginas: 2 },
    });
  });

  test('conserva el alcance de estudiante y rechaza filtros desconocidos', async () => {
    expect(buildElectionWhere('ESTUDIANTE', '', now)).toEqual({
      estadoGuardado: 'PUBLICADA',
    });
    expect(buildElectionWhere('ESTUDIANTE', 'BORRADOR', now)).toEqual({
      AND: [{ estadoGuardado: 'PUBLICADA' }, { estadoGuardado: 'BORRADOR' }],
    });
    expect(buildElectionWhere('ADMINISTRADOR', 'DESCONOCIDO', now)).toBeNull();
  });

  test('normaliza parámetros de página y limita tamaño de página', () => {
    expect(parsePagination('2.9', '250')).toEqual({ pagina: 2, limite: 100 });
    expect(parsePagination('0', '-1')).toEqual({ pagina: 1, limite: 1 });
  });

  test('el filtro CERRADA incluye cierres anticipados o por fecha', () => {
    expect(buildElectionWhere('ADMINISTRADOR', 'CERRADA', now)).toEqual({
      estadoGuardado: 'PUBLICADA',
      OR: [
        { cerradaEn: { not: null } },
        { fechaCierre: { lte: now } },
      ],
    });
  });
});
