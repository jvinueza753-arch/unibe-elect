const ESTADOS = ['BORRADOR', 'PROGRAMADA', 'ABIERTA', 'CERRADA', 'CANCELADA'];

function parsePagination(pagina, limite) {
  return {
    pagina: Math.max(1, Math.trunc(Number(pagina) || 1)),
    limite: Math.min(100, Math.max(1, Math.trunc(Number(limite) || 20))),
  };
}

function whereEstado(estado, now) {
  switch (estado) {
    case 'BORRADOR':
      return { estadoGuardado: 'BORRADOR' };
    case 'CANCELADA':
      return { estadoGuardado: 'CANCELADA' };
    case 'PROGRAMADA':
      return { estadoGuardado: 'PUBLICADA', fechaApertura: { gt: now } };
    case 'ABIERTA':
      return {
        estadoGuardado: 'PUBLICADA',
        fechaApertura: { lte: now },
        fechaCierre: { gt: now },
      };
    case 'CERRADA':
      return { estadoGuardado: 'PUBLICADA', fechaCierre: { lte: now } };
    default:
      return null;
  }
}

function buildElectionWhere(rol, estado, now) {
  const clauses = [];
  if (rol !== 'ADMINISTRADOR') clauses.push({ estadoGuardado: 'PUBLICADA' });
  if (estado) clauses.push(whereEstado(estado, now));
  if (clauses.some((clause) => clause === null)) return null;
  if (clauses.length === 0) return {};
  return clauses.length === 1 ? clauses[0] : { AND: clauses };
}

async function listarElecciones(db, { rol, estado, pagina, limite, now = new Date() }, salida) {
  const where = buildElectionWhere(rol, estado, now);
  if (where === null) {
    return { invalidState: true };
  }

  const [total, rows] = await Promise.all([
    db.eleccion.count({ where }),
    db.eleccion.findMany({
      where,
      skip: (pagina - 1) * limite,
      take: limite,
      orderBy: { creadoEn: 'desc' },
    }),
  ]);

  return {
    data: rows.map(salida),
    meta: {
      pagina,
      limite,
      total,
      totalPaginas: Math.ceil(total / limite),
    },
  };
}

module.exports = { ESTADOS, buildElectionWhere, listarElecciones, parsePagination };
