const { z } = require('zod');
const {
  CARGOS_PLANCHA,
  CARRERAS,
  FACULTADES,
  OPCIONES_REFERENDUM,
} = require('./catalogos');

const cargoSchema = z.enum(CARGOS_PLANCHA);
const fotoUrlSchema = z.string().refine((value) => {
  if (/^\/api\/v1\/elecciones\/imagenes\/[0-9a-f-]{36}$/i.test(value)) return true;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, 'La foto debe ser una URL HTTP(S) o una ruta de imagen válida');

const integranteSchema = z.object({
  cargo: cargoSchema,
  nombre: z.string().trim().min(1),
  orden: z.number().int().min(0).optional(),
});

const candidaturaSchema = z.object({
  nombre: z.string().trim().min(1),
  descripcion: z.string().trim().max(2000).optional().nullable(),
  fotoUrl: fotoUrlSchema.optional().nullable(),
  lema: z.string().trim().max(140).optional().nullable(),
  propuestas: z.array(z.string().trim().min(1).max(200)).max(10).optional(),
  integrantes: z.array(integranteSchema).optional(),
  orden: z.number().int().min(0).optional(),
});
const patchCandidaturaSchema = candidaturaSchema.partial();

const eleccionCamposSchema = z.object({
  titulo: z.string().trim().min(1),
  descripcion: z.string().trim().max(5000).optional().nullable(),
  pregunta: z.string().trim().min(5).max(500).optional().nullable(),
  fechaApertura: z.string().datetime(),
  fechaCierre: z.string().datetime(),
  tipo: z.enum(['CANDIDATURAS', 'REFERENDUM', 'PLANCHAS']),
  candidaturasRequeridas: z.number().int().min(2).max(100),
  facultadesPermitidas: z.array(z.enum(FACULTADES)),
  carrerasPermitidas: z.array(z.enum(CARRERAS)),
  cargosRequeridos: z.array(cargoSchema).min(1).max(CARGOS_PLANCHA.length).optional(),
  ordenAleatorio: z.boolean(),
});

const crearEleccionSchema = eleccionCamposSchema.extend({
  tipo: z.enum(['CANDIDATURAS', 'REFERENDUM', 'PLANCHAS']).default('CANDIDATURAS'),
  candidaturasRequeridas: z.number().int().min(2).max(100).default(2),
  facultadesPermitidas: z.array(z.enum(FACULTADES)).default([]),
  carrerasPermitidas: z.array(z.enum(CARRERAS)).default([]),
  ordenAleatorio: z.boolean().default(true),
  candidaturas: z.array(candidaturaSchema).max(100).optional(),
}).superRefine(validarTipoDeEleccion);

const patchEleccionSchema = z.object({
  titulo: eleccionCamposSchema.shape.titulo.optional(),
  descripcion: eleccionCamposSchema.shape.descripcion,
  pregunta: eleccionCamposSchema.shape.pregunta,
  fechaApertura: eleccionCamposSchema.shape.fechaApertura.optional(),
  fechaCierre: eleccionCamposSchema.shape.fechaCierre.optional(),
  tipo: eleccionCamposSchema.shape.tipo.optional(),
  candidaturasRequeridas: eleccionCamposSchema.shape.candidaturasRequeridas.optional(),
  facultadesPermitidas: eleccionCamposSchema.shape.facultadesPermitidas.optional(),
  carrerasPermitidas: eleccionCamposSchema.shape.carrerasPermitidas.optional(),
  cargosRequeridos: eleccionCamposSchema.shape.cargosRequeridos,
  ordenAleatorio: eleccionCamposSchema.shape.ordenAleatorio.optional(),
});

function opcionesReferendum() {
  return OPCIONES_REFERENDUM.map((option) => ({
    ...option,
    descripcion: null,
    lema: null,
    propuestas: [],
  }));
}

function validarIntegrantes(integrantes) {
  const cargosUnicos = new Set();
  for (const integrante of integrantes || []) {
    if (integrante.cargo === 'VOCAL') continue;
    if (cargosUnicos.has(integrante.cargo)) return integrante.cargo;
    cargosUnicos.add(integrante.cargo);
  }
  return null;
}

function faltantesPlanchas(candidaturas, cargosRequeridos) {
  return candidaturas.flatMap((candidatura) => {
    const cubiertos = new Set((candidatura.integrantes || []).map(({ cargo }) => cargo));
    const faltantes = cargosRequeridos.filter((cargo) => !cubiertos.has(cargo));
    return faltantes.length
      ? [{ candidaturaId: candidatura.id, nombre: candidatura.nombre, cargos: faltantes }]
      : [];
  });
}

function validarTipoDeEleccion(value, context) {
  if (value.tipo === 'REFERENDUM' && !value.pregunta?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['pregunta'],
      message: 'La pregunta es obligatoria para un referéndum',
    });
  }
  if (value.tipo !== 'PLANCHAS' && value.cargosRequeridos?.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cargosRequeridos'],
      message: 'Los cargos requeridos solo aplican a elecciones de planchas',
    });
  }
  if (value.tipo === 'REFERENDUM' && value.candidaturas?.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['candidaturas'],
      message: 'Las opciones del referéndum se generan automáticamente',
    });
  }
  if (value.cargosRequeridos
    && new Set(value.cargosRequeridos).size !== value.cargosRequeridos.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cargosRequeridos'],
      message: 'No repitas cargos requeridos',
    });
  }
}

module.exports = {
  candidaturaSchema,
  crearEleccionSchema,
  faltantesPlanchas,
  integranteSchema,
  opcionesReferendum,
  patchCandidaturaSchema,
  patchEleccionSchema,
  validarIntegrantes,
  validarTipoDeEleccion,
};
