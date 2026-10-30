const apiUrl = process.env.E2E_API_URL;
const databasePrefix = process.env.E2E_TEST_DATABASE_PREFIX;
const isolationConfirmed = process.env.E2E_ISOLATION_CONFIRMED === 'YES';
const adminEmail = process.env.E2E_ADMIN_EMAIL || 'admin@unibe.edu.ec';
const adminPassword = process.env.E2E_DEMO_ADMIN_PASSWORD || 'E2E-Admin-Password-2026!';
const studentPassword = process.env.E2E_DEMO_STUDENT_PASSWORD || 'E2E-Student-Password-2026!';

let passed = 0;
let failed = 0;

async function request(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(new URL(path, apiUrl), {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { status: response.status, data };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function check(name, operation) {
  try {
    await operation();
    console.log(`✔ ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`✘ ${name}: ${error.message}`);
    failed += 1;
  }
}

function configurationError(message) {
  console.error(`E2E bloqueado: ${message}`);
  process.exitCode = 2;
}

async function main() {
  if (
    !apiUrl ||
    !/^unibe_test(?:_[a-z0-9_]+)?$/.test(databasePrefix || '') ||
    !isolationConfirmed
  ) {
    configurationError(
      'usa docker-compose.e2e.yml y define E2E_API_URL, E2E_TEST_DATABASE_PREFIX=unibe_test y E2E_ISOLATION_CONFIRMED=YES',
    );
    return;
  }

  let target;
  try {
    target = new URL(apiUrl);
  } catch {
    configurationError('E2E_API_URL no es una URL válida');
    return;
  }
  if (!['localhost', '127.0.0.1', '::1'].includes(target.hostname)) {
    configurationError('E2E solo acepta un gateway local de pruebas');
    return;
  }

  let health;
  try {
    const response = await fetch(new URL('/health', target));
    health = response.ok ? await response.json() : null;
  } catch {
    health = null;
  }
  if (health?.data?.e2eAislado !== true) {
    configurationError(
      'el gateway no confirmó que los cuatro servicios usan bases unibe_test_*; no se enviaron solicitudes mutantes',
    );
    return;
  }

  let adminToken;
  const studentTokens = [];
  let electionId;
  const candidateIds = [];

  await check('Salud del gateway', async () => {
    assert(health.data.estado === 'ok', 'gateway no está saludable');
  });

  await check('Inicio de sesión de administrador y estudiantes aislados', async () => {
    let response = await request('/api/v1/auth/login', {
      method: 'POST',
      body: { correo: adminEmail, contrasena: adminPassword },
    });
    assert(response.status === 200, 'inicio de sesión de administrador falló');
    adminToken = response.data.data.token;

    for (let index = 1; index <= 12; index += 1) {
      const correo = `estudiante${String(index).padStart(2, '0')}@unibe.edu.ec`;
      response = await request('/api/v1/auth/login', {
        method: 'POST',
        body: { correo, contrasena: studentPassword },
      });
      assert(response.status === 200, `inicio de sesión de ${correo} falló`);
      studentTokens.push(response.data.data.token);
    }
  });

  if (!adminToken || studentTokens.length !== 12) {
    console.log(`\nResumen E2E: ${passed} correctos, ${failed} fallidos.`);
    process.exitCode = 1;
    return;
  }

  await check('Rutas protegidas por rol y gateway', async () => {
    let response = await request('/api/v1/usuarios', { token: studentTokens[0] });
    assert(response.status === 403, 'estudiante no fue rechazado de la ruta admin');
    response = await request('/api/v1/usuarios');
    assert(response.status === 401, 'ruta admin sin token no respondió 401');
    response = await request('/internal/usuarios/conteo');
    assert(response.status === 404, 'gateway expuso una ruta interna');
  });

  await check('Crear y publicar elección con tres candidaturas', async () => {
    const now = Date.now();
    const response = await request('/api/v1/elecciones', {
      token: adminToken,
      method: 'POST',
      body: {
        titulo: `E2E ${new Date(now).toISOString()}`,
        descripcion: 'Prueba automatizada aislada',
        fechaApertura: new Date(now - 1000).toISOString(),
        fechaCierre: new Date(now + 3_600_000).toISOString(),
        facultadesPermitidas: [],
        carrerasPermitidas: [],
      },
    });
    assert(response.status === 201, `crear elección: ${JSON.stringify(response.data)}`);
    electionId = response.data.data.id;

    for (const nombre of ['Candidatura A', 'Candidatura B', 'Candidatura C']) {
      const candidate = await request(`/api/v1/elecciones/${electionId}/candidaturas`, {
        token: adminToken,
        method: 'POST',
        body: { nombre },
      });
      assert(candidate.status === 201, 'crear candidatura falló');
      candidateIds.push(candidate.data.data.id);
    }

    const published = await request(`/api/v1/elecciones/${electionId}/publicar`, {
      token: adminToken,
      method: 'POST',
      body: {},
    });
    assert(published.status === 200, 'publicar elección falló');
  });

  if (!electionId || candidateIds.length !== 3) {
    console.log(`\nResumen E2E: ${passed} correctos, ${failed} fallidos.`);
    process.exitCode = 1;
    return;
  }

  await check('Estudiante ve la elección disponible', async () => {
    const response = await request('/api/v1/elecciones/disponibles', {
      token: studentTokens[0],
    });
    assert(
      response.status === 200 && response.data.data.some((election) => election.id === electionId),
      'elección no aparece como disponible',
    );
  });

  await check('Un voto por estudiante y papeleta anónima', async () => {
    for (let index = 0; index < 12; index += 1) {
      const candidateId = index < 5
        ? candidateIds[0]
        : index < 9
          ? candidateIds[1]
          : index < 11
            ? candidateIds[2]
            : null;
      const response = await request(`/api/v1/votacion/elecciones/${electionId}/votos`, {
        token: studentTokens[index],
        method: 'POST',
        body: { candidaturaId: candidateId },
      });
      assert(response.status === 201, `voto ${index + 1}: ${JSON.stringify(response.data)}`);
      assert(!JSON.stringify(response.data).includes(candidateIds[0]), 'respuesta reveló candidatura');
    }

    const duplicate = await request(`/api/v1/votacion/elecciones/${electionId}/votos`, {
      token: studentTokens[0],
      method: 'POST',
      body: { candidaturaId: candidateIds[0] },
    });
    assert(duplicate.status === 409 && duplicate.data.error.codigo === 'YA_VOTO', 'doble voto no rechazado');

    const participation = await request(
      `/api/v1/votacion/elecciones/${electionId}/mi-participacion`,
      { token: studentTokens[0] },
    );
    assert(
      participation.data.data.haVotado && !('candidaturaId' in participation.data.data),
      'respuesta de participación revela el voto',
    );
  });

  await check('Cierre y escrutinio idempotente', async () => {
    const closed = await request(`/api/v1/elecciones/${electionId}/cerrar`, {
      token: adminToken,
      method: 'POST',
      body: {},
    });
    assert(closed.status === 200, 'cerrar elección falló');

    const result = await request(`/api/v1/resultados/elecciones/${electionId}/escrutinio`, {
      token: adminToken,
      method: 'POST',
      body: {},
    });
    assert(result.status === 201, `generar escrutinio: ${JSON.stringify(result.data)}`);
    assert(result.data.data.totalVotos === 12, 'total de votos incorrecto');

    const repeated = await request(`/api/v1/resultados/elecciones/${electionId}/escrutinio`, {
      token: adminToken,
      method: 'POST',
      body: {},
    });
    assert(repeated.status === 200, 'escrutinio no es idempotente');
  });

  await check('Resultados ocultos hasta la publicación', async () => {
    let response = await request(`/api/v1/resultados/elecciones/${electionId}`, {
      token: studentTokens[0],
    });
    assert(response.status === 404, 'estudiante vio resultados antes de publicarlos');

    response = await request(`/api/v1/resultados/elecciones/${electionId}/publicar`, {
      token: adminToken,
      method: 'POST',
      body: {},
    });
    assert(response.status === 200, 'publicar resultado falló');

    response = await request(`/api/v1/resultados/elecciones/${electionId}`, {
      token: studentTokens[0],
    });
    assert(response.status === 200 && response.data.data.totalVotos === 12, 'resultado publicado no visible');
  });

  console.log(`\nResumen E2E: ${passed} correctos, ${failed} fallidos.`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => {
  console.error(`Fallo E2E: ${error.message}`);
  process.exitCode = 1;
});
