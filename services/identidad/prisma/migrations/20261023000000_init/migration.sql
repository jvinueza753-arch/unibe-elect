CREATE TYPE "Rol" AS ENUM ('ESTUDIANTE','ADMINISTRADOR');
CREATE TYPE "Estado" AS ENUM ('ACTIVO','INACTIVO');
CREATE TABLE "usuarios" ("id" UUID NOT NULL,"nombres" TEXT NOT NULL,"apellidos" TEXT NOT NULL,"correo" TEXT NOT NULL,"contrasenaHash" TEXT NOT NULL,"codigoEstudiantil" TEXT NOT NULL,"facultad" TEXT NOT NULL,"carrera" TEXT NOT NULL,"rol" "Rol" NOT NULL DEFAULT 'ESTUDIANTE',"estado" "Estado" NOT NULL DEFAULT 'ACTIVO',"creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"actualizadoEn" TIMESTAMP(3) NOT NULL,CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "usuarios_correo_key" ON "usuarios"("correo");
CREATE UNIQUE INDEX "usuarios_codigoEstudiantil_key" ON "usuarios"("codigoEstudiantil");
CREATE INDEX "usuarios_facultad_carrera_idx" ON "usuarios"("facultad","carrera");
