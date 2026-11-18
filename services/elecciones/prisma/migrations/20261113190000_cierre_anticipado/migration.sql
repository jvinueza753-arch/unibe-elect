ALTER TABLE "elecciones"
  ADD COLUMN "cerradaEn" TIMESTAMP(3),
  ADD COLUMN "cerradaPor" UUID,
  ADD COLUMN "cerradaPorCorreo" TEXT,
  ADD COLUMN "motivoCierre" TEXT;
