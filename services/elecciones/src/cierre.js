const { z } = require('zod');
const { estado } = require('./estado');

const cierreSchema = z.object({
  motivo: z.string().trim().min(5).max(500),
});

function crearHandlerCerrar({ db, error, salida, ahora = () => new Date() }) {
  return async (req, res) => {
    const parsed = cierreSchema.safeParse(req.body);
    if (!parsed.success) {
      return error(res, 400, 'DATOS_INVALIDOS', 'Indica un motivo de cierre de 5 a 500 caracteres', {
        motivo: parsed.error.flatten().fieldErrors.motivo || [],
      });
    }

    const election = await db.eleccion.findUnique({ where: { id: req.params.id } });
    if (!election) return error(res, 404, 'NO_ENCONTRADO', 'Elección no encontrada');

    const closedAt = ahora();
    if (estado(election, closedAt) !== 'ABIERTA') {
      return error(res, 422, 'ELECCION_NO_ABIERTA', 'Solo se puede cerrar una elección abierta');
    }

    const update = await db.eleccion.updateMany({
      where: {
        id: election.id,
        estadoGuardado: 'PUBLICADA',
        cerradaEn: null,
        fechaApertura: { lte: closedAt },
        fechaCierre: { gt: closedAt },
      },
      data: {
        cerradaEn: closedAt,
        cerradaPor: req.usuario.sub,
        cerradaPorCorreo: req.usuario.correo,
        motivoCierre: parsed.data.motivo,
      },
    });
    if (update.count !== 1) {
      return error(res, 422, 'ELECCION_NO_ABIERTA', 'Solo se puede cerrar una elección abierta');
    }

    const closed = await db.eleccion.findUnique({ where: { id: election.id } });
    return res.json({ data: salida(closed) });
  };
}

module.exports = { crearHandlerCerrar };
