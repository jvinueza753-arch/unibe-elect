const { llamarInterno } = require('/shared/interno');
const { autenticar, requerirRol } = require('/shared/auth');
const { error } = require('/shared/http');

const estado = (eleccion) => {
  if (eleccion.estadoGuardado === 'BORRADOR') return 'BORRADOR';
  if (eleccion.estadoGuardado === 'CANCELADA') return 'CANCELADA';
  const ahora = Date.now();
  if (ahora < new Date(eleccion.fechaApertura).getTime()) return 'PROGRAMADA';
  if (ahora < new Date(eleccion.fechaCierre).getTime()) return 'ABIERTA';
  return 'CERRADA';
};

const esElegible = (eleccion, usuario) =>
  (!eleccion.facultadesPermitidas.length ||
    eleccion.facultadesPermitidas.includes(usuario.facultad)) &&
  (!eleccion.carrerasPermitidas.length ||
    eleccion.carrerasPermitidas.includes(usuario.carrera));

module.exports = (app, db) => {
  const identidadUrl =
    process.env.IDENTIDAD_URL || 'http://identidad:4001';
  const votacionUrl =
    process.env.VOTACION_URL || 'http://votacion:4003';

  async function obtenerParticipacion(eleccion) {
    const filtros = new URLSearchParams({
      facultades: eleccion.facultadesPermitidas.join(','),
      carreras: eleccion.carrerasPermitidas.join(','),
    });
    const [habilitados, participacion] = await Promise.all([
      llamarInterno(
        `${identidadUrl}/internal/usuarios/conteo?${filtros.toString()}`,
      ),
      llamarInterno(
        `${votacionUrl}/internal/votacion/elecciones/${eleccion.id}/total-participacion`,
      ),
    ]);
    const totalHabilitados = habilitados.total;
    const totalVotaron = participacion.total;
    return {
      totalHabilitados,
      totalVotaron,
      pendientes: Math.max(0, totalHabilitados - totalVotaron),
      porcentaje:
        totalHabilitados === 0
          ? 0
          : Number(((totalVotaron / totalHabilitados) * 100).toFixed(1)),
    };
  }

  app.get(
    '/api/v1/elecciones/estudiante',
    autenticar,
    requerirRol('ESTUDIANTE'),
    async (req, res) => {
      const elecciones = await db.eleccion.findMany({
        where: { estadoGuardado: 'PUBLICADA' },
        orderBy: { fechaApertura: 'desc' },
      });
      const elegibles = elecciones.filter(
        (eleccion) =>
          estado(eleccion) !== 'CANCELADA' && esElegible(eleccion, req.usuario),
      );

      try {
        const participaciones = elegibles.length
          ? await llamarInterno(
              `${votacionUrl}/internal/votacion/participaciones/consultar`,
              {
                method: 'POST',
                body: JSON.stringify({
                  eleccionIds: elegibles.map((eleccion) => eleccion.id),
                  usuarioId: req.usuario.sub,
                }),
              },
            )
          : { eleccionesVotadas: [] };
        const votadas = new Set(participaciones.eleccionesVotadas);
        res.json({
          data: elegibles.map((eleccion) => ({
            ...eleccion,
            estado: estado(eleccion),
            yaVoto: votadas.has(eleccion.id),
          })),
        });
      } catch (cause) {
        console.error('No se pudo consultar la participación del estudiante', cause);
        error(
          res,
          503,
          'SERVICIO_NO_DISPONIBLE',
          'No se pudo cargar el estado de participación',
        );
      }
    },
  );

  app.get(
    '/api/v1/elecciones/panel-administrador',
    autenticar,
    requerirRol('ADMINISTRADOR'),
    async (_req, res) => {
      const elecciones = await db.eleccion.findMany({
        where: { estadoGuardado: 'PUBLICADA' },
        orderBy: { fechaCierre: 'asc' },
      });
      const abiertas = elecciones.filter(
        (eleccion) => estado(eleccion) === 'ABIERTA',
      );
      try {
        const data = await Promise.all(
          abiertas.map(async (eleccion) => ({
            ...eleccion,
            estado: 'ABIERTA',
            participacion: await obtenerParticipacion(eleccion),
          })),
        );
        res.json({ data });
      } catch (cause) {
        console.error('No se pudo cargar el panel administrativo', cause);
        error(
          res,
          503,
          'SERVICIO_NO_DISPONIBLE',
          'No se pudieron cargar los datos de participación',
        );
      }
    },
  );

  app.get(
    '/api/v1/elecciones/:id/participacion',
    autenticar,
    requerirRol('ADMINISTRADOR', 'ESTUDIANTE'),
    async (req, res) => {
      const eleccion = await db.eleccion.findUnique({
        where: { id: req.params.id },
      });
      if (!eleccion || eleccion.estadoGuardado !== 'PUBLICADA') {
        return error(res, 404, 'NO_ENCONTRADO', 'Elección no encontrada');
      }
      if (req.usuario.rol === 'ESTUDIANTE' && !esElegible(eleccion, req.usuario)) {
        return error(res, 403, 'NO_HABILITADO', 'No estás habilitado para esta elección');
      }
      if (estado(eleccion) !== 'ABIERTA') {
        return error(
          res,
          422,
          'ELECCION_NO_ABIERTA',
          'La participación en vivo solo está disponible durante la elección',
        );
      }

      try {
        res.json({ data: await obtenerParticipacion(eleccion) });
      } catch (cause) {
        console.error('No se pudo consultar la participación de la elección', cause);
        error(
          res,
          503,
          'SERVICIO_NO_DISPONIBLE',
          'No se pudo cargar la participación de la elección',
        );
      }
    },
  );
};
