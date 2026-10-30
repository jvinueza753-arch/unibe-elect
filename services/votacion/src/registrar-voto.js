const crypto = require('node:crypto');

async function registrarVoto(db, ballot, generarComprobante = () => crypto.randomBytes(6).toString('hex').toUpperCase()) {
  const comprobante = generarComprobante();
  return db.$transaction(async (tx) => {
    const participacion = await tx.participacion.create({
      data: {
        eleccionId: ballot.eleccionId,
        usuarioId: ballot.usuarioId,
        facultad: ballot.facultad,
        carrera: ballot.carrera,
        comprobante,
      },
    });
    await tx.voto.create({
      data: {
        eleccionId: ballot.eleccionId,
        candidaturaId: ballot.candidaturaId,
        dia: new Date(new Date(ballot.fecha || Date.now()).toISOString().slice(0, 10)),
      },
    });
    return participacion;
  });
}

function comprobantePublico(participacion) {
  return { comprobante: participacion.comprobante, fecha: participacion.fecha };
}

module.exports = { comprobantePublico, registrarVoto };
