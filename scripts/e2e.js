const { randomUUID } = require('node:crypto');

const apiUrl = process.env.E2E_API_URL;
const databasePrefix = process.env.E2E_TEST_DATABASE_PREFIX;
const isolationConfirmed = process.env.E2E_ISOLATION_CONFIRMED === 'YES';
const adminEmail = process.env.E2E_ADMIN_EMAIL || 'admin@unibe.edu.ec';
const adminPassword = process.env.E2E_DEMO_ADMIN_PASSWORD || 'E2E-Ops-Account-2026!';
const studentPassword = process.env.E2E_DEMO_STUDENT_PASSWORD || 'E2E-Student-Account-2026!';

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
  let adminUserId;
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
    adminUserId = response.data.data.usuario.id;

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
    response = await request(`/api/v1/usuarios/${adminUserId}`, {
      token: adminToken,
      method: 'PATCH',
      body: { estado: 'INACTIVO' },
    });
    assert(
      response.status === 409 && response.data.error.codigo === 'ULTIMO_ADMIN',
      `la API no protegió al último administrador: ${JSON.stringify({ status: response.status, error: response.data?.error?.codigo })}`,
    );
  });

  await check('Referéndum y elecciones de planchas', async () => {
    const now = Date.now();
    const referendum = await request('/api/v1/elecciones', {
      token: adminToken,
      method: 'POST',
      body: {
        titulo: `Referéndum E2E ${new Date(now).toISOString()}`,
        pregunta: '¿Aprueba la propuesta de prueba?',
        tipo: 'REFERENDUM',
        fechaApertura: new Date(now + 60_000).toISOString(),
        fechaCierre: new Date(now + 3_600_000).toISOString(),
      },
    });
    assert(referendum.status === 201, `crear referéndum: ${JSON.stringify(referendum.data)}`);
    const referendumCandidates = await request(
      `/api/v1/elecciones/${referendum.data.data.id}/candidaturas`,
      { token: adminToken },
    );
    assert(
      referendumCandidates.status === 200
        && referendumCandidates.data.data.map(({ codigoOpcion }) => codigoOpcion).join(',')
          === 'SI,NO,ABSTENCION',
      'el referéndum no generó Sí, No y Abstención',
    );
    const fixedOption = await request(
      `/api/v1/elecciones/${referendum.data.data.id}/candidaturas`,
      { token: adminToken, method: 'POST', body: { nombre: 'Opción extra' } },
    );
    assert(
      fixedOption.status === 422
        && fixedOption.data.error.codigo === 'OPCIONES_REFERENDUM_FIJAS',
      'el referéndum permitió alterar sus opciones fijas',
    );

    const planchas = await request('/api/v1/elecciones', {
      token: adminToken,
      method: 'POST',
      body: {
        titulo: `Planchas E2E ${new Date(now).toISOString()}`,
        tipo: 'PLANCHAS',
        candidaturasRequeridas: 2,
        cargosRequeridos: ['PRESIDENTE', 'VICEPRESIDENTE'],
        fechaApertura: new Date(now + 60_000).toISOString(),
        fechaCierre: new Date(now + 3_600_000).toISOString(),
      },
    });
    assert(planchas.status === 201, `crear elección de planchas: ${JSON.stringify(planchas.data)}`);
    const incomplete = await request(`/api/v1/elecciones/${planchas.data.data.id}/candidaturas`, {
      token: adminToken,
      method: 'POST',
      body: {
        nombre: 'Plancha incompleta',
        integrantes: [{ cargo: 'PRESIDENTE', nombre: 'Candidata' }],
      },
    });
    assert(incomplete.status === 201, 'crear plancha falló');
    const incompleteId = incomplete.data.data.id;
    let published = await request(`/api/v1/elecciones/${planchas.data.data.id}/publicar`, {
      token: adminToken,
      method: 'POST',
      body: {},
    });
    assert(
      published.status === 422
        && published.data.error.codigo === 'CANDIDATURAS_INSUFICIENTES',
      'se publicó una elección sin la cantidad requerida de planchas',
    );
    for (const [index, nombre] of ['Ana', 'Beatriz'].entries()) {
      const candidate = await request(`/api/v1/elecciones/${planchas.data.data.id}/candidaturas`, {
        token: adminToken,
        method: 'POST',
        body: {
          nombre: `Plancha ${index + 2}`,
          integrantes: [
            { cargo: 'PRESIDENTE', nombre },
            { cargo: 'VICEPRESIDENTE', nombre: `Vice ${nombre}` },
          ],
        },
      });
      assert(candidate.status === 201, 'crear plancha completa falló');
    }
    published = await request(`/api/v1/elecciones/${planchas.data.data.id}/publicar`, {
      token: adminToken,
      method: 'POST',
      body: {},
    });
    assert(
      published.status === 422
        && published.data.error.codigo === 'PLANCHAS_INCOMPLETAS',
      'se publicó una plancha sin los cargos requeridos',
    );
    const fixedPlancha = await request(
      `/api/v1/elecciones/${planchas.data.data.id}/candidaturas/${incompleteId}`,
      {
        token: adminToken,
        method: 'PATCH',
        body: {
          integrantes: [
            { cargo: 'PRESIDENTE', nombre: 'Candidata' },
            { cargo: 'VICEPRESIDENTE', nombre: 'Vice candidata' },
          ],
        },
      },
    );
    assert(fixedPlancha.status === 200, 'completar cargos de una plancha falló');
    published = await request(`/api/v1/elecciones/${planchas.data.data.id}/publicar`, {
      token: adminToken,
      method: 'POST',
      body: {},
    });
    assert(published.status === 200, 'publicar planchas completas falló');
  });

  await check('Recuperación repetida, reemisión y carreras concurrentes', async () => {
    const recoveryEmail = `e2e-recovery-${randomUUID()}@unibe.edu.ec`;
    const initialPassword = 'E2E-Initial-Recovery-Password-2026!';
    const invalidRegistration = await request('/api/v1/auth/registro', {
      method: 'POST',
      body: {
        nombres: 'Prueba',
        apellidos: 'Contraseña inválida',
        correo: `e2e-invalid-${randomUUID()}@unibe.edu.ec`,
        contrasena: 'é'.repeat(37),
        codigoEstudiantil: `E2E-${randomUUID()}`,
        facultad: 'Pruebas',
        carrera: 'Automatización',
      },
    });
    assert(invalidRegistration.status === 400, 'registro aceptó más de 72 bytes UTF-8');
    const registration = await request('/api/v1/auth/registro', {
      method: 'POST',
      body: {
        nombres: 'Prueba',
        apellidos: 'Recuperación E2E',
        correo: recoveryEmail,
        contrasena: initialPassword,
        codigoEstudiantil: `E2E-${randomUUID()}`,
        facultad: 'Pruebas',
        carrera: 'Automatización',
      },
    });
    assert(registration.status === 201, 'registro del usuario aislado de recuperación falló');
    let recoveryPassword = initialPassword;
    let login = await request('/api/v1/auth/login', {
      method: 'POST',
      body: { correo: recoveryEmail, contrasena: recoveryPassword },
    });
    assert(login.status === 200, 'login inicial del usuario de recuperación falló');
    let recoveryToken = login.data.data.token;

    const existingStart = performance.now();
    const existingResponse = await request('/api/v1/auth/solicitudes-recuperacion', {
      method: 'POST',
      body: { correo: recoveryEmail },
    });
    const existingDuration = performance.now() - existingStart;
    const unknownStart = performance.now();
    const unknownResponse = await request('/api/v1/auth/solicitudes-recuperacion', {
      method: 'POST',
      body: { correo: `unknown-${randomUUID()}@unibe.edu.ec` },
    });
    const unknownDuration = performance.now() - unknownStart;
    assert(existingResponse.status === 202 && unknownResponse.status === 202, 'la solicitud no mantuvo respuesta genérica');
    assert(
      existingDuration >= 240
        && unknownDuration >= 240
        && Math.abs(existingDuration - unknownDuration) < 100,
      `el tiempo de respuesta distinguió cuenta existente: ${Math.round(existingDuration)}ms vs ${Math.round(unknownDuration)}ms`,
    );

    for (let cycle = 1; cycle <= 2; cycle += 1) {
      const requestCount = cycle === 1 ? 6 : 1;
      let submitted;
      for (let attempt = 0; attempt < requestCount; attempt += 1) {
        submitted = await request('/api/v1/auth/solicitudes-recuperacion', {
          method: 'POST',
          body: { correo: recoveryEmail },
        });
        assert(submitted.status === 202, `solicitud ${attempt + 1} del ciclo ${cycle} no fue aceptada`);
        assert(
          submitted.data.data.mensaje.includes('Si existe una cuenta'),
          'la respuesta reveló si el correo está registrado',
        );
      }

      const pending = await request(
        `/api/v1/admin/solicitudes-recuperacion?estado=PENDIENTE&busqueda=${encodeURIComponent(recoveryEmail)}`,
        { token: adminToken },
      );
      assert(pending.status === 200, `listar pendientes del ciclo ${cycle} falló`);
      assert(pending.data.data.items.length === 1, 'las solicitudes repetidas crearon duplicados');
      assert(pending.data.data.meta.pendientes >= 1, 'el contador de pendientes no se actualizó');
      const requestId = pending.data.data.items[0].id;

      const approvalResults = await Promise.all([
        request(`/api/v1/admin/solicitudes-recuperacion/${requestId}/aprobar`, {
          token: adminToken,
          method: 'POST',
          body: {},
        }),
        request(`/api/v1/admin/solicitudes-recuperacion/${requestId}/aprobar`, {
          token: adminToken,
          method: 'POST',
          body: {},
        }),
      ]);
      assert(
        approvalResults.filter((result) => result.status === 200).length === 1
          && approvalResults.filter((result) => result.status === 409).length === 1,
        `dos aprobaciones simultáneas no eligieron un único ganador: ${JSON.stringify(approvalResults.map((result) => ({ status: result.status, error: result.data?.error?.codigo })))}`,
      );
      const firstApproval = approvalResults.find((result) => result.status === 200).data.data;

      const reissued = await request(`/api/v1/admin/solicitudes-recuperacion/${requestId}/reemitir`, {
        token: adminToken,
        method: 'POST',
        body: {},
      });
      assert(reissued.status === 200, 'la reemisión del código vigente falló');
      const tooLongPassword = await request('/api/v1/auth/restablecer-contrasena', {
        method: 'POST',
        body: { codigo: reissued.data.data.codigo, contrasenaNueva: 'é'.repeat(37) },
      });
      assert(tooLongPassword.status === 400, 'restablecimiento aceptó más de 72 bytes UTF-8');
      const oldCode = await request('/api/v1/auth/restablecer-contrasena', {
        method: 'POST',
        body: { codigo: firstApproval.codigo, contrasenaNueva: `Ignored-password-${cycle}!` },
      });
      assert(oldCode.status === 400, 'la reemisión no invalidó el código anterior');

      const newPasswords = [
        `E2E-Recovery-${cycle}-A!`,
        `E2E-Recovery-${cycle}-B!`,
      ];
      const resetResults = await Promise.all(newPasswords.map((contrasenaNueva) => (
        request('/api/v1/auth/restablecer-contrasena', {
          method: 'POST',
          body: { codigo: reissued.data.data.codigo, contrasenaNueva },
        })
      )));
      const winnerIndex = resetResults.findIndex((result) => result.status === 204);
      assert(winnerIndex !== -1, `ningún restablecimiento concurrente ganó en el ciclo ${cycle}`);
      assert(
        resetResults.filter((result) => result.status === 204).length === 1
          && resetResults.filter((result) => result.status === 400).length === 1,
        'dos restablecimientos concurrentes consumieron el mismo código',
      );
      recoveryPassword = newPasswords[winnerIndex];

      const oldSession = await request('/api/v1/auth/me', { token: recoveryToken });
      assert(oldSession.status === 401, 'el JWT previo al restablecimiento siguió válido');
      login = await request('/api/v1/auth/login', {
        method: 'POST',
        body: { correo: recoveryEmail, contrasena: recoveryPassword },
      });
      assert(login.status === 200, `login con la nueva contraseña del ciclo ${cycle} falló`);
      recoveryToken = login.data.data.token;
    }

    const reusedPassword = await request('/api/v1/auth/cambiar-contrasena', {
      token: recoveryToken,
      method: 'POST',
      body: { contrasenaActual: recoveryPassword, contrasenaNueva: recoveryPassword },
    });
    assert(
      reusedPassword.status === 400 && reusedPassword.data.error.codigo === 'CONTRASENA_REUTILIZADA',
      'cambio de contraseña permitió reutilizar la actual',
    );
    const oversizedChange = await request('/api/v1/auth/cambiar-contrasena', {
      token: recoveryToken,
      method: 'POST',
      body: { contrasenaActual: recoveryPassword, contrasenaNueva: 'é'.repeat(37) },
    });
    assert(oversizedChange.status === 400, 'cambio de contraseña aceptó más de 72 bytes UTF-8');

    await request('/api/v1/auth/solicitudes-recuperacion', {
      method: 'POST',
      body: { correo: recoveryEmail },
    });
    const pending = await request(
      `/api/v1/admin/solicitudes-recuperacion?estado=PENDIENTE&busqueda=${encodeURIComponent(recoveryEmail)}`,
      { token: adminToken },
    );
    assert(pending.status === 200 && pending.data.data.items.length === 1, 'no se creó la solicitud para probar aprobación/rechazo concurrentes');
    const requestId = pending.data.data.items[0].id;
    const competingActions = await Promise.all([
      request(`/api/v1/admin/solicitudes-recuperacion/${requestId}/aprobar`, {
        token: adminToken,
        method: 'POST',
        body: {},
      }),
      request(`/api/v1/admin/solicitudes-recuperacion/${requestId}/rechazar`, {
        token: adminToken,
        method: 'POST',
        body: {},
      }),
    ]);
    assert(
      (competingActions[0].status === 200 && competingActions[1].status === 409)
        || (competingActions[0].status === 409 && competingActions[1].status === 204),
      `aprobar y rechazar simultáneamente no eligieron un solo resultado: ${JSON.stringify(competingActions.map((result) => ({ status: result.status, error: result.data?.error?.codigo })))}`,
    );
    const approvedRace = competingActions.find((result) => result.status === 200);
    if (approvedRace) {
      const cleanup = await request('/api/v1/auth/restablecer-contrasena', {
        method: 'POST',
        body: {
          codigo: approvedRace.data.data.codigo,
          contrasenaNueva: 'E2E-Race-Cleanup-Password-2026!',
        },
      });
      assert(cleanup.status === 204, 'no se pudo cerrar el código ganador de la carrera aprobar/rechazar');
    }
  });

  await check('Crear elección y cargar foto de candidatura', async () => {
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

    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9ioAAAAASUVORK5CYII=',
      'base64',
    );
    const upload = await fetch(
      new URL(`/api/v1/elecciones/${electionId}/candidaturas/${candidateIds[0]}/foto`, apiUrl),
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'image/png',
        },
        body: png,
      },
    );
    const uploadBody = await upload.json();
    assert(upload.status === 200, `cargar foto: ${JSON.stringify(uploadBody)}`);
    const image = await fetch(new URL(uploadBody.data.fotoUrl, apiUrl));
    assert(
      image.status === 200
        && image.headers.get('content-type') === 'image/png'
        && Buffer.from(await image.arrayBuffer()).equals(png),
      'la foto almacenada no se pudo recuperar con su tipo verificado',
    );

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
        : index < 10
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
      body: { motivo: 'Cierre anticipado de prueba E2E' },
    });
    assert(closed.status === 200, 'cerrar elección falló');

    const result = await request(`/api/v1/resultados/elecciones/${electionId}/escrutinio`, {
      token: adminToken,
      method: 'POST',
      body: {},
    });
    assert(result.status === 201, `generar escrutinio: ${JSON.stringify(result.data)}`);
    assert(result.data.data.totalVotos === 12, 'total de votos incorrecto');
    assert(result.data.data.empate === true, 'la papeleta no produjo un empate esperado');

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

    response = await request(`/api/v1/resultados/elecciones/${electionId}/verificar`, {
      token: adminToken,
      method: 'POST',
      body: {},
    });
    assert(response.status === 200 && response.data.data.verificado, 'verificar la huella del escrutinio falló');

    response = await request(`/api/v1/resultados/elecciones/${electionId}/desempatar`, {
      token: adminToken,
      method: 'POST',
      body: {
        candidaturaId: candidateIds[0],
        motivo: 'Decisión asentada en el acta de desempate',
      },
    });
    assert(
      response.status === 200 && response.data.data.empateResuelto,
      `resolver empate: ${JSON.stringify(response.data)}`,
    );
    response = await request(`/api/v1/resultados/elecciones/${electionId}/verificar`, {
      token: adminToken,
      method: 'POST',
      body: {},
    });
    assert(response.status === 200 && response.data.data.verificado, 'la huella con desempate no se verificó');

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

    const pdf = await fetch(
      new URL(`/api/v1/resultados/elecciones/${electionId}/acta.pdf`, apiUrl),
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    const pdfBytes = Buffer.from(await pdf.arrayBuffer());
    assert(
      pdf.status === 200
        && pdf.headers.get('content-type') === 'application/pdf'
        && pdfBytes.subarray(0, 5).toString('ascii') === '%PDF-',
      'el acta PDF oficial no se descargó correctamente',
    );
  });

  console.log(`\nResumen E2E: ${passed} correctos, ${failed} fallidos.`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => {
  console.error(`Fallo E2E: ${error.message}`);
  process.exitCode = 1;
});
