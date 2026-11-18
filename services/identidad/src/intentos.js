async function obtenerIntentos(db, clave, ahora) {
  return (await obtenerEstadoIntentos(db, clave, ahora)).intentos;
}

async function obtenerEstadoIntentos(db, clave, ahora) {
  const limite = await db.limiteIntento.findUnique({ where: { clave } });
  if (!limite || limite.expiraEn <= new Date(ahora)) {
    return { intentos: 0, expiraEn: null };
  }
  return { intentos: limite.intentos, expiraEn: limite.expiraEn };
}

async function incrementarIntentosConExpiracion(db, clave, ahora, ventanaMs, maxIntentos) {
  const ahoraFecha = new Date(ahora);
  const nuevaExpiracion = new Date(ahora + ventanaMs);
  const filas = await db.$queryRaw`
    INSERT INTO "limites_intentos" ("clave", "intentos", "expiraEn")
    VALUES (${clave}, 1, ${nuevaExpiracion})
    ON CONFLICT ("clave") DO UPDATE SET
      "intentos" = CASE
        WHEN "limites_intentos"."expiraEn" <= ${ahoraFecha} THEN 1
        ELSE LEAST(${maxIntentos + 1}, "limites_intentos"."intentos" + 1)
      END,
      "expiraEn" = CASE
        WHEN "limites_intentos"."expiraEn" <= ${ahoraFecha} THEN ${nuevaExpiracion}
        ELSE "limites_intentos"."expiraEn"
      END
    RETURNING "intentos", "expiraEn"
  `;
  return {
    intentos: Number(filas[0]?.intentos || maxIntentos + 1),
    expiraEn: filas[0]?.expiraEn ? new Date(filas[0].expiraEn) : nuevaExpiracion,
  };
}

async function incrementarIntentos(db, clave, ahora, ventanaMs, maxIntentos) {
  return (await incrementarIntentosConExpiracion(db, clave, ahora, ventanaMs, maxIntentos)).intentos;
}

async function reiniciarIntentos(db, clave) {
  await db.limiteIntento.deleteMany({ where: { clave } });
}

async function limpiarIntentosExpirados(db, ahora) {
  await db.limiteIntento.deleteMany({ where: { expiraEn: { lte: new Date(ahora) } } });
}

module.exports = {
  incrementarIntentos,
  incrementarIntentosConExpiracion,
  limpiarIntentosExpirados,
  obtenerIntentos,
  obtenerEstadoIntentos,
  reiniciarIntentos,
};
