const { crearActaPdf } = require('./acta');

test('genera un PDF oficial con la huella y datos agregados', async () => {
  const pdf = await crearActaPdf({
    titulo: 'Elección universitaria',
    tipoEleccion: 'CANDIDATURAS',
    totalVotos: 12,
    votosEnBlanco: 1,
    totalHabilitados: 20,
    participacion: 60,
    empate: false,
    empateResuelto: false,
    candidaturas: [{
      nombre: 'Lista Águila',
      votos: 11,
      porcentaje: 91.67,
      ganadora: true,
    }],
    participacionPorGrupo: [{
      facultad: 'Ingeniería',
      carrera: 'Software',
      votaron: 12,
      habilitados: 20,
    }],
    generadoEn: new Date('2026-11-14T10:00:00.000Z'),
    publicadoEn: new Date('2026-11-14T11:00:00.000Z'),
    generadoPor: 'admin-id',
    verificadoPor: 'verifier-id',
    verificadoEn: new Date('2026-11-14T10:30:00.000Z'),
    verificado: true,
    hashCanonico: 'a'.repeat(64),
  });

  expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  expect(pdf.subarray(-6).toString('ascii')).toContain('%%EOF');
});
