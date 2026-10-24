module.exports = (app, db) => {
  app.get(
    '/internal/votacion/elecciones/:id/total-participacion',
    async (req, res) => {
      const total = await db.participacion.count({
        where: { eleccionId: req.params.id },
      });
      res.json({ data: { total } });
    },
  );
};
