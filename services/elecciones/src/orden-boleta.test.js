const { ordenarParaVotante } = require('./orden-boleta');

const candidates = [
  { id: 'candidate-a', nombre: 'A' },
  { id: 'candidate-b', nombre: 'B' },
  { id: 'candidate-c', nombre: 'C' },
  { id: 'candidate-d', nombre: 'D' },
];

test('produce una permutación sin perder candidaturas', () => {
  expect(ordenarParaVotante(candidates, 'student-1', 'election-1').map(({ id }) => id).sort())
    .toEqual(candidates.map(({ id }) => id).sort());
});

test('mantiene un orden determinista por estudiante y elección', () => {
  expect(ordenarParaVotante(candidates, 'student-1', 'election-1'))
    .toEqual(ordenarParaVotante(candidates, 'student-1', 'election-1'));
});

test('cambia el orden para estudiantes distintos', () => {
  expect(ordenarParaVotante(candidates, 'student-1', 'election-1'))
    .not.toEqual(ordenarParaVotante(candidates, 'student-2', 'election-1'));
});

test('distribuye de forma razonablemente uniforme la primera posición', () => {
  const frequencies = new Map(candidates.map(({ id }) => [id, 0]));
  for (let index = 0; index < 4000; index += 1) {
    const first = ordenarParaVotante(candidates, `student-${index}`, 'election-1')[0].id;
    frequencies.set(first, frequencies.get(first) + 1);
  }
  const counts = [...frequencies.values()];
  expect(Math.max(...counts) - Math.min(...counts)).toBeLessThan(160);
});
