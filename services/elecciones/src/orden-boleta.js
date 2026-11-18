const { createHash } = require('node:crypto');

function crearGenerador(usuarioId, eleccionId) {
  const seed = createHash('sha256')
    .update(`${usuarioId}:${eleccionId}`)
    .digest()
    .readUInt32BE(0);
  let state = seed || 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function ordenarParaVotante(candidaturas, usuarioId, eleccionId) {
  const ordered = [...candidaturas];
  const random = crearGenerador(usuarioId, eleccionId);
  for (let index = ordered.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [ordered[index], ordered[swapIndex]] = [ordered[swapIndex], ordered[index]];
  }
  return ordered;
}

module.exports = { ordenarParaVotante };
