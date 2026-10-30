function obtenerGanadoras(candidaturas, votosPorCandidatura) {
  const votos = new Map(votosPorCandidatura.map(({ candidaturaId, votos }) => [candidaturaId, votos]));
  const maxVotos = Math.max(0, ...candidaturas.map(({ id }) => votos.get(id) || 0));
  if (maxVotos === 0) return [];
  return candidaturas.filter(({ id }) => votos.get(id) === maxVotos);
}

module.exports = { obtenerGanadoras };
