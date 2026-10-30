import React, { useState } from 'react';
import { Shell, useAuth } from './common';

export function Profile() {
  const { api, user } = useAuth();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setError('');
    setMessage('');
    const form = new FormData(formElement);
    try {
      await api('/auth/cambiar-contrasena', {
        method: 'POST',
        body: JSON.stringify({ contrasenaActual: form.get('actual'), contrasenaNueva: form.get('nueva') }),
      });
      formElement.reset();
      setMessage('Contraseña actualizada.');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <section className="narrow profile-page">
        <div className="profile-heading">
          <span className="eyebrow">MI CUENTA</span>
          <h1>Mi perfil</h1>
          <p>Consulta tus datos y mantén segura tu cuenta universitaria.</p>
        </div>
        <div className="panel profile-card">
          <div className="profile-card-heading">
            <span className="profile-avatar" aria-hidden="true">
              {`${user.nombres?.[0] || ''}${user.apellidos?.[0] || ''}`.toUpperCase()}
            </span>
            <div>
              <h2>{user.nombres} {user.apellidos}</h2>
              <p>{user.correo}</p>
            </div>
            <span className="role-pill">Estudiante</span>
          </div>
          <div className="profile-details">
            <div><span>Código estudiantil</span><b>{user.codigoEstudiantil}</b></div>
            <div><span>Facultad</span><b>{user.facultad}</b></div>
            <div><span>Carrera</span><b>{user.carrera}</b></div>
          </div>
        </div>
        <form className="panel password-panel" onSubmit={submit}>
          <div className="profile-heading">
            <span className="eyebrow">SEGURIDAD</span>
            <h2>Cambiar contraseña</h2>
            <p>Usa una contraseña nueva de al menos 8 caracteres.</p>
          </div>
          <label>Contraseña actual<input type="password" name="actual" required autoComplete="current-password" /></label>
          <label>Nueva contraseña<input type="password" name="nueva" minLength={8} maxLength={128} required autoComplete="new-password" /></label>
          {error && <p className="error" role="alert">{error}</p>}
          {message && <p className="success" role="status" aria-live="polite">{message}</p>}
          <button className="primary" disabled={busy}>{busy ? 'Actualizando…' : 'Actualizar contraseña'}</button>
        </form>
      </section>
    </Shell>
  );
}
