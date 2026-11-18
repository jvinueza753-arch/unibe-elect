function estado(eleccion, ahora = new Date()) {
  if (eleccion.estadoGuardado === 'BORRADOR') return 'BORRADOR';
  if (eleccion.estadoGuardado === 'CANCELADA') return 'CANCELADA';
  if (eleccion.estadoGuardado !== 'PUBLICADA') return eleccion.estadoGuardado;
  const actual = ahora instanceof Date ? ahora.getTime() : new Date(ahora).getTime();
  if (eleccion.cerradaEn || actual >= new Date(eleccion.fechaCierre).getTime()) return 'CERRADA';
  if (actual < new Date(eleccion.fechaApertura).getTime()) return 'PROGRAMADA';
  return 'ABIERTA';
}

function whereEstado(estadoSolicitado, ahora) {
  switch (estadoSolicitado) {
    case 'BORRADOR':
      return { estadoGuardado: 'BORRADOR' };
    case 'CANCELADA':
      return { estadoGuardado: 'CANCELADA' };
    case 'PROGRAMADA':
      return {
        estadoGuardado: 'PUBLICADA',
        cerradaEn: null,
        fechaApertura: { gt: ahora },
      };
    case 'ABIERTA':
      return {
        estadoGuardado: 'PUBLICADA',
        cerradaEn: null,
        fechaApertura: { lte: ahora },
        fechaCierre: { gt: ahora },
      };
    case 'CERRADA':
      return {
        estadoGuardado: 'PUBLICADA',
        OR: [
          { cerradaEn: { not: null } },
          { fechaCierre: { lte: ahora } },
        ],
      };
    default:
      return null;
  }
}

function cierreAnticipado(eleccion) {
  return Boolean(
    eleccion.cerradaEn
      && new Date(eleccion.cerradaEn).getTime() < new Date(eleccion.fechaCierre).getTime(),
  );
}

module.exports = { cierreAnticipado, estado, whereEstado };
