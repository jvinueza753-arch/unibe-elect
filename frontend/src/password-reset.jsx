import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { confirmAction, useAuth } from './common';
import { PasswordField } from './password-field';

export function RequestPasswordReset() {
  const { api } = useAuth();
  const [correo, setCorreo] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api('/auth/solicitudes-recuperacion', {
        method: 'POST',
        body: JSON.stringify({ correo }),
      });
      setMessage(result.mensaje);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="narrow">
      <Link to="/login" className="link">← Volver al inicio de sesión</Link>
      <span className="eyebrow">RECUPERACIÓN DE CUENTA</span>
      <h1>Solicitar cambio de contraseña</h1>
      <p className="muted">
        Envía tu solicitud para que un administrador la revise. Si la aprueba, te entregará una contraseña temporal por un canal seguro. Inicia sesión con ella y cámbiala desde tu perfil.
      </p>
      <p className="muted">
        ¿Tienes un código de recuperación de una solicitud anterior?{' '}
        <Link to="/restablecer-contrasena" className="link">Ingresarlo aquí</Link>.
      </p>
      <form className="panel" onSubmit={submit}>
        <label>Correo de tu cuenta
          <input type="email" value={correo} onChange={(event) => setCorreo(event.target.value)}
            autoComplete="email" required />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        {message && <p className="success" role="status">{message}</p>}
        <button className="primary" disabled={busy}>
          {busy ? 'Enviando solicitud…' : 'Enviar solicitud'}
        </button>
      </form>
    </section>
  );
}

export function ResetPassword() {
  const { api } = useAuth();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [contrasenaNueva, setContrasenaNueva] = useState('');
  const [passwordValid, setPasswordValid] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState([]);

  async function submit(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const codigo = String(form.get('codigo') || '').trim();
    if (contrasenaNueva !== form.get('confirmar')) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api('/auth/restablecer-contrasena', {
        method: 'POST',
        body: JSON.stringify({ codigo, contrasenaNueva }),
      });
      formElement.reset();
      setContrasenaNueva('');
      setPasswordValid(false);
      setPasswordErrors([]);
      setMessage('Tu contraseña fue actualizada. Ya puedes iniciar sesión.');
      toast.success('Contraseña actualizada.');
    } catch (cause) {
      setPasswordErrors(cause.details?.contrasena || (
        cause.code === 'CONTRASENA_REUTILIZADA' ? ['CONTRASENA_REUTILIZADA'] : []
      ));
      setError(cause.details?.contrasena || cause.code === 'CONTRASENA_REUTILIZADA' ? '' : cause.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="narrow">
      <Link to="/login" className="link">← Volver al inicio de sesión</Link>
      <span className="eyebrow">CÓDIGO DE UN SOLO USO</span>
      <h1>Crear una nueva contraseña</h1>
      <form className="panel" onSubmit={submit}>
        <label>Código entregado por el administrador
          <input
            name="codigo"
            required
            autoComplete="one-time-code"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Pega el código completo"
          />
        </label>
        <p className="muted reset-code-hint">
          Pega aquí el código de un solo uso que te entregó el administrador. No uses una contraseña ni el valor guardado en la base de datos.
        </p>
        <PasswordField
          name="nueva"
          label="Nueva contraseña"
          value={contrasenaNueva}
          onChange={(event) => { setContrasenaNueva(event.target.value); setPasswordErrors([]); }}
          errorCodes={passwordErrors}
          onValidityChange={setPasswordValid}
        />
        <p className="muted">Usa al menos 10 caracteres y máximo 72 bytes UTF-8.</p>
        <label>Confirmar nueva contraseña
          <input type="password" name="confirmar" minLength="10" maxLength="128"
            required autoComplete="new-password" />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        {message && <p className="success" role="status">{message}</p>}
        <button className="primary" disabled={busy || !passwordValid}>
          {busy ? 'Actualizando contraseña…' : 'Guardar contraseña'}
        </button>
      </form>
    </section>
  );
}

const statusLabel = {
  PENDIENTE: 'Pendiente',
  APROBADA: 'Aprobada · código pendiente',
  RECHAZADA: 'Rechazada',
  COMPLETADA: 'Contraseña restablecida',
  EXPIRADA: 'Expirada',
};
const statusDescription = {
  PENDIENTE: 'Espera revisión del administrador. Volver a solicitar refresca la prioridad y la fecha.',
  APROBADA: 'Esta solicitud conserva un código de una versión anterior. Si sigue vigente, puede reemitirse.',
  RECHAZADA: 'La solicitud fue rechazada; el estudiante puede volver a solicitar recuperación.',
  COMPLETADA: 'Se asignó una contraseña temporal; el estudiante puede iniciar sesión y cambiarla. Puede volver a solicitar recuperación.',
  EXPIRADA: 'La solicitud o el código venció; el estudiante puede iniciar una nueva solicitud.',
};

export function AdminPasswordResetRequests() {
  const { api } = useAuth();
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ pagina: 1, limite: 20, total: 0, totalPaginas: 1, pendientes: 0 });
  const [estado, setEstado] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [issuedCredential, setIssuedCredential] = useState(null);
  const issuedCredentialRef = useRef(null);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ pagina: String(pagina), limite: '20' });
      if (estado) query.set('estado', estado);
      if (busqueda) query.set('busqueda', busqueda);
      const result = await api(`/admin/solicitudes-recuperacion?${query}`);
      setItems(result.items);
      setMeta(result.meta);
    } catch (cause) {
      setError(cause.message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [api, busqueda, estado, pagina]);

  useEffect(() => {
    load();
    const timer = setInterval(() => load({ quiet: true }), 30000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPagina(1);
      setBusqueda(textoBusqueda.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [textoBusqueda]);

  useEffect(() => {
    if (issuedCredential) issuedCredentialRef.current?.focus();
  }, [issuedCredential]);

  async function approve(id) {
    if (!await confirmAction('¿Aprobar la solicitud?', 'Se asignará una contraseña temporal aleatoria al estudiante.')) return;
    setBusyId(id);
    setError('');
    setIssuedCredential(null);
    try {
      const result = await api(`/admin/solicitudes-recuperacion/${id}/aprobar`, {
        method: 'POST',
        body: '{}',
      });
      setIssuedCredential(result);
      toast.success('Solicitud aprobada. Copia la contraseña temporal y entrégala por un canal seguro.');
      await load();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusyId('');
    }
  }

  async function reissue(request) {
    if (!await confirmAction(
      '¿Reemitir el código?',
      `El código anterior para ${request.usuario.correo} dejará de funcionar inmediatamente.`,
    )) return;
    setBusyId(request.id);
    setError('');
    setIssuedCredential(null);
    try {
      const result = await api(`/admin/solicitudes-recuperacion/${request.id}/reemitir`, {
        method: 'POST',
        body: '{}',
      });
      setIssuedCredential(result);
      toast.success('Código reemitido. El código anterior quedó invalidado.');
      await load();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusyId('');
    }
  }

  async function reject(request) {
    if (!await confirmAction(
      '¿Rechazar la solicitud?',
      `Se rechazará la recuperación solicitada por ${request.usuario.correo}.`,
    )) return;

    setBusyId(request.id);
    setError('');
    try {
      await api(`/admin/solicitudes-recuperacion/${request.id}/rechazar`, {
        method: 'POST',
        body: '{}',
      });
      setIssuedCredential(null);
      toast.success('Solicitud rechazada.');
      await load();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusyId('');
    }
  }

  async function copyCredential() {
    try {
      const value = issuedCredential.contrasenaTemporal || issuedCredential.codigo;
      await navigator.clipboard.writeText(value);
      toast.success(`${issuedCredential.contrasenaTemporal ? 'Contraseña temporal' : 'Código'} copiado. Entrégalo al estudiante por un canal seguro.`);
    } catch {
      setError('No se pudo copiar automáticamente. Selecciona y copia el valor manualmente.');
    }
  }

  return (
    <section className="panel section-panel" role="region" aria-labelledby="password-reset-heading">
      <div className="section-head">
        <div>
          <span className="eyebrow">SEGURIDAD DE CUENTAS</span>
          <h2 id="password-reset-heading">Solicitudes de recuperación</h2>
        </div>
        <button className="secondary" type="button" onClick={() => load()} disabled={loading}>
          Actualizar
        </button>
      </div>
      <p className="muted">
        Las pendientes aparecen primero. Las contraseñas temporales se muestran una vez y deben entregarse por un canal seguro.
      </p>
      <div className="action-row" role="search" aria-label="Buscar solicitudes de recuperación">
        <label>
          Estado
          <select
            aria-label="Filtrar por estado"
            value={estado}
            onChange={(event) => { setEstado(event.target.value); setPagina(1); }}
          >
            <option value="">Todos los estados</option>
            {Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          Correo o código estudiantil
          <input
            aria-label="Buscar por correo o código estudiantil"
            type="search"
            value={textoBusqueda}
            onChange={(event) => setTextoBusqueda(event.target.value)}
            placeholder="Buscar solicitudes"
          />
        </label>
        <span className="status" role="status" aria-live="polite">
          Pendientes: {meta.pendientes}
        </span>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {issuedCredential && (
        <div className="panel reset-code" role="status" aria-live="polite">
          <b>{issuedCredential.contrasenaTemporal ? 'Contraseña temporal' : 'Código de un solo uso'} para {issuedCredential.correo}</b>
          <p className="muted">{issuedCredential.mensaje}</p>
          <div className="action-row">
            <input
              ref={issuedCredentialRef}
              aria-label={issuedCredential.contrasenaTemporal ? 'Contraseña temporal' : 'Código de recuperación'}
              readOnly
              value={issuedCredential.contrasenaTemporal || issuedCredential.codigo}
            />
            <button className="secondary" type="button" onClick={copyCredential}>
              {issuedCredential.contrasenaTemporal ? 'Copiar contraseña' : 'Copiar código'}
            </button>
          </div>
          {issuedCredential.codigoExpira && <small>Vence: {new Date(issuedCredential.codigoExpira).toLocaleString()}</small>}
        </div>
      )}
      {loading ? <p role="status">Cargando solicitudes…</p> : items.length === 0 ? (
        <div className="empty"><h3>No hay solicitudes de recuperación</h3></div>
      ) : (
        <div className="list" aria-busy={loading}>
          {items.map((request) => (
            <article className="panel election" key={request.id}>
              <div>
                <span className="status">{statusLabel[request.estado] || request.estado}</span>
                <h3>{request.usuario.nombres} {request.usuario.apellidos}</h3>
                <p className="muted">{request.usuario.correo} · Cód. estudiantil: {request.usuario.codigoEstudiantil}</p>
                <p className="muted">{statusDescription[request.estado] || 'Consulta al estudiante o revisa el historial de la solicitud.'}</p>
                <small>Solicitud/prioridad actualizada: {new Date(request.solicitadaEn).toLocaleString()}</small>
                {request.aprobadaEn && (
                  <p><small>Aprobada: {new Date(request.aprobadaEn).toLocaleString()} · {request.aprobadaPor?.nombres} {request.aprobadaPor?.apellidos}</small></p>
                )}
                {request.rechazadaEn && (
                  <p><small>Rechazada: {new Date(request.rechazadaEn).toLocaleString()} · {request.rechazadaPor?.nombres} {request.rechazadaPor?.apellidos}</small></p>
                )}
                {request.reemitidaEn && (
                  <p><small>Última reemisión: {new Date(request.reemitidaEn).toLocaleString()} · {request.reemitidaPor?.nombres} {request.reemitidaPor?.apellidos}</small></p>
                )}
                {request.resueltaEn && (
                  <p><small>Resuelta: {new Date(request.resueltaEn).toLocaleString()}</small></p>
                )}
              </div>
              {request.estado === 'PENDIENTE' && (
                <div className="action-row">
                  <button className="primary" type="button" disabled={busyId === request.id}
                    onClick={() => approve(request.id)}>
                    {busyId === request.id ? 'Procesando…' : 'Aprobar y generar contraseña temporal'}
                  </button>
                  <button className="secondary" type="button" disabled={busyId === request.id}
                    onClick={() => reject(request)}>
                    Rechazar
                  </button>
                </div>
              )}
              {request.codigoExpira && request.estado === 'APROBADA' && (
                <div className="action-row">
                  <small>Código vigente hasta: {new Date(request.codigoExpira).toLocaleString()}</small>
                  {new Date(request.codigoExpira).getTime() > Date.now() && (
                    <button className="secondary" type="button" disabled={busyId === request.id}
                      onClick={() => reissue(request)}>
                      {busyId === request.id ? 'Procesando…' : 'Reemitir código'}
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {!loading && meta.totalPaginas > 1 && (
        <nav className="action-row" aria-label="Paginación de solicitudes de recuperación">
          <button className="secondary" type="button" disabled={pagina <= 1 || loading}
            onClick={() => setPagina((current) => current - 1)}>
            Anterior
          </button>
          <span aria-current="page">Página {pagina} de {meta.totalPaginas} · {meta.total} solicitudes</span>
          <button className="secondary" type="button" disabled={pagina >= meta.totalPaginas || loading}
            onClick={() => setPagina((current) => current + 1)}>
            Siguiente
          </button>
        </nav>
      )}
    </section>
  );
}
