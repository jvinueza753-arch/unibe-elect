const { createHash, timingSafeEqual } = require('node:crypto');

function obtenerGanadoras(candidaturas, votosPorCandidatura) {
  const votos = new Map(votosPorCandidatura.map(({ candidaturaId, votos }) => [candidaturaId, votos]));
  const maxVotos = Math.max(0, ...candidaturas.map(({ id }) => votos.get(id) || 0));
  if (maxVotos === 0) return [];
  return candidaturas.filter(({ id }) => votos.get(id) === maxVotos);
}

function canonizar(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonizar);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => [key, canonizar(value[key])]),
    );
  }
  return value;
}

function serializarCanonico(snapshot) {
  return JSON.stringify(canonizar(snapshot));
}

function hashCanonico(snapshot) {
  return createHash('sha256').update(serializarCanonico(snapshot)).digest('hex');
}

function verificarHashCanonico(snapshot, expectedHash) {
  if (!snapshot || !/^[a-f0-9]{64}$/.test(expectedHash || '')) return false;
  const actual = Buffer.from(hashCanonico(snapshot), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function aplicarDesempate(db, {
  escrutinio,
  candidaturaId,
  actorId,
  motivo,
  desempateEn,
}) {
  return db.$transaction(async (tx) => {
    const lock = await tx.escrutinio.updateMany({
      where: {
        eleccionId: escrutinio.eleccionId,
        estado: 'GENERADO',
        empate: true,
        empateResuelto: false,
        hashCanonico: escrutinio.hashCanonico,
      },
      data: {
        empateResuelto: true,
        candidaturaDesempateId: candidaturaId,
        desempatePor: actorId,
        desempateEn,
        motivoDesempate: motivo,
        hashPreDesempate: escrutinio.hashCanonico,
        hashVerificado: null,
        verificadoPor: null,
        verificadoEn: null,
      },
    });
    if (lock.count !== 1) return false;

    await tx.escrutinioCandidatura.updateMany({
      where: { escrutinioId: escrutinio.id },
      data: { ganadora: false },
    });
    const winner = await tx.escrutinioCandidatura.updateMany({
      where: { escrutinioId: escrutinio.id, candidaturaId },
      data: { ganadora: true },
    });
    if (winner.count !== 1) throw new Error('La candidatura seleccionada no pertenece al escrutinio');

    const snapshot = {
      ...escrutinio.snapshotJson,
      resultado: {
        ...escrutinio.snapshotJson.resultado,
        empateResuelto: true,
        candidaturas: escrutinio.snapshotJson.resultado.candidaturas.map((candidatura) => ({
          ...candidatura,
          ganadora: candidatura.id === candidaturaId,
        })),
      },
      desempate: {
        candidaturaId,
        actorId,
        motivo,
        desempateEn: desempateEn.toISOString(),
        hashBase: escrutinio.hashCanonico,
      },
    };
    const hash = hashCanonico(snapshot);
    await tx.escrutinio.update({
      where: { eleccionId: escrutinio.eleccionId },
      data: { snapshotJson: snapshot, hashCanonico: hash },
    });
    return { hashCanonico: hash, snapshot };
  });
}

module.exports = {
  aplicarDesempate,
  canonizar,
  hashCanonico,
  obtenerGanadoras,
  serializarCanonico,
  verificarHashCanonico,
};
