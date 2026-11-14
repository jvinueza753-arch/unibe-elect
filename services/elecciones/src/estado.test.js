const { cierreAnticipado, estado } = require('./estado');

const now = new Date('2026-11-13T20:00:00.000Z');
const apertura = new Date('2026-11-13T19:00:00.000Z');
const cierre = new Date('2026-11-13T21:00:00.000Z');
const election = (overrides = {}) => ({
  estadoGuardado: 'PUBLICADA',
  fechaApertura: apertura,
  fechaCierre: cierre,
  cerradaEn: null,
  ...overrides,
});

describe('estado calculado de una elección', () => {
  test.each([
    [{ estadoGuardado: 'BORRADOR' }, 'BORRADOR'],
    [{ estadoGuardado: 'CANCELADA' }, 'CANCELADA'],
    [{ fechaApertura: new Date(now.getTime() + 1) }, 'PROGRAMADA'],
    [{ fechaApertura: now }, 'ABIERTA'],
    [{ fechaCierre: now }, 'CERRADA'],
    [{ cerradaEn: new Date(now.getTime() - 1) }, 'CERRADA'],
  ])('calcula %s como %s', (overrides, expected) => {
    expect(estado(election(overrides), now)).toBe(expected);
  });

  test('un cierre anticipado prevalece aunque la fecha programada siga en el futuro', () => {
    const closedEarly = election({ cerradaEn: new Date(now.getTime() - 1000) });
    expect(estado(closedEarly, now)).toBe('CERRADA');
    expect(cierreAnticipado(closedEarly)).toBe(true);
    expect(cierreAnticipado(election())).toBe(false);
  });
});
