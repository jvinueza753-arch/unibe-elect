const {
  comprobantePublico,
  esComprobanteValido,
  generarComprobante,
  registrarVoto,
  verificarComprobante,
} = require('./registrar-voto');

describe('registro de votos', () => {
  test('persiste participación y papeleta en una transacción y solo devuelve comprobante', async () => {
    const fecha = new Date('2026-10-24T12:00:00.000Z');

    const participationCreate = jest.fn().mockResolvedValue({
      id: 'private-participation-id',
      usuarioId: 'private-student-id',
      comprobante: '0123456789AB',
      fecha,
    });

    const ballotCreate = jest.fn().mockResolvedValue({ id: 'private-ballot-id' });

    const db = {
      $transaction: jest.fn((work) => work({
        participacion: { create: participationCreate },
        voto: { create: ballotCreate },
      })),
    };

    const participation = await registrarVoto(db, {
      eleccionId: 'isolated-election',
      usuarioId: 'isolated-student',
      facultad: 'Test Faculty',
      carrera: 'Test Program',
      candidaturaId: 'isolated-candidate',
      fecha: '2026-10-24T12:00:00.000Z',
    }, () => '0123456789AB');

    const receipt = comprobantePublico(participation);

    expect(db.$transaction).toHaveBeenCalledTimes(1);

    expect(participationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eleccionId: 'isolated-election',
        usuarioId: 'isolated-student',
        comprobante: '0123456789AB',
      }),
    });

    expect(ballotCreate).toHaveBeenCalledWith({
      data: {
        eleccionId: 'isolated-election',
        candidaturaId: 'isolated-candidate',
        dia: new Date('2026-10-24T00:00:00.000Z'),
      },
    });

    expect(ballotCreate.mock.calls[0][0].data).not.toHaveProperty('usuarioId');
    expect(ballotCreate.mock.calls[0][0].data).not.toHaveProperty('participacionId');

    expect(receipt).toEqual({ comprobante: '0123456789AB', fecha });

    expect(receipt).not.toHaveProperty('usuarioId');
    expect(receipt).not.toHaveProperty('candidaturaId');
    expect(receipt).not.toHaveProperty('facultad');
    expect(receipt).not.toHaveProperty('carrera');
  });

  test('rechaza fechas inválidas antes de abrir la transacción', async () => {
    const db = { $transaction: jest.fn() };

    await expect(
      registrarVoto(db, { fecha: 'fecha-invalida' })
    ).rejects.toThrow('La fecha del voto no es válida');

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  test('genera comprobantes aleatorios de 12 caracteres alfanuméricos en mayúsculas', () => {
    const recibos = Array.from({ length: 100 }, () => generarComprobante());

    for (const recibo of recibos) {
      expect(recibo).toHaveLength(12);
      expect(esComprobanteValido(recibo)).toBe(true);
    }

    expect(new Set(recibos).size).toBe(recibos.length);
  });

  test('valida el formato del comprobante sin aceptar caracteres ambiguos o minúsculas', () => {
    expect(esComprobanteValido('01AB23CD45EF')).toBe(true);
    expect(esComprobanteValido('01ab23cd45ef')).toBe(false);
    expect(esComprobanteValido('01AB23CD45E!')).toBe(false);
    expect(esComprobanteValido('CORTO')).toBe(false);
  });

  test('verifica comprobantes sin consultar ni devolver datos personales o de la candidatura', async () => {
    const fecha = new Date('2026-10-24T12:00:00.000Z');
    const findUnique = jest.fn().mockResolvedValue({ fecha });

    const result = await verificarComprobante(
      { participacion: { findUnique } },
      '0123456789AB'
    );

    expect(findUnique).toHaveBeenCalledWith({
      where: { comprobante: '0123456789AB' },
      select: { fecha: true },
    });

    expect(result).toEqual({ valido: true, fecha });

    expect(result).not.toHaveProperty('usuarioId');
    expect(result).not.toHaveProperty('eleccionId');
    expect(result).not.toHaveProperty('candidaturaId');
  });

  test('devuelve null cuando el comprobante no existe', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);

    await expect(
      verificarComprobante(
        { participacion: { findUnique } },
        '0123456789AB'
      )
    ).resolves.toBeNull();
  });

  test('propaga la colisión de unicidad para que la ruta rechace el voto duplicado', async () => {
    const duplicate = Object.assign(new Error('unique constraint'), {
      code: 'P2002',
    });

    const db = {
      $transaction: jest.fn(async () => {
        throw duplicate;
      }),
    };

    await expect(
      registrarVoto(db, {
        eleccionId: 'isolated-election',
        usuarioId: 'isolated-student',
        facultad: 'Test Faculty',
        carrera: 'Test Program',
        candidaturaId: null,
      })
    ).rejects.toMatchObject({ code: 'P2002' });

    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});