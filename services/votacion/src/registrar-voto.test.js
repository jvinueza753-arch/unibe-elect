const { comprobantePublico, registrarVoto } = require('./registrar-voto');

describe('registro de votos', () => {
  test('persiste participación y papeleta en una transacción y solo devuelve comprobante', async () => {
    const participationCreate = jest.fn().mockResolvedValue({
      id: 'private-participation-id',
      usuarioId: 'private-student-id',
      comprobante: 'TEST-RECEIPT',
      fecha: new Date('2026-10-24T12:00:00.000Z'),
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
    }, () => 'TEST-RECEIPT');
    const receipt = comprobantePublico(participation);

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(participationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eleccionId: 'isolated-election',
        usuarioId: 'isolated-student',
        comprobante: 'TEST-RECEIPT',
      }),
    });
    expect(ballotCreate).toHaveBeenCalledWith({
      data: {
        eleccionId: 'isolated-election',
        candidaturaId: 'isolated-candidate',
        dia: new Date('2026-10-24T00:00:00.000Z'),
      },
    });
    expect(receipt).toEqual({
      comprobante: 'TEST-RECEIPT',
      fecha: new Date('2026-10-24T12:00:00.000Z'),
    });
    expect(receipt).not.toHaveProperty('usuarioId');
    expect(receipt).not.toHaveProperty('candidaturaId');
  });

  test('propaga la colisión de unicidad para que la ruta rechace el voto duplicado', async () => {
    const duplicate = Object.assign(new Error('unique constraint'), { code: 'P2002' });
    const db = {
      $transaction: jest.fn(async () => { throw duplicate; }),
    };

    await expect(registrarVoto(db, {
      eleccionId: 'isolated-election',
      usuarioId: 'isolated-student',
      facultad: 'Test Faculty',
      carrera: 'Test Program',
      candidaturaId: null,
    })).rejects.toMatchObject({ code: 'P2002' });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});
