const FACULTADES = Object.freeze([
  'Ingeniería',
  'Ciencias Empresariales',
  'Derecho',
]);

const CARRERAS = Object.freeze([
  'Software',
  'Sistemas',
  'Administración',
  'Derecho',
]);

const CARGOS_PLANCHA = Object.freeze([
  'PRESIDENTE',
  'VICEPRESIDENTE',
  'SECRETARIO',
  'TESORERO',
  'VOCAL',
]);

const OPCIONES_REFERENDUM = Object.freeze([
  { codigoOpcion: 'SI', nombre: 'Sí', orden: 0 },
  { codigoOpcion: 'NO', nombre: 'No', orden: 1 },
  { codigoOpcion: 'ABSTENCION', nombre: 'Abstención', orden: 2 },
]);

module.exports = { CARGOS_PLANCHA, CARRERAS, FACULTADES, OPCIONES_REFERENDUM };
