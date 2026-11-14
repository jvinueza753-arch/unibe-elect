jest.mock('/shared/auth', () => ({
  autenticar(req, _res, next) {
    req.usuario = {
      sub: '00000000-0000-4000-8000-000000000001',
      correo: 'admin@unibe.edu.ec',
      rol: req.get('x-test-role') || 'ADMINISTRADOR',
      facultad: 'Ingeniería',
      carrera: 'Software',
    };
    next();
  },
  requerirRol(...roles) {
    return (req, res, next) => roles.includes(req.usuario.rol)
      ? next()
      : res.status(403).json({ error: { codigo: 'SIN_PERMISO' } });
  },
}));

const express = require('express');
const routes = require('./rutas');

const REFERENDUM_ID = '00000000-0000-4000-8000-000000000010';
const IMAGE_ID = '00000000-0000-4000-8000-000000000020';

function createDb() {
  const db = {
    eleccion: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    candidatura: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    integrantePlancha: { deleteMany: jest.fn() },
    imagenCandidatura: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  db.$transaction = jest.fn((callback) => callback(db));
  return db;
}

async function startServer(db) {
  const app = express();
  app.use(express.json());
  routes(app, db);
  app.use((cause, _req, res, _next) => {
    res.status(500).json({ error: { mensaje: cause.message } });
  });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });
  const { port } = server.address();
  return {
    server,
    request: (path, options = {}) => fetch(`http://127.0.0.1:${port}${path}`, options),
  };
}

describe('rutas de tipos y candidaturas', () => {
  let db;
  let server;
  let request;

  beforeEach(async () => {
    db = createDb();
    ({ server, request } = await startServer(db));
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  test('crea el referéndum con opciones fijas y exige su pregunta', async () => {
    const createdElection = {
      id: REFERENDUM_ID,
      tipo: 'REFERENDUM',
      estadoGuardado: 'BORRADOR',
      fechaApertura: new Date('2027-01-01T10:00:00.000Z'),
      fechaCierre: new Date('2027-01-01T11:00:00.000Z'),
      cerradaEn: null,
    };
    db.eleccion.create.mockResolvedValue(createdElection);

    const invalid = await request('/api/v1/elecciones', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        titulo: 'Consulta',
        tipo: 'REFERENDUM',
        fechaApertura: '2027-01-01T10:00:00.000Z',
        fechaCierre: '2027-01-01T11:00:00.000Z',
      }),
    });
    expect(invalid.status).toBe(400);

    const response = await request('/api/v1/elecciones', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        titulo: 'Consulta',
        pregunta: '¿Aprueba la propuesta?',
        tipo: 'REFERENDUM',
        fechaApertura: '2027-01-01T10:00:00.000Z',
        fechaCierre: '2027-01-01T11:00:00.000Z',
      }),
    });

    expect(response.status).toBe(201);
    const { data } = await response.json();
    expect(data.tipo).toBe('REFERENDUM');
    const candidates = db.eleccion.create.mock.calls[0][0].data.candidaturas.create;
    expect(candidates.map(({ codigoOpcion, nombre }) => [codigoOpcion, nombre])).toEqual([
      ['SI', 'Sí'],
      ['NO', 'No'],
      ['ABSTENCION', 'Abstención'],
    ]);
  });

  test('no publica una plancha sin todos los cargos requeridos', async () => {
    db.eleccion.findUnique.mockResolvedValue({
      id: REFERENDUM_ID,
      tipo: 'PLANCHAS',
      estadoGuardado: 'BORRADOR',
      candidaturasRequeridas: 2,
      cargosRequeridos: ['PRESIDENTE', 'VICEPRESIDENTE'],
      fechaApertura: new Date('2027-01-01T10:00:00.000Z'),
      fechaCierre: new Date('2027-01-01T11:00:00.000Z'),
      candidaturas: [
        { id: 'plancha-1', nombre: 'Plancha A', integrantes: [{ cargo: 'PRESIDENTE', nombre: 'Ana' }] },
        { id: 'plancha-2', nombre: 'Plancha B', integrantes: [
          { cargo: 'PRESIDENTE', nombre: 'Luis' },
          { cargo: 'VICEPRESIDENTE', nombre: 'Eva' },
        ] },
      ],
    });

    const response = await request(`/api/v1/elecciones/${REFERENDUM_ID}/publicar`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });

    expect(response.status).toBe(422);
    expect((await response.json()).error.codigo).toBe('PLANCHAS_INCOMPLETAS');
    expect(db.eleccion.update).not.toHaveBeenCalled();
  });

  test('registra una sola decisión de desempate con una actualización condicional', async () => {
    const candidateId = '00000000-0000-4000-8000-000000000030';
    const actorId = '00000000-0000-4000-8000-000000000040';
    const hash = 'a'.repeat(64);
    db.eleccion.findUnique.mockResolvedValue({
      id: REFERENDUM_ID,
      estadoGuardado: 'PUBLICADA',
      fechaApertura: new Date(Date.now() - 60_000),
      fechaCierre: new Date(Date.now() - 1_000),
      cerradaEn: null,
      candidaturaDesempateId: null,
      candidaturas: [{ id: candidateId }],
    });
    db.eleccion.updateMany.mockResolvedValue({ count: 1 });

    const response = await request(`/internal/elecciones/${REFERENDUM_ID}/desempate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        candidaturaId: candidateId,
        actorId,
        motivo: 'Acta de desempate firmada',
        hashCanonico: hash,
      }),
    });

    expect(response.status).toBe(200);
    expect(db.eleccion.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: REFERENDUM_ID,
        candidaturaDesempateId: null,
        estadoGuardado: 'PUBLICADA',
      }),
    }));
    expect((await response.json()).data.hashEscrutinioDesempate).toBe(hash);
  });

  test('valida la firma de las fotos antes de almacenarlas', async () => {
    db.eleccion.findUnique.mockResolvedValue({
      id: REFERENDUM_ID,
      estadoGuardado: 'BORRADOR',
    });
    db.candidatura.findFirst.mockResolvedValue({ id: IMAGE_ID, eleccionId: REFERENDUM_ID });

    const response = await request(
      `/api/v1/elecciones/${REFERENDUM_ID}/candidaturas/${IMAGE_ID}/foto`,
      {
        method: 'PUT',
        headers: { 'content-type': 'image/png' },
        body: Buffer.from('not an image'),
      },
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.codigo).toBe('FIRMA_IMAGEN_INVALIDA');
    expect(db.imagenCandidatura.upsert).not.toHaveBeenCalled();
  });

  test('almacena una imagen válida y sirve el contenido con su tipo verificado', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9ioAAAAASUVORK5CYII=',
      'base64',
    );
    db.eleccion.findUnique.mockResolvedValue({
      id: REFERENDUM_ID,
      estadoGuardado: 'BORRADOR',
    });
    db.candidatura.findFirst.mockResolvedValue({ id: IMAGE_ID, eleccionId: REFERENDUM_ID });
    db.imagenCandidatura.upsert.mockResolvedValue({ id: IMAGE_ID });

    const upload = await request(
      `/api/v1/elecciones/${REFERENDUM_ID}/candidaturas/${IMAGE_ID}/foto`,
      {
        method: 'PUT',
        headers: { 'content-type': 'image/png' },
        body: png,
      },
    );

    expect(upload.status).toBe(200);
    expect((await upload.json()).data.fotoUrl).toBe(`/api/v1/elecciones/imagenes/${IMAGE_ID}`);
    expect(db.imagenCandidatura.upsert.mock.calls[0][0].create.datos).toEqual(png);

    db.imagenCandidatura.findUnique.mockResolvedValue({
      tipoContenido: 'image/png',
      datos: png,
    });
    const download = await request(`/api/v1/elecciones/imagenes/${IMAGE_ID}`);
    expect(download.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await download.arrayBuffer())).toEqual(png);
  });
});
