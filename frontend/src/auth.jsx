import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './common';

export function Login() {
  const { api, login, user } = useAuth();
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  if (user) return <Navigate to="/" replace />;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      login(await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ correo: correo.trim(), contrasena }),
      }));
      navigate('/', { replace: true });
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-layout">
      <div className="intro">
        <div className="eyebrow">DEMOCRACIA UNIVERSITARIA</div>
        <h1>Tu voz.<br /><em>Tu universidad.</em></h1>
        <p>Una plataforma sencilla y segura para participar en las decisiones estudiantiles de UNIBE.</p>
        <div className="stat-row">
          <div><b>01</b><span>Una persona, un voto</span></div>
          <div><b>100%</b><span>Participación anónima</span></div>
        </div>
      </div>
      <form className="panel login" onSubmit={submit}>
        <span className="eyebrow">BIENVENIDO/A</span>
        <h2>Iniciar sesión</h2>
        <p className="muted">Accede con tus credenciales universitarias.</p>
        <label>Correo electrónico
          <input type="email" value={correo} onChange={(event) => setCorreo(event.target.value)} required autoComplete="username" />
        </label>
        <label>Contraseña
          <input type="password" value={contrasena} onChange={(event) => setContrasena(event.target.value)} required autoComplete="current-password" />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>
          {busy ? 'Ingresando…' : 'Ingresar'} <span>→</span>
        </button>
        <p className="muted tiny">Administrador de demostración: admin@unibe.edu.ec · Admin12345!</p>
        <Link className="link" to="/recuperar-contrasena">¿Olvidaste tu contraseña?</Link>
        <Link className="link" to="/registro">¿Eres estudiante? Crear cuenta</Link>
      </form>
    </div>
  );
}

export function Registro() {
  const { api } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    nombres: '', apellidos: '', correo: '', contrasena: '',
    codigoEstudiantil: '', facultad: 'Ingeniería', carrera: 'Software',
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function update(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api('/auth/registro', { method: 'POST', body: JSON.stringify(form) });
      setMessage('Cuenta creada. Ya puedes iniciar sesión.');
      window.setTimeout(() => navigate('/login'), 900);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="narrow">
      <Link to="/login" className="link">← Volver al inicio</Link>
      <h1>Registro de estudiante</h1>
      <form className="panel form-grid" onSubmit={submit}>
        {[
          ['nombres', 'Nombres'], ['apellidos', 'Apellidos'],
          ['correo', 'Correo electrónico', 'email'],
          ['contrasena', 'Contraseña', 'password'],
          ['codigoEstudiantil', 'Código estudiantil'],
        ].map(([name, label, type]) => (
          <label key={name}>{label}
            <input name={name} type={type || 'text'} value={form[name]} onChange={update}
              required minLength={name === 'contrasena' ? 8 : undefined} />
          </label>
        ))}
        <label>Facultad
          <select name="facultad" value={form.facultad} onChange={update}>
            <option>Ingeniería</option><option>Ciencias Empresariales</option><option>Derecho</option>
          </select>
        </label>
        <label>Carrera
          <select name="carrera" value={form.carrera} onChange={update}>
            <option>Software</option><option>Sistemas</option><option>Administración</option><option>Derecho</option>
          </select>
        </label>
        <div className="full">
          {error && <p className="error" role="alert">{error}</p>}
          {message && <p className="success">{message}</p>}
          <button className="primary" disabled={busy}>{busy ? 'Creando cuenta…' : 'Crear cuenta'}</button>
        </div>
      </form>
    </section>
  );
}
