import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { confirmAction, useAuth } from './common';

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
        Un administrador revisará tu solicitud. Si se aprueba, te entregará un código de un solo uso.
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

  async function submit(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const codigo = String(form.get('codigo') || '').trim();
    const contrasenaNueva = String(form.get('nueva') || '');
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
      setMessage('Tu contraseña fue actualizada. Ya puedes iniciar sesión.');
      toast.success('Contraseña actualizada.');
    } catch (cause) {
      setError(cause.message);
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
          <input name="codigo" required autoComplete="one-time-code" />
        </label>
        <label>Nueva contraseña
          <input type="password" name="nueva" minLength="8" maxLength="128"
            required autoComplete="new-password" />
        </label>
        <label>Confirmar nueva contraseña
          <input type="password" name="confirmar" minLength="8" maxLength="128"
            required autoComplete="new-password" />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        {message && <p className="success" role="status">{message}</p>}
        <button className="primary" disabled={busy}>
          {busy ? 'Actualizando contraseña…' : 'Guardar contraseña'}
        </button>
      </form>
    </section>
  );
}

const statusLabel = {
  PENDIENTE: 'Pendiente',
  APROBADA: 'Aprobada · código emitido',
  RECHAZADA: 'Rechazada',
  COMPLETADA: 'Completada',
  EXPIRADA: 'Código vencido',
};

export function AdminPasswordResetRequests() {
  const { api } = useAuth();
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [issuedCode, setIssuedCode] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await api('/admin/solicitudes-recuperacion'));
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  async function approve(id) {
    setBusyId(id);
    setError('');
    setIssuedCode(null);
    try {
      const result = await api(`/admin/solicitudes-recuperacion/${id}/aprobar`, {
        method: 'POST',
        body: '{}',
      });
      setIssuedCode(result);
      toast.success('Solicitud aprobada. Copia el código y entrégalo al estudiante por un canal seguro.');
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
      setIssuedCode(null);
      toast.success('Solicitud rechazada.');
      await load();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusyId('');
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(issuedCode.codigo);
      toast.success('Código copiado. Entrégalo al estudiante por un canal seguro.');
    } catch {
      setError('No se pudo copiar automáticamente. Selecciona y copia el código manualmente.');
    }
  }

  return (
    <section className="panel section-panel">
      <div className="section-head">
        <div>
          <span className="eyebrow">SEGURIDAD DE CUENTAS</span>
          <h2>Solicitudes de recuperación</h2>
        </div>
        <button className="secondary" type="button" onClick={load} disabled={loading}>
          Actualizar
        </button>
      </div>
      <p className="muted">
        El código se muestra una sola vez al aprobar. Entrégalo directamente al estudiante; vence en una hora.
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      {issuedCode && (
        <div className="panel reset-code" role="status">
          <b>Código de un solo uso para {issuedCode.correo}</b>
          <p className="muted">{issuedCode.mensaje}</p>
          <div className="action-row">
            <input aria-label="Código de recuperación" readOnly value={issuedCode.codigo} />
            <button className="secondary" type="button" onClick={copyCode}>Copiar código</button>
          </div>
          <small>Vence: {new Date(issuedCode.codigoExpira).toLocaleString()}</small>
        </div>
      )}
      {loading ? <p role="status">Cargando solicitudes…</p> : items.length === 0 ? (
        <div className="empty"><h3>No hay solicitudes de recuperación</h3></div>
      ) : (
        <div className="list">
          {items.map((request) => (
            <article className="panel election" key={request.id}>
              <div>
                <span className="status">{statusLabel[request.estado] || request.estado}</span>
                <h3>{request.usuario.nombres} {request.usuario.apellidos}</h3>
                <p className="muted">{request.usuario.correo} · Código: {request.usuario.codigoEstudiantil}</p>
                <small>Solicitada: {new Date(request.solicitadaEn).toLocaleString()}</small>
              </div>
              {request.estado === 'PENDIENTE' && (
                <div className="action-row">
                  <button className="primary" type="button" disabled={busyId === request.id}
                    onClick={() => approve(request.id)}>
                    {busyId === request.id ? 'Procesando…' : 'Aprobar y generar código'}
                  </button>
                  <button className="secondary" type="button" disabled={busyId === request.id}
                    onClick={() => reject(request)}>
                    Rechazar
                  </button>
                </div>
              )}
              {request.codigoExpira && request.estado === 'APROBADA' && (
                <small>Código vence: {new Date(request.codigoExpira).toLocaleString()}</small>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
