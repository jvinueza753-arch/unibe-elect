CREATE TABLE "limites_intentos" (
  "clave" TEXT NOT NULL,
  "intentos" INTEGER NOT NULL,
  "expiraEn" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "limites_intentos_pkey" PRIMARY KEY ("clave")
);

CREATE INDEX "limites_intentos_expiraEn_idx"
  ON "limites_intentos"("expiraEn");
