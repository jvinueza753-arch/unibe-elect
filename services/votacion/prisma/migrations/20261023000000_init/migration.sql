CREATE TABLE "participaciones" ("id" UUID NOT NULL,"eleccionId" UUID NOT NULL,"usuarioId" UUID NOT NULL,"facultad" TEXT NOT NULL,"carrera" TEXT NOT NULL,"comprobante" TEXT NOT NULL,"fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "participaciones_pkey" PRIMARY KEY ("id"));
CREATE TABLE "votos" ("id" UUID NOT NULL,"eleccionId" UUID NOT NULL,"candidaturaId" UUID,"dia" DATE NOT NULL,CONSTRAINT "votos_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "participaciones_comprobante_key" ON "participaciones"("comprobante");
CREATE UNIQUE INDEX "participaciones_eleccionId_usuarioId_key" ON "participaciones"("eleccionId","usuarioId");
CREATE INDEX "participaciones_eleccionId_facultad_carrera_idx" ON "participaciones"("eleccionId","facultad","carrera");
CREATE INDEX "votos_eleccionId_idx" ON "votos"("eleccionId");
