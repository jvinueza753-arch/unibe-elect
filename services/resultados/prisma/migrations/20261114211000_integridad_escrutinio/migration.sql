ALTER TABLE "escrutinios"
  ADD COLUMN "empateResuelto" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "tipoEleccion" TEXT,
  ADD COLUMN "pregunta" TEXT,
  ADD COLUMN "snapshotJson" JSONB,
  ADD COLUMN "hashCanonico" TEXT,
  ADD COLUMN "hashPreDesempate" TEXT,
  ADD COLUMN "hashVerificado" TEXT,
  ADD COLUMN "generadoPor" UUID,
  ADD COLUMN "publicadoPor" UUID,
  ADD COLUMN "verificadoPor" UUID,
  ADD COLUMN "verificadoEn" TIMESTAMP(3),
  ADD COLUMN "candidaturaDesempateId" UUID,
  ADD COLUMN "desempatePor" UUID,
  ADD COLUMN "desempateEn" TIMESTAMP(3),
  ADD COLUMN "motivoDesempate" TEXT;

ALTER TABLE "escrutinios_candidaturas"
  ADD COLUMN "orden" INTEGER NOT NULL DEFAULT 0;
