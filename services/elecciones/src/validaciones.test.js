const {
  crearEleccionSchema,
  faltantesPlanchas,
  opcionesReferendum,
  validarIntegrantes,
} = require('./validaciones');

const dates = {
  fechaApertura: '2027-01-01T10:00:00.000Z',
  fechaCierre: '2027-01-01T11:00:00.000Z',
};

describe('validación de tipos de elección', () => {
  test('aplica valores predeterminados en elecciones de candidaturas', () => {
    const parsed = crearEleccionSchema.parse({ titulo: 'Representantes', ...dates });

    expect(parsed).toMatchObject({
      tipo: 'CANDIDATURAS',
      candidaturasRequeridas: 2,
      facultadesPermitidas: [],
      carrerasPermitidas: [],
      ordenAleatorio: true,
    });
  });

  test('exige pregunta para referéndum y no permite opciones arbitrarias', () => {
    const withoutQuestion = crearEleccionSchema.safeParse({
      titulo: 'Consulta',
      tipo: 'REFERENDUM',
      ...dates,
    });
    const withCustomOptions = crearEleccionSchema.safeParse({
      titulo: 'Consulta',
      tipo: 'REFERENDUM',
      pregunta: '¿Aprueba la propuesta?',
      candidaturas: [{ nombre: 'Tal vez' }],
      ...dates,
    });

    expect(withoutQuestion.success).toBe(false);
    expect(withCustomOptions.success).toBe(false);
    expect(opcionesReferendum().map(({ codigoOpcion }) => codigoOpcion)).toEqual([
      'SI',
      'NO',
      'ABSTENCION',
    ]);
  });

  test('rechaza cargos repetidos y reporta los requeridos que faltan por plancha', () => {
    const parsed = crearEleccionSchema.safeParse({
      titulo: 'Representantes',
      tipo: 'PLANCHAS',
      cargosRequeridos: ['PRESIDENTE', 'PRESIDENTE'],
      ...dates,
    });

    expect(parsed.success).toBe(false);
    expect(validarIntegrantes([
      { cargo: 'PRESIDENTE', nombre: 'Ana' },
      { cargo: 'PRESIDENTE', nombre: 'Luis' },
    ])).toBe('PRESIDENTE');
    expect(faltantesPlanchas([
      {
        id: 'plancha-1',
        nombre: 'Plancha A',
        integrantes: [{ cargo: 'PRESIDENTE', nombre: 'Ana' }],
      },
    ], ['PRESIDENTE', 'VICEPRESIDENTE'])).toEqual([{
      candidaturaId: 'plancha-1',
      nombre: 'Plancha A',
      cargos: ['VICEPRESIDENTE'],
    }]);
  });
});
