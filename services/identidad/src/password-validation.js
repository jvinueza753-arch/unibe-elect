const { z } = require('zod');
const contrasenasComunesLista = require('./contrasenas-comunes');

const CONTRASENA_MINIMO = 10;
const CONTRASENA_MAXIMO = 128;
const CONTRASENA_MAXIMO_BYTES = 72;
const reglasContrasena = [
  { codigo: 'LONGITUD_MINIMA', descripcion: `Al menos ${CONTRASENA_MINIMO} caracteres` },
  { codigo: 'LONGITUD_MAXIMA', descripcion: `Como máximo ${CONTRASENA_MAXIMO} caracteres` },
  { codigo: 'LIMITE_BYTES', descripcion: `Como máximo ${CONTRASENA_MAXIMO_BYTES} bytes UTF-8` },
  { codigo: 'SIN_LETRA', descripcion: 'Debe incluir al menos una letra' },
  { codigo: 'SIN_NUMERO', descripcion: 'Debe incluir al menos un número' },
  { codigo: 'CONTIENE_CODIGO', descripcion: 'No debe contener tu código estudiantil' },
  { codigo: 'CONTIENE_CORREO', descripcion: 'No debe contener la parte de tu correo anterior a @' },
  { codigo: 'CONTRASENA_COMUN', descripcion: 'No debe ser una contraseña común' },
];

function normalizar(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function normalizarComun(value) {
  return normalizar(value).replace(/[@013457$]/g, (char) => ({
    '@': 'a',
    0: 'o',
    1: 'i',
    3: 'e',
    4: 'a',
    5: 's',
    7: 't',
    '$': 's',
  })[char]);
}

const contrasenasComunes = new Set([...contrasenasComunesLista].map(normalizarComun));

function validarPoliticaContrasena(contrasena, { correo = '', codigoEstudiantil = '' } = {}) {
  const value = String(contrasena || '');
  const normalized = normalizar(value);
  const violations = [];
  const add = (code) => violations.push(code);

  if ([...value].length < CONTRASENA_MINIMO) add('LONGITUD_MINIMA');
  if ([...value].length > CONTRASENA_MAXIMO) add('LONGITUD_MAXIMA');
  if (Buffer.byteLength(value, 'utf8') > CONTRASENA_MAXIMO_BYTES) add('LIMITE_BYTES');
  if (!/\p{L}/u.test(value)) add('SIN_LETRA');
  if (!/\d/.test(value)) add('SIN_NUMERO');

  const codigo = normalizar(codigoEstudiantil);
  if (codigo && normalized.includes(codigo)) add('CONTIENE_CODIGO');

  const local = normalizar(String(correo).split('@')[0] || '');
  if (local.length >= 4 && normalized.includes(local)) add('CONTIENE_CORREO');

  if (contrasenasComunes.has(normalizarComun(value))) add('CONTRASENA_COMUN');
  return violations;
}

const contrasenaSchema = z.string()
  .min(CONTRASENA_MINIMO)
  .max(CONTRASENA_MAXIMO)
  .superRefine((value, context) => {
    if (Buffer.byteLength(value, 'utf8') > CONTRASENA_MAXIMO_BYTES) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La contraseña no puede superar 72 bytes UTF-8',
      });
    }
  });

module.exports = {
  CONTRASENA_MAXIMO,
  CONTRASENA_MAXIMO_BYTES,
  CONTRASENA_MINIMO,
  contrasenaSchema,
  reglasContrasena,
  validarPoliticaContrasena,
};
