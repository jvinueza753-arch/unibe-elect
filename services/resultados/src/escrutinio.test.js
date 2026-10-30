const { obtenerGanadoras } = require('./escrutinio');

const candidaturas = [
  { id: 'candidatura-1', nombre: 'Candidatura A' },
  { id: 'candidatura-2', nombre: 'Candidatura B' },
  { id: 'candidatura-3', nombre: 'Candidatura C' },
];

test('no declara ganadoras cuando todos los votos son en blanco', () => {
  expect(obtenerGanadoras(candidaturas, [])).toEqual([]);
});

test('identifica la candidatura con más votos', () => {
  const resultado = obtenerGanadoras(candidaturas, [
    { candidaturaId: 'candidatura-1', votos: 3 },
    { candidaturaId: 'candidatura-2', votos: 5 },
    { candidaturaId: 'candidatura-3', votos: 1 },
  ]);

  expect(resultado).toEqual([candidaturas[1]]);
});

test('marca como empate solo las candidaturas con el máximo de votos', () => {
  const resultado = obtenerGanadoras(candidaturas, [
    { candidaturaId: 'candidatura-1', votos: 4 },
    { candidaturaId: 'candidatura-2', votos: 2 },
    { candidaturaId: 'candidatura-3', votos: 4 },
  ]);

  expect(resultado).toEqual([candidaturas[0], candidaturas[2]]);
});
