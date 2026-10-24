import React, { useState } from 'react';
import { Shell, useAuth } from './common';

export function Profile() {
  const { api, user } = useAuth();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      await api('/auth/cambiar-contrasena', {
        method: 'POST',
        body: JSON.stringify({ contrasenaActual: form.get('actual'), contrasenaNueva: form.get('nueva') }),
      });
      event.currentTarget.reset();
      setMessage('Contraseña actualizada.');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <section className="narrow"><span className="eyebrow">MI CUENTA</span><h1>Mi perfil</h1>
        <div className="panel profile">
          <p><span>Nombre</span><b>{user.nombres} {user.apellidos}</b></p>
          <p><span>Correo</span><b>{user.correo}</b></p>
          <p><span>Código estudiantil</span><b>{user.codigoEstudiantil}</b></p>
          <p><span>Facultad / carrera</span><b>{user.facultad} / {user.carrera}</b></p>
        </div>
        <form className="panel" onSubmit={submit}>
          <h2>Cambiar contraseña</h2>
          <label>Contraseña actual<input type="password" name="actual" required autoComplete="current-password" /></label>
          <label>Nueva contraseña<input type="password" name="nueva" minLength="8" required autoComplete="new-password" /></label>
          {error && <p className="error" role="alert">{error}</p>}
          {message && <p className="success">{message}</p>}
          <button className="primary" disabled={busy}>{busy ? 'Actualizando…' : 'Actualizar contraseña'}</button>
        </form>
      </section>
    </Shell>
  );
}
