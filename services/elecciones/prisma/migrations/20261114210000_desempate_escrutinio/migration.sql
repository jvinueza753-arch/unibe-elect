ALTER TABLE "elecciones"
  ADD COLUMN "candidaturaDesempateId" UUID,
  ADD COLUMN "desempatePor" UUID,
  ADD COLUMN "desempateEn" TIMESTAMP(3),
  ADD COLUMN "motivoDesempate" TEXT,
  ADD COLUMN "hashEscrutinioDesempate" TEXT;
