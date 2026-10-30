function internalKey() {
  const configured = process.env.CLAVE_INTERNA;
  if (!configured) {
    throw new Error('CLAVE_INTERNA debe configurarse para llamadas internas');
  }
  if (process.env.NODE_ENV === 'production') {
    if (Buffer.byteLength(configured) < 32) {
      throw new Error('Producción requiere CLAVE_INTERNA aleatoria de al menos 32 bytes');
    }
  }
  return configured;
}
async function llamarInterno(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
      'X-Internal-Key': internalKey(),
    },
  });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const e = new Error(body?.error?.mensaje || `Servicio interno respondió ${response.status}`);
    e.status = response.status;
    e.body = body;
    throw e;
  }
  return body?.data;
}
module.exports = { llamarInterno };
