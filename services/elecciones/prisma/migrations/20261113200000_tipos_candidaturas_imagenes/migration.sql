CREATE TYPE "TipoEleccion" AS ENUM ('CANDIDATURAS', 'REFERENDUM', 'PLANCHAS');

ALTER TABLE "elecciones"
  ADD COLUMN "tipo" "TipoEleccion" NOT NULL DEFAULT 'CANDIDATURAS',
  ADD COLUMN "pregunta" TEXT,
  ADD COLUMN "ordenAleatorio" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "cargosRequeridos" TEXT[] NOT NULL DEFAULT ARRAY['PRESIDENTE', 'VICEPRESIDENTE']::TEXT[];

CREATE INDEX "elecciones_tipo_estadoGuardado_idx"
  ON "elecciones"("tipo", "estadoGuardado");

ALTER TABLE "candidaturas"
  ADD COLUMN "lema" TEXT,
  ADD COLUMN "propuestas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "codigoOpcion" TEXT;

CREATE TABLE "integrantes_plancha" (
  "id" UUID NOT NULL,
  "candidaturaId" UUID NOT NULL,
  "cargo" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "orden" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "integrantes_plancha_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "integrantes_plancha_candidaturaId_fkey"
    FOREIGN KEY ("candidaturaId") REFERENCES "candidaturas"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "integrantes_plancha_candidaturaId_cargo_orden_idx"
  ON "integrantes_plancha"("candidaturaId", "cargo", "orden");

CREATE TABLE "imagenes_candidatura" (
  "id" UUID NOT NULL,
  "candidaturaId" UUID NOT NULL,
  "tipoContenido" TEXT NOT NULL,
  "tamano" INTEGER NOT NULL,
  "datos" BYTEA NOT NULL,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "imagenes_candidatura_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "imagenes_candidatura_candidaturaId_key" UNIQUE ("candidaturaId"),
  CONSTRAINT "imagenes_candidatura_candidaturaId_fkey"
    FOREIGN KEY ("candidaturaId") REFERENCES "candidaturas"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
