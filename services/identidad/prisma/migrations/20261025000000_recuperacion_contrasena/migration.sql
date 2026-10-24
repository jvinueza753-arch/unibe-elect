CREATE TYPE "EstadoSolicitudRecuperacion" AS ENUM (
  'PENDIENTE',
  'APROBADA',
  'RECHAZADA',
  'COMPLETADA',
  'EXPIRADA'
);

CREATE TABLE "solicitudes_recuperacion" (
  "id" UUID NOT NULL,
  "usuarioId" UUID NOT NULL,
  "estado" "EstadoSolicitudRecuperacion" NOT NULL DEFAULT 'PENDIENTE',
  "codigoHash" TEXT,
  "codigoExpira" TIMESTAMP(3),
  "solicitadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resueltaEn" TIMESTAMP(3),
  CONSTRAINT "solicitudes_recuperacion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "solicitudes_recuperacion_usuarioId_fkey"
    FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "solicitudes_recuperacion_codigoHash_key"
  ON "solicitudes_recuperacion"("codigoHash");
CREATE INDEX "solicitudes_recuperacion_estado_solicitadaEn_idx"
  ON "solicitudes_recuperacion"("estado", "solicitadaEn");
CREATE UNIQUE INDEX "solicitudes_recuperacion_usuario_activa_key"
  ON "solicitudes_recuperacion"("usuarioId")
  WHERE "estado" IN ('PENDIENTE', 'APROBADA');
