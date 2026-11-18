const { createApp, error } = require("/shared/http");
const { autenticar, requerirRol } = require("/shared/auth");
const { llamarInterno } = require("/shared/interno");
const { z } = require("zod");
const { crearActaPdf } = require("./acta");
const {
  aplicarDesempate,
  hashCanonico: calcularHashCanonico,
  obtenerGanadoras,
  verificarHashCanonico,
} = require("./escrutinio");
const db = require("./db");
const app = createApp("resultados");
app.locals.prisma = db;
const urls = {
  e: process.env.ELECCIONES_URL || "http://elecciones:4002",
  v: process.env.VOTACION_URL || "http://votacion:4003",
  i: process.env.IDENTIDAD_URL || "http://identidad:4001",
};
const formato = async (id, incluirAuditoria = true) => {
  const e = await db.escrutinio.findUnique({
    where: { eleccionId: id },
    include: {
      candidaturas: { orderBy: [{ orden: "asc" }, { candidaturaId: "asc" }] },
      grupos: { orderBy: [{ facultad: "asc" }, { carrera: "asc" }] },
    },
  });
  if (!e) return null;
  return {
    eleccionId: e.eleccionId,
    titulo: e.titulo,
    estado: e.estado,
    totalVotos: e.totalVotos,
    votosEnBlanco: e.votosEnBlanco,
    totalHabilitados: e.totalHabilitados,
    participacion: Number(e.participacion),
    empate: e.empate,
    empateResuelto: e.empateResuelto,
    tipoEleccion: e.tipoEleccion,
    pregunta: e.pregunta,
    candidaturas: e.candidaturas.map((c) => ({
      candidaturaId: c.candidaturaId,
      nombre: c.nombre,
      votos: c.votos,
      porcentaje: Number(c.porcentaje),
      ganadora: c.ganadora,
      orden: c.orden,
    })),
    participacionPorGrupo: e.grupos.map((g) => ({
      id: g.id,
      facultad: g.facultad,
      carrera: g.carrera,
      votaron: g.votaron,
      habilitados: g.habilitados,
    })),
    generadoEn: e.generadoEn,
    publicadoEn: e.publicadoEn,
    hashCanonico: e.hashCanonico,
    verificado: Boolean(e.hashCanonico && e.hashVerificado === e.hashCanonico),
    verificadoEn: e.verificadoEn,
    candidaturaDesempateId: e.candidaturaDesempateId,
    desempateEn: e.desempateEn,
    motivoDesempate: e.motivoDesempate,
    ...(incluirAuditoria ? {
      snapshot: e.snapshotJson,
      generadoPor: e.generadoPor,
      publicadoPor: e.publicadoPor,
      verificadoPor: e.verificadoPor,
      desempatePor: e.desempatePor,
    } : {}),
  };
};

function snapshotDeEscrutinio(escrutinio) {
  return {
    version: 1,
    eleccion: {
      id: escrutinio.eleccionId,
      titulo: escrutinio.titulo,
      tipo: escrutinio.tipoEleccion,
      pregunta: escrutinio.pregunta,
    },
    resultado: {
      totalVotos: escrutinio.totalVotos,
      votosEnBlanco: escrutinio.votosEnBlanco,
      totalHabilitados: escrutinio.totalHabilitados,
      participacion: Number(escrutinio.participacion),
      empate: escrutinio.empate,
      candidaturas: escrutinio.candidaturas.map((c) => ({
        id: c.candidaturaId,
        nombre: c.nombre,
        votos: c.votos,
        porcentaje: Number(c.porcentaje),
        ganadora: c.ganadora,
        orden: c.orden,
      })),
      grupos: escrutinio.grupos
        .map((group) => ({
          facultad: group.facultad,
          carrera: group.carrera,
          votaron: group.votaron,
          habilitados: group.habilitados,
        }))
        .sort((a, b) => `${a.facultad}\u0000${a.carrera}`.localeCompare(`${b.facultad}\u0000${b.carrera}`)),
    },
    generadoEn: new Date(escrutinio.generadoEn).toISOString(),
    generadoPor: escrutinio.generadoPor || null,
  };
}

function validarDesempateBody(body) {
  return z.object({
    candidaturaId: z.string().uuid(),
    motivo: z.string().trim().min(5).max(500),
  }).safeParse(body);
}
app.post(
  "/api/v1/resultados/elecciones/:id/escrutinio",
  autenticar,
  requerirRol("ADMINISTRADOR"),
  async (req, res) => {
    const previo = await formato(req.params.id);
    if (previo) return res.json({ data: previo });
    try {
      const eleccion = await llamarInterno(
        `${urls.e}/internal/elecciones/${req.params.id}`,
      );
      if (eleccion.estado !== "CERRADA")
        return error(
          res,
          422,
          "ELECCION_NO_CERRADA",
          "La elección debe estar cerrada",
        );
      const [conteo, participacion, habilitados] = await Promise.all([
        llamarInterno(
          `${urls.v}/internal/votacion/elecciones/${req.params.id}/conteo`,
        ),
        llamarInterno(
          `${urls.v}/internal/votacion/elecciones/${req.params.id}/participacion`,
        ),
        llamarInterno(
          `${urls.i}/internal/usuarios/conteo?facultades=${encodeURIComponent(eleccion.facultadesPermitidas.join(","))}&carreras=${encodeURIComponent(eleccion.carrerasPermitidas.join(","))}`,
        ),
      ]);
      const totalHabilitados = habilitados.total,
        totalVotos = conteo.totalVotos,
        ganadoras = obtenerGanadoras(
          eleccion.candidaturas,
          conteo.porCandidatura,
        );
      const generadoEn = new Date();
      const candidaturas = eleccion.candidaturas.map((c, orden) => {
        const votos =
          conteo.porCandidatura.find((x) => x.candidaturaId === c.id)?.votos || 0;
        return {
          candidaturaId: c.id,
          nombre: c.nombre,
          votos,
          porcentaje: totalVotos
            ? Number(((votos / totalVotos) * 100).toFixed(2))
            : 0,
          ganadora: ganadoras.some((g) => g.id === c.id),
          orden,
        };
      });
      const grupos = habilitados.porGrupo.map((group) => ({
        facultad: group.facultad,
        carrera: group.carrera,
        habilitados: group.total,
        votaron:
          participacion.porGrupo.find(
            (voteGroup) => voteGroup.facultad === group.facultad
              && voteGroup.carrera === group.carrera,
          )?.votaron || 0,
      }));
      const snapshot = {
        version: 1,
        eleccion: {
          id: eleccion.id,
          titulo: eleccion.titulo,
          tipo: eleccion.tipo || "CANDIDATURAS",
          pregunta: eleccion.pregunta || null,
          fechaApertura: new Date(eleccion.fechaApertura).toISOString(),
          fechaCierre: new Date(eleccion.fechaCierre).toISOString(),
          cerradaEn: eleccion.cerradaEn ? new Date(eleccion.cerradaEn).toISOString() : null,
          cerradaPor: eleccion.cerradaPor || null,
          motivoCierre: eleccion.motivoCierre || null,
          facultadesPermitidas: eleccion.facultadesPermitidas || [],
          carrerasPermitidas: eleccion.carrerasPermitidas || [],
          candidaturas: eleccion.candidaturas.map((candidate) => ({
            id: candidate.id,
            nombre: candidate.nombre,
            codigoOpcion: candidate.codigoOpcion || null,
            descripcion: candidate.descripcion || null,
            lema: candidate.lema || null,
            propuestas: candidate.propuestas || [],
            integrantes: (candidate.integrantes || []).map((member) => ({
              cargo: member.cargo,
              nombre: member.nombre,
            })),
          })),
        },
        resultado: {
          totalVotos,
          votosEnBlanco: conteo.votosEnBlanco,
          totalHabilitados,
          participacion: totalHabilitados
            ? Number(((participacion.total / totalHabilitados) * 100).toFixed(2))
            : 0,
          empate: ganadoras.length > 1,
          candidaturas: candidaturas.map(({ candidaturaId, ...candidate }) => ({
            id: candidaturaId,
            ...candidate,
          })),
          grupos: [...grupos].sort((a, b) => (
            `${a.facultad}\u0000${a.carrera}`.localeCompare(`${b.facultad}\u0000${b.carrera}`)
          )),
        },
        generadoEn: generadoEn.toISOString(),
        generadoPor: req.usuario.sub,
      };
      const creado = await db.escrutinio.create({
        data: {
          eleccionId: req.params.id,
          titulo: eleccion.titulo,
          totalVotos,
          votosEnBlanco: conteo.votosEnBlanco,
          totalHabilitados,
          participacion: snapshot.resultado.participacion,
          empate: ganadoras.length > 1,
          tipoEleccion: snapshot.eleccion.tipo,
          pregunta: snapshot.eleccion.pregunta,
          snapshotJson: snapshot,
          hashCanonico: calcularHashCanonico(snapshot),
          generadoPor: req.usuario.sub,
          generadoEn,
          candidaturas: {
            create: candidaturas,
          },
          grupos: {
            create: grupos,
          },
        },
      });
      res.status(201).json({ data: await formato(creado.eleccionId) });
    } catch (cause) {
      if (cause.code === "P2002") {
        const existente = await formato(req.params.id);
        if (existente) return res.json({ data: existente });
      }
      const status = Number(cause.status);
      if (Number.isInteger(status) && status >= 400 && status < 500) {
        return error(
          res,
          status,
          cause.body?.error?.codigo || "SOLICITUD_INVALIDA",
          cause.body?.error?.mensaje || "No se pudo generar el escrutinio",
        );
      }
      const networkCode = cause.code || cause.cause?.code || cause.name;
      if (["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "ETIMEDOUT", "AbortError"].includes(networkCode)
        || (Number.isInteger(status) && status >= 500)) {
        console.error("No se pudo consultar un servicio para generar el escrutinio", {
          status: status || 503,
          code: networkCode,
        });
        return error(
          res,
          503,
          "SERVICIO_NO_DISPONIBLE",
          "No se pudo generar el escrutinio por un servicio dependiente",
        );
      }
      throw cause;
    }
  },
);
app.post(
  "/api/v1/resultados/elecciones/:id/verificar",
  autenticar,
  requerirRol("ADMINISTRADOR"),
  async (req, res) => {
    const escrutinio = await db.escrutinio.findUnique({
      where: { eleccionId: req.params.id },
      include: {
        candidaturas: { orderBy: [{ orden: "asc" }, { candidaturaId: "asc" }] },
        grupos: { orderBy: [{ facultad: "asc" }, { carrera: "asc" }] },
      },
    });
    if (!escrutinio)
      return error(res, 404, "NO_ENCONTRADO", "Escrutinio no encontrado");

    const snapshot = escrutinio.snapshotJson || snapshotDeEscrutinio(escrutinio);
    const hash = escrutinio.hashCanonico || calcularHashCanonico(snapshot);
    if (!verificarHashCanonico(snapshot, hash))
      return error(res, 422, "HUELLA_INVALIDA", "La huella del escrutinio no coincide con su copia");

    const verificadoEn = new Date();
    const actualizado = await db.escrutinio.updateMany({
      where: {
        eleccionId: escrutinio.eleccionId,
        hashCanonico: escrutinio.hashCanonico,
      },
      data: {
        snapshotJson: snapshot,
        hashCanonico: hash,
        hashVerificado: hash,
        verificadoPor: req.usuario.sub,
        verificadoEn,
        ...(escrutinio.tipoEleccion ? {} : { tipoEleccion: "CANDIDATURAS" }),
      },
    });
    if (actualizado.count !== 1)
      return error(res, 409, "ESCRUTINIO_CAMBIO", "El escrutinio cambió durante la verificación; vuelve a intentarlo");
    return res.json({ data: await formato(escrutinio.eleccionId) });
  },
);

app.post(
  "/api/v1/resultados/elecciones/:id/desempatar",
  autenticar,
  requerirRol("ADMINISTRADOR"),
  async (req, res) => {
    const parsed = validarDesempateBody(req.body);
    if (!parsed.success)
      return error(res, 400, "DATOS_INVALIDOS", "Indica una candidatura empatada y el motivo", parsed.error.flatten().fieldErrors);
    const { candidaturaId, motivo } = parsed.data;
    const escrutinio = await db.escrutinio.findUnique({
      where: { eleccionId: req.params.id },
      include: { candidaturas: true },
    });
    if (!escrutinio)
      return error(res, 404, "NO_ENCONTRADO", "Escrutinio no encontrado");
    if (escrutinio.empateResuelto) {
      if (escrutinio.candidaturaDesempateId === candidaturaId)
        return res.json({ data: await formato(escrutinio.eleccionId) });
      return error(res, 409, "DESEMPATE_YA_REGISTRADO", "Ya existe otra decisión de desempate");
    }
    if (escrutinio.estado !== "GENERADO" || !escrutinio.empate)
      return error(res, 422, "DESEMPATE_NO_DISPONIBLE", "Solo se puede desempatar un escrutinio generado con empate");
    if (!escrutinio.snapshotJson || !verificarHashCanonico(escrutinio.snapshotJson, escrutinio.hashCanonico))
      return error(res, 422, "HUELLA_INVALIDA", "Verifica la integridad del escrutinio antes de desempatar");
    if (escrutinio.hashVerificado !== escrutinio.hashCanonico)
      return error(res, 422, "ESCRUTINIO_NO_VERIFICADO", "Verifica el escrutinio antes de desempatar");
    const empatadas = escrutinio.candidaturas.filter((candidatura) => candidatura.ganadora);
    if (!empatadas.some((candidatura) => candidatura.candidaturaId === candidaturaId))
      return error(res, 422, "CANDIDATURA_NO_EMPATADA", "Selecciona una de las candidaturas empatadas");

    let decision;
    try {
      decision = await llamarInterno(
        `${urls.e}/internal/elecciones/${req.params.id}/desempate`,
        {
          method: "POST",
          body: JSON.stringify({
            candidaturaId,
            actorId: req.usuario.sub,
            motivo,
            hashCanonico: escrutinio.hashCanonico,
          }),
        },
      );
    } catch (cause) {
      const code = cause.body?.error?.codigo;
      if (cause.status === 409)
        return error(res, 409, code || "DESEMPATE_YA_REGISTRADO", cause.message);
      if (cause.status === 404 || cause.status === 422)
        return error(res, cause.status, code || "DESEMPATE_NO_VALIDO", cause.message);
      console.error("No se pudo registrar el desempate en elecciones", {
        status: cause.status || 503,
        message: cause.message,
      });
      return error(res, 503, "SERVICIO_NO_DISPONIBLE", "No se pudo registrar la decisión de desempate");
    }
    if (decision.candidaturaDesempateId !== candidaturaId
      || decision.hashEscrutinioDesempate !== escrutinio.hashCanonico)
      return error(res, 409, "DESEMPATE_YA_REGISTRADO", "Otra decisión de desempate se registró primero");

    const desempateEn = new Date(decision.desempateEn);
    const resolved = await aplicarDesempate(db, {
      escrutinio,
      candidaturaId,
      actorId: decision.desempatePor,
      motivo: decision.motivoDesempate,
      desempateEn,
    });
    if (!resolved) {
      const current = await db.escrutinio.findUnique({
        where: { eleccionId: escrutinio.eleccionId },
      });
      if (current?.empateResuelto && current.candidaturaDesempateId === candidaturaId)
        return res.json({ data: await formato(escrutinio.eleccionId) });
      return error(res, 409, "DESEMPATE_YA_REGISTRADO", "Otra decisión de desempate se registró primero");
    }
    return res.json({ data: await formato(escrutinio.eleccionId) });
  },
);

app.post(
  "/api/v1/resultados/elecciones/:id/publicar",
  autenticar,
  requerirRol("ADMINISTRADOR"),
  async (req, res) => {
    const e = await db.escrutinio.findUnique({
      where: { eleccionId: req.params.id },
    });
    if (!e)
      return error(
        res,
        422,
        "ESCRUTINIO_NO_GENERADO",
        "Genera primero el escrutinio",
      );
    if (e.estado !== "PUBLICADO" && e.empate && !e.empateResuelto)
      return error(res, 422, "EMPATE_PENDIENTE", "Resuelve el empate antes de publicar los resultados");
    if (e.estado !== "PUBLICADO"
      && (!e.hashCanonico || e.hashVerificado !== e.hashCanonico))
      return error(res, 422, "ESCRUTINIO_NO_VERIFICADO", "Verifica la integridad del escrutinio antes de publicarlo");
    const updated =
      e.estado === "PUBLICADO"
        ? e
        : await db.escrutinio.update({
            where: { eleccionId: req.params.id },
            data: {
              estado: "PUBLICADO",
              publicadoEn: new Date(),
              publicadoPor: req.usuario.sub,
            },
          });
    res.json({ data: await formato(updated.eleccionId) });
  },
);
app.get(
  "/api/v1/resultados/elecciones/:id/participacion",
  autenticar,
  requerirRol("ADMINISTRADOR"),
  async (req, res) => {
    const e = await formato(req.params.id);
    if (!e) return error(res, 404, "NO_ENCONTRADO", "Escrutinio no encontrado");
    res.json({
      data: {
        totalVotos: e.totalVotos,
        totalHabilitados: e.totalHabilitados,
        participacion: e.participacion,
        porGrupo: e.participacionPorGrupo,
      },
    });
  },
);
app.get(
  "/api/v1/resultados/elecciones/:id/exportar",
  autenticar,
  requerirRol("ADMINISTRADOR"),
  async (req, res) => {
    const e = await formato(req.params.id);
    if (!e) return error(res, 404, "NO_ENCONTRADO", "Escrutinio no encontrado");
    const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [
      "candidatura,votos,porcentaje",
      ...e.candidaturas.map((c) => `${q(c.nombre)},${c.votos},${c.porcentaje}`),
      `${q("Voto en blanco")},${e.votosEnBlanco},${e.totalVotos ? Number(((e.votosEnBlanco / e.totalVotos) * 100).toFixed(2)) : 0}`,
      `${q("Total")},${e.totalVotos},100`,
    ];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="escrutinio-${req.params.id}.csv"`,
    );
    res.send("\uFEFF" + rows.join("\r\n"));
  },
);
app.get(
  "/api/v1/resultados/elecciones/:id/acta.pdf",
  autenticar,
  requerirRol("ADMINISTRADOR"),
  async (req, res) => {
    const escrutinio = await formato(req.params.id);
    if (!escrutinio)
      return error(res, 404, "NO_ENCONTRADO", "Escrutinio no encontrado");
    if (escrutinio.estado !== "PUBLICADO" || !escrutinio.verificado)
      return error(res, 422, "ACTA_NO_DISPONIBLE", "Publica y verifica los resultados antes de descargar el acta");
    const documento = await crearActaPdf(escrutinio);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="acta-${req.params.id}.pdf"`,
    );
    res.setHeader("Content-Length", String(documento.length));
    return res.send(documento);
  },
);
app.get("/api/v1/resultados", autenticar, async (req, res) => {
  const where =
    req.usuario.rol === "ADMINISTRADOR" ? {} : { estado: "PUBLICADO" };
  const rows = await db.escrutinio.findMany({
    where,
    orderBy: { generadoEn: "desc" },
  });
  res.json({
    data: rows.map((e) => ({
      eleccionId: e.eleccionId,
      titulo: e.titulo,
      estado: e.estado,
      publicadoEn: e.publicadoEn,
      generadoEn: e.generadoEn,
    })),
  });
});
app.get("/api/v1/resultados/elecciones/:id", autenticar, async (req, res) => {
  const e = await formato(req.params.id, req.usuario.rol === "ADMINISTRADOR");
  if (!e || (req.usuario.rol !== "ADMINISTRADOR" && e.estado !== "PUBLICADO"))
    return error(res, 404, "NO_ENCONTRADO", "Resultado no encontrado");
  res.json({ data: e });
});
app.use((req, res) => error(res, 404, "NO_ENCONTRADO", "Ruta no encontrada"));
app.use((err, _req, res, _next) => {
  console.error(err);
  error(res, 500, "ERROR_INTERNO", "Ocurrió un error interno");
});
const server = app.listen(process.env.PORT || 4004, () =>
  console.log("Resultados listo"),
);
process.on("SIGTERM", async () => {
  server.close();
  await db.$disconnect();
});
