import React, { useState } from 'react';
import { Shell, useAuth } from './common';
import { PasswordField } from './password-field';

export function Profile() {
  const { api, user } = useAuth();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordValid, setPasswordValid] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState([]);

  async function submit(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api('/auth/cambiar-contrasena', {
        method: 'POST',
        body: JSON.stringify({ contrasenaActual: currentPassword, contrasenaNueva: newPassword }),
      });
      formElement.reset();
      setCurrentPassword('');
      setNewPassword('');
      setPasswordValid(false);
      setMessage('Contraseña actualizada.');
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
            <p>Usa una contraseña nueva de al menos 10 caracteres.</p>
          </div>
          <label>Contraseña actual<input type="password" name="actual" value={currentPassword}
            onChange={(event) => { setCurrentPassword(event.target.value); setPasswordErrors([]); }}
            required autoComplete="current-password" /></label>
          <PasswordField
            name="nueva"
            label="Nueva contraseña"
            value={newPassword}
            onChange={(event) => { setNewPassword(event.target.value); setPasswordErrors([]); }}
            correo={user.correo}
            codigoEstudiantil={user.codigoEstudiantil}
            currentPassword={currentPassword}
            errorCodes={passwordErrors}
            onValidityChange={setPasswordValid}
          />
          {error && <p className="error" role="alert">{error}</p>}
          {message && <p className="success" role="status" aria-live="polite">{message}</p>}
          <button className="primary" disabled={busy || !passwordValid}>{busy ? 'Actualizando…' : 'Actualizar contraseña'}</button>
        </form>
      </section>
    </Shell>
  );
}
