#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE USER identidad WITH PASSWORD 'identidad_dev' CREATEDB;
CREATE USER elecciones WITH PASSWORD 'elecciones_dev' CREATEDB;
CREATE USER votacion WITH PASSWORD 'votacion_dev' CREATEDB;
CREATE USER resultados WITH PASSWORD 'resultados_dev' CREATEDB;
CREATE DATABASE unibe_identidad OWNER identidad;
CREATE DATABASE unibe_elecciones OWNER elecciones;
CREATE DATABASE unibe_votacion OWNER votacion;
CREATE DATABASE unibe_resultados OWNER resultados;
SQL
if [ "${E2E_ISOLATED_DATABASE:-false}" = "true" ]; then
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE DATABASE unibe_test_identidad OWNER identidad;
CREATE DATABASE unibe_test_elecciones OWNER elecciones;
CREATE DATABASE unibe_test_votacion OWNER votacion;
CREATE DATABASE unibe_test_resultados OWNER resultados;
SQL
fi
