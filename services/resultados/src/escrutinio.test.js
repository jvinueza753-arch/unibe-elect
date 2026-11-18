const {
  aplicarDesempate,
  hashCanonico,
  obtenerGanadoras,
  serializarCanonico,
  verificarHashCanonico,
} = require('./escrutinio');

const candidaturas = [
  { id: 'candidatura-1', nombre: 'Candidatura A' },
  { id: 'candidatura-2', nombre: 'Candidatura B' },
  { id: 'candidatura-3', nombre: 'Candidatura C' },
];

test('no declara ganadoras cuando todos los votos son en blanco', () => {
  expect(obtenerGanadoras(candidaturas, [])).toEqual([]);
});

test('identifica la candidatura con más votos', () => {
  const resultado = obtenerGanadoras(candidaturas, [
    { candidaturaId: 'candidatura-1', votos: 3 },
    { candidaturaId: 'candidatura-2', votos: 5 },
    { candidaturaId: 'candidatura-3', votos: 1 },
  ]);

  expect(resultado).toEqual([candidaturas[1]]);
});

test('marca como empate solo las candidaturas con el máximo de votos', () => {
  const resultado = obtenerGanadoras(candidaturas, [
    { candidaturaId: 'candidatura-1', votos: 4 },
    { candidaturaId: 'candidatura-2', votos: 2 },
    { candidaturaId: 'candidatura-3', votos: 4 },
  ]);

  expect(resultado).toEqual([candidaturas[0], candidaturas[2]]);
});

test('genera una huella estable ante distinto orden de claves y detecta cambios', () => {
  const first = { titulo: 'Consulta', candidaturas: [{ id: 'a', votos: 2 }], total: 2 };
  const same = { total: 2, candidaturas: [{ votos: 2, id: 'a' }], titulo: 'Consulta' };
  const changed = { ...same, total: 3 };
  const hash = hashCanonico(first);

  expect(serializarCanonico(first)).toBe(serializarCanonico(same));
  expect(verificarHashCanonico(same, hash)).toBe(true);
  expect(verificarHashCanonico(changed, hash)).toBe(false);
  expect(verificarHashCanonico(same, 'not-a-hash')).toBe(false);
});

test('desempata en una transacción y crea una nueva huella auditable', async () => {
  const snapshot = {
    resultado: {
      empate: true,
      candidaturas: [
        { id: 'candidatura-1', ganadora: true },
        { id: 'candidatura-2', ganadora: true },
      ],
    },
  };
  const escrutinio = {
    id: 'escrutinio-1',
    eleccionId: 'eleccion-1',
    estado: 'GENERADO',
    empate: true,
    empateResuelto: false,
    hashCanonico: hashCanonico(snapshot),
    snapshotJson: snapshot,
  };
  const updateLock = jest.fn().mockResolvedValue({ count: 1 });
  const updateCandidates = jest.fn()
    .mockResolvedValueOnce({ count: 2 })
    .mockResolvedValueOnce({ count: 1 });
  const updateSnapshot = jest.fn();
  const db = {
    $transaction: jest.fn((work) => work({
      escrutinio: { updateMany: updateLock, update: updateSnapshot },
      escrutinioCandidatura: { updateMany: updateCandidates },
    })),
  };
  const decision = {
    escrutinio,
    candidaturaId: 'candidatura-2',
    actorId: 'admin-1',
    motivo: 'Acta de desempate aprobada',
    desempateEn: new Date('2026-11-14T12:00:00.000Z'),
  };

  const result = await aplicarDesempate(db, decision);

  expect(db.$transaction).toHaveBeenCalledTimes(1);
  expect(updateLock).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ empateResuelto: false, hashCanonico: escrutinio.hashCanonico }),
  }));
  expect(result.snapshot.resultado.candidaturas).toEqual([
    { id: 'candidatura-1', ganadora: false },
    { id: 'candidatura-2', ganadora: true },
  ]);
  expect(result.snapshot.desempate).toMatchObject({
    candidaturaId: 'candidatura-2',
    actorId: 'admin-1',
    motivo: decision.motivo,
    hashBase: escrutinio.hashCanonico,
  });
  expect(verificarHashCanonico(result.snapshot, result.hashCanonico)).toBe(true);
});

test('no cambia candidaturas si otra transacción ya ganó el desempate', async () => {
  const updateCandidates = jest.fn();
  const db = {
    $transaction: jest.fn((work) => work({
      escrutinio: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      escrutinioCandidatura: { updateMany: updateCandidates },
    })),
  };

  await expect(aplicarDesempate(db, {
    escrutinio: {
      id: 'escrutinio-1',
      eleccionId: 'eleccion-1',
      estado: 'GENERADO',
      empate: true,
      empateResuelto: false,
      hashCanonico: 'a'.repeat(64),
      snapshotJson: {},
    },
    candidaturaId: 'candidatura-1',
    actorId: 'admin-1',
    motivo: 'Acta de desempate aprobada',
    desempateEn: new Date(),
  })).resolves.toBe(false);
  expect(updateCandidates).not.toHaveBeenCalled();
});
