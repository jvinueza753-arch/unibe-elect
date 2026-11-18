ALTER TABLE "usuarios"
  ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "solicitudes_recuperacion"
  ADD COLUMN "aprobadaPorId" UUID,
  ADD COLUMN "aprobadaEn" TIMESTAMP(3),
  ADD COLUMN "rechazadaPorId" UUID,
  ADD COLUMN "rechazadaEn" TIMESTAMP(3),
  ADD COLUMN "reemitidaPorId" UUID,
  ADD COLUMN "reemitidaEn" TIMESTAMP(3);

ALTER TABLE "solicitudes_recuperacion"
  ADD CONSTRAINT "solicitudes_recuperacion_aprobadaPorId_fkey"
    FOREIGN KEY ("aprobadaPorId") REFERENCES "usuarios"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "solicitudes_recuperacion_rechazadaPorId_fkey"
    FOREIGN KEY ("rechazadaPorId") REFERENCES "usuarios"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "solicitudes_recuperacion_reemitidaPorId_fkey"
    FOREIGN KEY ("reemitidaPorId") REFERENCES "usuarios"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
