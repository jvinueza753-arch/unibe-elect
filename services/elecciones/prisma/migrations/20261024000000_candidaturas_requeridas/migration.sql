ALTER TABLE "elecciones"
ADD COLUMN "candidaturasRequeridas" INTEGER NOT NULL DEFAULT 2,
ADD CONSTRAINT "elecciones_candidaturasRequeridas_check"
CHECK ("candidaturasRequeridas" >= 2);
