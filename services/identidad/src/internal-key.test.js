const { createApp, isolatedTestDatabase } = require('../../../shared/http');
const { llamarInterno } = require('../../../shared/interno');

describe('configuración de claves internas', () => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldInternalKey = process.env.CLAVE_INTERNA;
  const oldDatabaseUrl = process.env.DATABASE_URL;
  const oldE2eIsolated = process.env.E2E_ISOLATED_DATABASE;
  const oldE2ePrefix = process.env.E2E_TEST_DATABASE_PREFIX;

  afterEach(() => {
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
    if (oldInternalKey === undefined) delete process.env.CLAVE_INTERNA;
    else process.env.CLAVE_INTERNA = oldInternalKey;
    if (oldDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = oldDatabaseUrl;
    if (oldE2eIsolated === undefined) delete process.env.E2E_ISOLATED_DATABASE;
    else process.env.E2E_ISOLATED_DATABASE = oldE2eIsolated;
    if (oldE2ePrefix === undefined) delete process.env.E2E_TEST_DATABASE_PREFIX;
    else process.env.E2E_TEST_DATABASE_PREFIX = oldE2ePrefix;
    jest.restoreAllMocks();
  });

  test('falla al arrancar en producción si la clave es ausente o demasiado corta', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CLAVE_INTERNA;
    expect(() => createApp('test')).toThrow(/CLAVE_INTERNA debe configurarse/);

    process.env.CLAVE_INTERNA = 'short';
    expect(() => createApp('test')).toThrow(/aleatoria de al menos 32 bytes/);
  });

  test('acepta una clave de 32 bytes y no envía llamadas si falta configuración', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CLAVE_INTERNA = '0123456789abcdef0123456789abcdef';
    expect(createApp('test')).toBeDefined();

    process.env.CLAVE_INTERNA = '';
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    await expect(llamarInterno('http://service.invalid/internal/test'))
      .rejects.toThrow(/CLAVE_INTERNA debe configurarse/);
    expect(fetch).not.toHaveBeenCalled();
  });

  test('confirma solo las bases aisladas asignadas a cada microservicio', () => {
    process.env.NODE_ENV = 'test';
    process.env.E2E_ISOLATED_DATABASE = 'true';
    process.env.E2E_TEST_DATABASE_PREFIX = 'unibe_test';
    for (const service of ['identidad', 'elecciones', 'votacion', 'resultados']) {
      process.env.DATABASE_URL = `postgresql://test:test@postgres:5432/unibe_test_${service}?schema=public`;
      expect(isolatedTestDatabase(service)).toBe(true);
    }

    process.env.DATABASE_URL = 'postgresql://test:test@postgres:5432/unibe_identidad?schema=public';
    expect(isolatedTestDatabase('identidad')).toBe(false);
    expect(isolatedTestDatabase()).toBe(false);
  });
});
