const express = require('express');
const { z } = require('zod');
const { autenticar, requerirRol } = require('/shared/auth');
const { error } = require('/shared/http');
const { llamarInterno } = require('/shared/interno');
const { CARRERAS, CARGOS_PLANCHA, FACULTADES, OPCIONES_REFERENDUM } = require('./catalogos');
const { estado, cierreAnticipado } = require('./estado');
const { crearHandlerCerrar } = require('./cierre');
const { ordenarParaVotante } = require('./orden-boleta');
const { ESTADOS, listarElecciones, parsePagination } = require('./listado');
const {
  candidaturaSchema,
  crearEleccionSchema,
  faltantesPlanchas,
  opcionesReferendum,
  patchCandidaturaSchema,
  patchEleccionSchema,
  validarIntegrantes,
} = require('./validaciones');

const VOTACION_URL = process.env.VOTACION_URL || 'http://votacion:4003';
const imagenRaw = express.raw({
  type: () => true,
  limit: '2mb',
});
const desempateSchema = z.object({
  candidaturaId: z.string().uuid(),
  actorId: z.string().uuid(),
  motivo: z.string().trim().min(5).max(500),
  hashCanonico: z.string().regex(/^[a-f0-9]{64}$/),
});

function salida(eleccion) {
  return {
    ...eleccion,
    estado: estado(eleccion),
    cierreAnticipado: cierreAnticipado(eleccion),
  };
}

function incluirCandidaturas() {
  return {
    candidaturas: {
      orderBy: { orden: 'asc' },
      include: { integrantes: { orderBy: [{ orden: 'asc' }, { cargo: 'asc' }] } },
    },
  };
}

function candidaturasParaUsuario(eleccion, candidaturas, usuario) {
  if (usuario.rol === 'ESTUDIANTE' && eleccion.ordenAleatorio
    && eleccion.tipo !== 'REFERENDUM') {
    return ordenarParaVotante(candidaturas, usuario.sub, eleccion.id);
  }
  return candidaturas;
}

function detalle(eleccion, usuario) {
  const candidaturas = candidaturasParaUsuario(
    eleccion,
    eleccion.candidaturas || [],
    usuario,
  );
  return { ...salida(eleccion), candidaturas };
}

function datosCandidatura(candidatura, tipo) {
  const { integrantes, ...datos } = candidatura;
  return {
    ...datos,
    propuestas: datos.propuestas || [],
    ...(tipo === 'PLANCHAS' && integrantes
      ? { integrantes: { create: integrantes } }
      : {}),
  };
}

function validarCandidaturasEntrada(candidaturas, tipo) {
  if (tipo === 'REFERENDUM' && candidaturas?.length) {
    return {
      codigo: 'OPCIONES_REFERENDUM_FIJAS',
      mensaje: 'Las opciones del referéndum se generan automáticamente y no se editan',
    };
  }
  for (const [index, candidatura] of (candidaturas || []).entries()) {
    if (tipo !== 'PLANCHAS' && candidatura.integrantes?.length) {
      return {
        codigo: 'INTEGRANTES_NO_APLICAN',
        mensaje: `La candidatura ${index + 1} no puede tener integrantes por cargo`,
      };
    }
    const duplicado = validarIntegrantes(candidatura.integrantes);
    if (duplicado) {
      return {
        codigo: 'CARGO_DUPLICADO',
        mensaje: `El cargo ${duplicado} no puede repetirse en la misma plancha`,
      };
    }
  }
  return null;
}

function firmaImagen(data) {
  if (data.length >= 45
    && data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    && data.toString('ascii', 12, 16) === 'IHDR'
    && data.readUInt32BE(16) > 0
    && data.readUInt32BE(20) > 0
    && data.includes(Buffer.from('IDAT'))
    && data.subarray(-12, -4).equals(Buffer.from('0000000049454e44', 'hex'))) {
    return 'image/png';
  }
  if (data.length >= 12
    && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
    && data[data.length - 2] === 0xff && data[data.length - 1] === 0xd9) {
    return 'image/jpeg';
  }
  if (data.length >= 20
    && data.toString('ascii', 0, 4) === 'RIFF'
    && data.readUInt32LE(4) === data.length - 8
    && data.toString('ascii', 8, 12) === 'WEBP'
    && ['VP8 ', 'VP8L', 'VP8X'].includes(data.toString('ascii', 12, 16))) {
    return 'image/webp';
  }
  return null;
}

function routes(app, db) {
  app.get('/api/v1/elecciones/catalogos', autenticar, (_req, res) => res.json({
    data: {
      tipos: ['CANDIDATURAS', 'REFERENDUM', 'PLANCHAS'],
      facultades: FACULTADES,
      carreras: CARRERAS,
      cargos: CARGOS_PLANCHA,
      opcionesReferendum: OPCIONES_REFERENDUM,
    },
  }));

  app.post('/api/v1/elecciones', autenticar, requerirRol('ADMINISTRADOR'), async (req, res) => {
    const parsed = crearEleccionSchema.safeParse(req.body);
    if (!parsed.success) {
      return error(res, 400, 'DATOS_INVALIDOS', 'Datos de elección inválidos', parsed.error.flatten().fieldErrors);
    }
    const values = parsed.data;
    if (Date.parse(values.fechaCierre) <= Date.parse(values.fechaApertura)) {
      return error(res, 422, 'FECHAS_INVALIDAS', 'El cierre debe ser posterior a la apertura');
    }
    const invalidCandidates = validarCandidaturasEntrada(values.candidaturas, values.tipo);
    if (invalidCandidates) return error(res, 400, invalidCandidates.codigo, invalidCandidates.mensaje);

    const initialCandidates = values.tipo === 'REFERENDUM'
      ? opcionesReferendum()
      : values.candidaturas || [];
    const created = await db.eleccion.create({
      data: {
        titulo: values.titulo,
        descripcion: values.descripcion,
        pregunta: values.pregunta,
        fechaApertura: new Date(values.fechaApertura),
        fechaCierre: new Date(values.fechaCierre),
        candidaturasRequeridas: values.candidaturasRequeridas,
        facultadesPermitidas: values.facultadesPermitidas,
        carrerasPermitidas: values.carrerasPermitidas,
        tipo: values.tipo,
        ordenAleatorio: values.ordenAleatorio,
        ...(values.tipo === 'PLANCHAS'
          ? { cargosRequeridos: values.cargosRequeridos || ['PRESIDENTE', 'VICEPRESIDENTE'] }
          : {}),
        creadaPor: req.usuario.sub,
        candidaturas: {
          create: initialCandidates.map((candidate) => datosCandidatura(candidate, values.tipo)),
        },
      },
    });
    return res.status(201).json({ data: salida(created) });
  });

  app.get('/api/v1/elecciones/disponibles', autenticar, requerirRol('ESTUDIANTE'), async (req, res) => {
    const all = await db.eleccion.findMany({
      where: { estadoGuardado: 'PUBLICADA' },
      include: incluirCandidaturas(),
      orderBy: { creadoEn: 'desc' },
    });
    const eligible = all.filter((election) => estado(election) === 'ABIERTA'
      && (!election.facultadesPermitidas.length
        || election.facultadesPermitidas.includes(req.usuario.facultad))
      && (!election.carrerasPermitidas.length
        || election.carrerasPermitidas.includes(req.usuario.carrera)));
    let voted = [];
    if (eligible.length) {
      try {
        voted = (await llamarInterno(
          `${VOTACION_URL}/internal/votacion/participaciones/consultar`,
          {
            method: 'POST',
            body: JSON.stringify({
              eleccionIds: eligible.map(({ id }) => id),
              usuarioId: req.usuario.sub,
            }),
          },
        )).eleccionesVotadas || [];
      } catch (cause) {
        console.error('No se pudo consultar la participación del estudiante', cause);
        return error(res, 503, 'SERVICIO_NO_DISPONIBLE', 'No se pudo cargar el estado de participación');
      }
    }
    return res.json({
      data: eligible.map((election) => ({
        ...detalle(election, req.usuario),
        yaVoto: voted.includes(election.id),
      })),
    });
  });

  app.get('/api/v1/elecciones', autenticar, async (req, res) => {
    const { pagina, limite } = parsePagination(req.query.pagina, req.query.limite);
    const estadoFiltro = String(req.query.estado || '');
    if (estadoFiltro && !ESTADOS.includes(estadoFiltro)) {
      return error(res, 400, 'ESTADO_INVALIDO', 'El filtro de estado no es válido');
    }
    const result = await listarElecciones(
      db,
      { rol: req.usuario.rol, estado: estadoFiltro, pagina, limite },
      salida,
    );
    return res.json({ data: result.data, meta: result.meta });
  });

  app.get('/api/v1/elecciones/imagenes/:id', async (req, res) => {
    const image = await db.imagenCandidatura.findUnique({ where: { id: req.params.id } });
    if (!image) return error(res, 404, 'NO_ENCONTRADO', 'Imagen no encontrada');
    res.set({
      'Content-Type': image.tipoContenido,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    });
    return res.send(image.datos);
  });

  app.get('/api/v1/elecciones/:id/candidaturas', autenticar, async (req, res) => {
    const election = await db.eleccion.findUnique({
      where: { id: req.params.id },
      include: incluirCandidaturas(),
    });
    if (!election || (req.usuario.rol === 'ESTUDIANTE' && election.estadoGuardado === 'BORRADOR')) {
      return error(res, 404, 'NO_ENCONTRADO', 'Elección no encontrada');
    }
    return res.json({ data: candidaturasParaUsuario(election, election.candidaturas, req.usuario) });
  });

  app.get('/api/v1/elecciones/:id', autenticar, async (req, res) => {
    const election = await db.eleccion.findUnique({
      where: { id: req.params.id },
      include: incluirCandidaturas(),
    });
    if (!election || (req.usuario.rol === 'ESTUDIANTE' && election.estadoGuardado === 'BORRADOR')) {
      return error(res, 404, 'NO_ENCONTRADO', 'Elección no encontrada');
    }
    return res.json({ data: detalle(election, req.usuario) });
  });

  app.patch('/api/v1/elecciones/:id', autenticar, requerirRol('ADMINISTRADOR'), async (req, res) => {
    const election = await db.eleccion.findUnique({
      where: { id: req.params.id },
      include: { candidaturas: true },
    });
    if (!election) return error(res, 404, 'NO_ENCONTRADO', 'Elección no encontrada');
    if (election.estadoGuardado !== 'BORRADOR') {
      return error(res, 422, 'ELECCION_NO_EDITABLE', 'Solo se editan borradores');
    }

    const parsed = patchEleccionSchema.safeParse(req.body);
    if (!parsed.success) {
      return error(res, 400, 'DATOS_INVALIDOS', 'Datos de elección inválidos', parsed.error.flatten().fieldErrors);
    }
    const values = { ...election, ...parsed.data };
    if (values.tipo === 'REFERENDUM' && !values.pregunta?.trim()) {
      return error(res, 400, 'DATOS_INVALIDOS', 'La pregunta es obligatoria para un referéndum', {
        pregunta: ['PREGUNTA_REQUERIDA'],
      });
    }
    if (values.tipo !== 'PLANCHAS' && parsed.data.cargosRequeridos?.length) {
      return error(res, 400, 'DATOS_INVALIDOS', 'Los cargos solo aplican a elecciones de planchas');
    }
    if (parsed.data.cargosRequeridos
      && new Set(parsed.data.cargosRequeridos).size !== parsed.data.cargosRequeridos.length) {
      return error(res, 400, 'DATOS_INVALIDOS', 'No repitas cargos requeridos');
    }
    if (values.tipo !== election.tipo && election.candidaturas.length) {
      return error(res, 422, 'TIPO_NO_EDITABLE', 'No se puede cambiar el tipo después de crear candidaturas');
    }
    const open = new Date(values.fechaApertura);
    const close = new Date(values.fechaCierre);
    if (close <= open) return error(res, 422, 'FECHAS_INVALIDAS', 'El cierre debe ser posterior a la apertura');
    const data = { ...parsed.data };
    delete data.cargosRequeridos;
    if (parsed.data.fechaApertura !== undefined) {
      data.fechaApertura = new Date(parsed.data.fechaApertura);
    }
    if (parsed.data.fechaCierre !== undefined) {
      data.fechaCierre = new Date(parsed.data.fechaCierre);
    }
    const nestedOptions = values.tipo === 'REFERENDUM' && election.tipo !== 'REFERENDUM'
      ? { candidaturas: { create: opcionesReferendum() } }
      : {};
    const updated = await db.eleccion.update({
      where: { id: election.id },
      data: {
        ...data,
        ...(parsed.data.cargosRequeridos ? { cargosRequeridos: parsed.data.cargosRequeridos } : {}),
        ...nestedOptions,
      },
    });
    return res.json({ data: salida(updated) });
  });

  app.delete('/api/v1/elecciones/:id', autenticar, requerirRol('ADMINISTRADOR'), async (req, res) => {
    const election = await db.eleccion.findUnique({ where: { id: req.params.id } });
    if (!election) return error(res, 404, 'NO_ENCONTRADO', 'Elección no encontrada');
    if (election.estadoGuardado !== 'BORRADOR') {
      return error(res, 422, 'ELECCION_NO_EDITABLE', 'Solo se eliminan borradores');
    }
    await db.eleccion.delete({ where: { id: election.id } });
    return res.status(204).end();
  });

  app.post('/api/v1/elecciones/:id/candidaturas', autenticar, requerirRol('ADMINISTRADOR'), async (req, res) => {
    const election = await db.eleccion.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { candidaturas: true } } },
    });
    if (!election) return error(res, 404, 'NO_ENCONTRADO', 'Elección no encontrada');
    if (election.estadoGuardado !== 'BORRADOR') {
      return error(res, 422, 'ELECCION_NO_EDITABLE', 'Solo se editan candidaturas en borradores');
    }
    if (election.tipo === 'REFERENDUM') {
      return error(res, 422, 'OPCIONES_REFERENDUM_FIJAS', 'Las opciones del referéndum no se pueden agregar ni modificar');
    }
    if (election._count.candidaturas >= 100) {
      return error(res, 422, 'LIMITE_CANDIDATURAS', 'Una elección admite máximo 100 candidaturas');
    }
    const parsed = candidaturaSchema.safeParse(req.body);
    if (!parsed.success) {
      return error(res, 400, 'DATOS_INVALIDOS', 'Datos de candidatura inválidos', parsed.error.flatten().fieldErrors);
    }
    const invalid = validarCandidaturasEntrada([parsed.data], election.tipo);
    if (invalid) return error(res, 400, invalid.codigo, invalid.mensaje);
    const created = await db.candidatura.create({
      data: {
        ...datosCandidatura(parsed.data, election.tipo),
        eleccionId: election.id,
      },
      include: { integrantes: { orderBy: [{ orden: 'asc' }, { cargo: 'asc' }] } },
    });
    return res.status(201).json({ data: created });
  });

  app.patch('/api/v1/elecciones/:id/candidaturas/:candidaturaId', autenticar, requerirRol('ADMINISTRADOR'), async (req, res) => {
    const election = await db.eleccion.findUnique({ where: { id: req.params.id } });
    if (!election || election.estadoGuardado !== 'BORRADOR') {
      return error(res, 422, 'ELECCION_NO_EDITABLE', 'Solo se editan candidaturas en borradores');
    }
    if (election.tipo === 'REFERENDUM') {
      return error(res, 422, 'OPCIONES_REFERENDUM_FIJAS', 'Las opciones del referéndum no se pueden agregar ni modificar');
    }
    const candidate = await db.candidatura.findFirst({
      where: { id: req.params.candidaturaId, eleccionId: election.id },
    });
    if (!candidate) return error(res, 404, 'NO_ENCONTRADO', 'Candidatura no encontrada');
    const parsed = patchCandidaturaSchema.safeParse(req.body);
    if (!parsed.success) {
      return error(res, 400, 'DATOS_INVALIDOS', 'Datos de candidatura inválidos', parsed.error.flatten().fieldErrors);
    }
    const invalid = validarCandidaturasEntrada([parsed.data], election.tipo);
    if (invalid) return error(res, 400, invalid.codigo, invalid.mensaje);
    const { integrantes, ...data } = parsed.data;
    const updated = await db.$transaction(async (tx) => {
      if (election.tipo === 'PLANCHAS' && integrantes !== undefined) {
        await tx.integrantePlancha.deleteMany({ where: { candidaturaId: candidate.id } });
        if (integrantes.length) {
          data.integrantes = { create: integrantes };
        }
      }
      return tx.candidatura.update({
        where: { id: candidate.id },
        data,
        include: { integrantes: { orderBy: [{ orden: 'asc' }, { cargo: 'asc' }] } },
      });
    });
    return res.json({ data: updated });
  });

  app.delete('/api/v1/elecciones/:id/candidaturas/:candidaturaId', autenticar, requerirRol('ADMINISTRADOR'), async (req, res) => {
    const election = await db.eleccion.findUnique({ where: { id: req.params.id } });
    if (!election || election.estadoGuardado !== 'BORRADOR') {
      return error(res, 422, 'ELECCION_NO_EDITABLE', 'Solo se editan candidaturas en borradores');
    }
    if (election.tipo === 'REFERENDUM') {
      return error(res, 422, 'OPCIONES_REFERENDUM_FIJAS', 'Las opciones del referéndum no se pueden eliminar');
    }
    const result = await db.candidatura.deleteMany({
      where: { id: req.params.candidaturaId, eleccionId: election.id },
    });
    if (!result.count) return error(res, 404, 'NO_ENCONTRADO', 'Candidatura no encontrada');
    return res.status(204).end();
  });

  app.put(
    '/api/v1/elecciones/:id/candidaturas/:candidaturaId/foto',
    autenticar,
    requerirRol('ADMINISTRADOR'),
    imagenRaw,
    async (req, res) => {
      const election = await db.eleccion.findUnique({ where: { id: req.params.id } });
      if (!election || election.estadoGuardado !== 'BORRADOR') {
        return error(res, 422, 'ELECCION_NO_EDITABLE', 'Solo se suben fotos en borradores');
      }
      const candidate = await db.candidatura.findFirst({
        where: { id: req.params.candidaturaId, eleccionId: election.id },
      });
      if (!candidate) return error(res, 404, 'NO_ENCONTRADO', 'Candidatura no encontrada');
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return error(res, 400, 'DATOS_INVALIDOS', 'Envía una imagen PNG, JPEG o WebP válida');
      }
      if (req.body.length > 2 * 1024 * 1024) {
        return error(res, 413, 'IMAGEN_DEMASIADO_GRANDE', 'La imagen no puede superar 2 MB');
      }
      const declaredType = String(req.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(declaredType)) {
        return error(res, 415, 'TIPO_IMAGEN_NO_PERMITIDO', 'Solo se aceptan imágenes PNG, JPEG o WebP');
      }
      const actualType = firmaImagen(req.body);
      if (!actualType || actualType !== declaredType) {
        return error(res, 400, 'FIRMA_IMAGEN_INVALIDA', 'La firma de la imagen no coincide con su tipo declarado');
      }

      const image = await db.$transaction(async (tx) => {
        const saved = await tx.imagenCandidatura.upsert({
          where: { candidaturaId: candidate.id },
          create: {
            candidaturaId: candidate.id,
            tipoContenido: actualType,
            tamano: req.body.length,
            datos: req.body,
          },
          update: {
            tipoContenido: actualType,
            tamano: req.body.length,
            datos: req.body,
            creadoEn: new Date(),
          },
        });
        await tx.candidatura.update({
          where: { id: candidate.id },
          data: { fotoUrl: `/api/v1/elecciones/imagenes/${saved.id}` },
        });
        return saved;
      });
      return res.json({
        data: {
          candidaturaId: candidate.id,
          fotoUrl: `/api/v1/elecciones/imagenes/${image.id}`,
        },
      });
    },
  );

  app.delete('/api/v1/elecciones/:id/candidaturas/:candidaturaId/foto', autenticar, requerirRol('ADMINISTRADOR'), async (req, res) => {
    const election = await db.eleccion.findUnique({ where: { id: req.params.id } });
    if (!election || election.estadoGuardado !== 'BORRADOR') {
      return error(res, 422, 'ELECCION_NO_EDITABLE', 'Solo se quitan fotos en borradores');
    }
    const candidate = await db.candidatura.findFirst({
      where: { id: req.params.candidaturaId, eleccionId: election.id },
    });
    if (!candidate) return error(res, 404, 'NO_ENCONTRADO', 'Candidatura no encontrada');
    await db.$transaction(async (tx) => {
      await tx.imagenCandidatura.deleteMany({ where: { candidaturaId: candidate.id } });
      await tx.candidatura.update({ where: { id: candidate.id }, data: { fotoUrl: null } });
    });
    return res.status(204).end();
  });

  app.post('/api/v1/elecciones/:id/publicar', autenticar, requerirRol('ADMINISTRADOR'), async (req, res) => {
    const election = await db.eleccion.findUnique({
      where: { id: req.params.id },
      include: incluirCandidaturas(),
    });
    if (!election) return error(res, 404, 'NO_ENCONTRADO', 'Elección no encontrada');
    if (election.estadoGuardado !== 'BORRADOR') {
      return error(res, 422, 'ELECCION_NO_EDITABLE', 'La elección ya no es borrador');
    }

    if (election.tipo === 'REFERENDUM') {
      const optionsAreComplete = election.candidaturas.length === OPCIONES_REFERENDUM.length
        && OPCIONES_REFERENDUM.every((option) => election.candidaturas.some(
          (candidate) => candidate.codigoOpcion === option.codigoOpcion
            && candidate.nombre === option.nombre
            && candidate.orden === option.orden,
        ));
      if (!optionsAreComplete) {
        return error(res, 422, 'OPCIONES_REFERENDUM_INVALIDAS', 'El referéndum debe conservar las opciones Sí, No y Abstención');
      }
    } else {
      if (election.candidaturas.length < election.candidaturasRequeridas) {
        return error(
          res,
          422,
          'CANDIDATURAS_INSUFICIENTES',
          `Registra ${election.candidaturasRequeridas - election.candidaturas.length} candidaturas más antes de publicar`,
          {
            requeridas: election.candidaturasRequeridas,
            registradas: election.candidaturas.length,
            faltantes: election.candidaturasRequeridas - election.candidaturas.length,
          },
        );
      }
      if (election.tipo === 'PLANCHAS') {
        const missing = faltantesPlanchas(election.candidaturas, election.cargosRequeridos);
        if (missing.length) {
          return error(res, 422, 'PLANCHAS_INCOMPLETAS', 'Completa los cargos requeridos de cada plancha', {
            faltantes: missing,
          });
        }
        for (const candidate of election.candidaturas) {
          const duplicated = validarIntegrantes(candidate.integrantes);
          if (duplicated) {
            return error(res, 422, 'CARGO_DUPLICADO', `El cargo ${duplicated} se repite en ${candidate.nombre}`);
          }
        }
      }
    }

    if (election.fechaCierre <= election.fechaApertura
      || election.fechaApertura.getTime() < Date.now() - 5 * 60 * 1000) {
      return error(res, 422, 'FECHAS_INVALIDAS', 'Las fechas no son válidas');
    }
    const updated = await db.eleccion.update({
      where: { id: election.id },
      data: { estadoGuardado: 'PUBLICADA' },
    });
    return res.json({ data: salida(updated) });
  });

  app.post(
    '/api/v1/elecciones/:id/cerrar',
    autenticar,
    requerirRol('ADMINISTRADOR'),
    crearHandlerCerrar({ db, error, salida }),
  );

  app.post('/api/v1/elecciones/:id/cancelar', autenticar, requerirRol('ADMINISTRADOR'), async (req, res) => {
    const election = await db.eleccion.findUnique({ where: { id: req.params.id } });
    if (!election) return error(res, 404, 'NO_ENCONTRADO', 'Elección no encontrada');
    if (election.estadoGuardado !== 'PUBLICADA' || estado(election) === 'CERRADA') {
      return error(res, 422, 'ELECCION_NO_CANCELABLE', 'La elección no se puede cancelar');
    }
    const updated = await db.eleccion.update({
      where: { id: election.id },
      data: { estadoGuardado: 'CANCELADA' },
    });
    return res.json({ data: salida(updated) });
  });

  app.post('/internal/elecciones/:id/validar-voto', async (req, res) => {
    const election = await db.eleccion.findUnique({
      where: { id: req.params.id },
      include: { candidaturas: true },
    });
    if (!election || estado(election) !== 'ABIERTA') {
      return res.json({ data: { valido: false, motivo: 'ELECCION_NO_ABIERTA' } });
    }
    const body = req.body || {};
    if ((election.facultadesPermitidas.length
      && !election.facultadesPermitidas.includes(String(body.facultad || '').trim()))
      || (election.carrerasPermitidas.length
        && !election.carrerasPermitidas.includes(String(body.carrera || '').trim()))) {
      return res.json({ data: { valido: false, motivo: 'NO_HABILITADO' } });
    }
    if (election.tipo === 'REFERENDUM' && body.candidaturaId == null) {
      return res.json({
        data: {
          valido: false,
          motivo: 'CANDIDATURA_INVALIDA',
          mensaje: 'En un referéndum debes elegir Sí, No o Abstención',
        },
      });
    }
    if (body.candidaturaId && !election.candidaturas.some(({ id }) => id === body.candidaturaId)) {
      return res.json({ data: { valido: false, motivo: 'CANDIDATURA_INVALIDA' } });
    }
    return res.json({ data: { valido: true } });
  });

  app.post('/internal/elecciones/:id/desempate', async (req, res) => {
    const parsed = desempateSchema.safeParse(req.body);
    if (!parsed.success) {
      return error(res, 400, 'DATOS_INVALIDOS', 'Datos de desempate inválidos', parsed.error.flatten().fieldErrors);
    }
    const value = parsed.data;
    const election = await db.eleccion.findUnique({
      where: { id: req.params.id },
      include: { candidaturas: true },
    });
    if (!election) return error(res, 404, 'NO_ENCONTRADO', 'Elección no encontrada');
    if (estado(election) !== 'CERRADA') {
      return error(res, 422, 'ELECCION_NO_CERRADA', 'La elección debe estar cerrada');
    }
    if (!election.candidaturas.some(({ id }) => id === value.candidaturaId)) {
      return error(res, 422, 'CANDIDATURA_INVALIDA', 'La candidatura no pertenece a esta elección');
    }
    const sameDecision = (current) => current?.candidaturaDesempateId === value.candidaturaId
      && current?.desempatePor === value.actorId
      && current?.hashEscrutinioDesempate === value.hashCanonico;
    if (election.candidaturaDesempateId) {
      if (sameDecision(election)) return res.json({ data: election });
      return error(res, 409, 'DESEMPATE_YA_REGISTRADO', 'Ya existe otra decisión de desempate');
    }

    const now = new Date();
    const updated = await db.eleccion.updateMany({
      where: {
        id: election.id,
        estadoGuardado: 'PUBLICADA',
        candidaturaDesempateId: null,
        OR: [
          { cerradaEn: { not: null } },
          { fechaCierre: { lte: now } },
        ],
      },
      data: {
        candidaturaDesempateId: value.candidaturaId,
        desempatePor: value.actorId,
        desempateEn: now,
        motivoDesempate: value.motivo,
        hashEscrutinioDesempate: value.hashCanonico,
      },
    });
    if (updated.count !== 1) {
      const current = await db.eleccion.findUnique({ where: { id: election.id } });
      if (sameDecision(current)) return res.json({ data: current });
      return error(res, 409, 'DESEMPATE_YA_REGISTRADO', 'Otra decisión de desempate se registró primero');
    }
    return res.json({
      data: {
        candidaturaDesempateId: value.candidaturaId,
        desempatePor: value.actorId,
        desempateEn: now,
        motivoDesempate: value.motivo,
        hashEscrutinioDesempate: value.hashCanonico,
      },
    });
  });

  app.get('/internal/elecciones/:id', async (req, res) => {
    const election = await db.eleccion.findUnique({
      where: { id: req.params.id },
      include: incluirCandidaturas(),
    });
    if (!election) return error(res, 404, 'NO_ENCONTRADO', 'Elección no encontrada');
    return res.json({ data: detalle(election, { rol: 'ADMINISTRADOR' }) });
  });
}

module.exports = routes;
