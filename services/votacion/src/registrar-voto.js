const crypto = require('node:crypto');

// Alfabeto Base32 de Crockford: evita caracteres visualmente ambiguos.
// 12 caracteres proporcionan 60 bits de entropía (32^12 combinaciones).
const ALFABETO_COMPROBANTE = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function generarComprobante() {
  const bytes = crypto.randomBytes(12);
  let comprobante = '';

  for (const byte of bytes) {
    comprobante += ALFABETO_COMPROBANTE[byte & 31];
  }

  return comprobante;
}

function esComprobanteValido(comprobante) {
  return typeof comprobante === 'string'
    && /^[0-9A-HJKMNP-TV-Z]{12}$/.test(comprobante);
}

async function registrarVoto(db, ballot, crearComprobante = generarComprobante) {
  const comprobante = crearComprobante();
  const fechaVoto = ballot.fecha ? new Date(ballot.fecha) : new Date();

  if (Number.isNaN(fechaVoto.getTime())) {
    throw new TypeError('La fecha del voto no es válida');
  }

  const dia = new Date(`${fechaVoto.toISOString().slice(0, 10)}T00:00:00.000Z`);

  return db.$transaction(async (tx) => {
    // La participación identifica al estudiante, pero nunca guarda la candidatura.
    const participacion = await tx.participacion.create({
      data: {
        eleccionId: ballot.eleccionId,
        usuarioId: ballot.usuarioId,
        facultad: ballot.facultad,
        carrera: ballot.carrera,
        comprobante,
      },
    });

    // La papeleta no contiene usuarioId ni participacionId: se mantiene anónima.
    await tx.voto.create({
      data: {
        eleccionId: ballot.eleccionId,
        candidaturaId: ballot.candidaturaId,
        dia,
      },
    });

    return participacion;
  });
}

function comprobantePublico(participacion) {
  // Lista permitida explícita: nunca devolver usuarioId, facultad, carrera ni ids internos.
  return {
    comprobante: participacion.comprobante,
    fecha: participacion.fecha,
  };
}

async function verificarComprobante(db, comprobante) {
  const participacion = await db.participacion.findUnique({
    where: { comprobante },
    select: { fecha: true },
  });

  if (!participacion) return null;

  // No se devuelve identidad, elección, grupo académico ni información del voto.
  return {
    valido: true,
    fecha: participacion.fecha,
  };
}

module.exports = {
  comprobantePublico,
  esComprobanteValido,
  generarComprobante,
  registrarVoto,
  verificarComprobante,
};