WITH grupos AS (
  SELECT
    "id",
    FIRST_VALUE("id") OVER grupo AS id_conservar,
    SUM("votaron") OVER grupo AS votaron_total,
    SUM("habilitados") OVER grupo AS habilitados_total,
    COUNT(*) OVER grupo AS cantidad
  FROM "escrutinios_grupos"
  WINDOW grupo AS (
    PARTITION BY "escrutinioId", "facultad", "carrera"
    ORDER BY "id"
  )
)
UPDATE "escrutinios_grupos" AS grupo
SET "votaron" = grupos.votaron_total,
    "habilitados" = grupos.habilitados_total
FROM grupos
WHERE grupo."id" = grupos.id_conservar
  AND grupos.cantidad > 1;

WITH grupos AS (
  SELECT
    "id",
    FIRST_VALUE("id") OVER grupo AS id_conservar
  FROM "escrutinios_grupos"
  WINDOW grupo AS (
    PARTITION BY "escrutinioId", "facultad", "carrera"
    ORDER BY "id"
  )
)
DELETE FROM "escrutinios_grupos" AS grupo
USING grupos
WHERE grupo."id" = grupos."id"
  AND grupos."id" <> grupos.id_conservar;
