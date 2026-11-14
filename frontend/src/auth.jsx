import React, { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './common';
import { PasswordField } from './password-field';
import { Wizard } from './wizard';

export function Login() {
  const { api, login, user } = useAuth();
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [lockAnnouncement, setLockAnnouncement] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!lockedUntil) return undefined;
    const updateCountdown = () => {
      const seconds = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      setSecondsRemaining(seconds);
      if (seconds === 0) {
        setLockedUntil(null);
        setLockAnnouncement('El bloqueo terminó. Puedes volver a intentarlo.');
      }
    };
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [lockedUntil]);

  if (user) return <Navigate to="/" replace />;

  async function submit(event) {
    event.preventDefault();
    if (secondsRemaining > 0) return;
    setBusy(true);
    setError('');
    try {
      login(await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ correo: correo.trim(), contrasena }),
      }));
      navigate('/', { replace: true });
    } catch (cause) {
      if (cause.status === 429 && cause.code === 'DEMASIADOS_INTENTOS') {
        const seconds = Number(cause.details?.reintentarEnSegundos || cause.retryAfter || 0);
        if (seconds > 0) {
          setLockedUntil(Date.now() + seconds * 1000);
          setSecondsRemaining(seconds);
          setLockAnnouncement('Cuenta bloqueada temporalmente.');
          setError('');
          return;
        }
      }
      const remaining = cause.status === 401
        ? Number(cause.details?.intentosRestantes)
        : NaN;
      setError(Number.isInteger(remaining) && remaining <= 3
        ? `${cause.message} Te quedan ${remaining} ${remaining === 1 ? 'intento' : 'intentos'}.`
        : cause.message);
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
        <p className="visually-hidden" aria-live="polite">{lockAnnouncement}</p>
        {secondsRemaining > 0 && (
          <div className="lockout-panel" role="status">
            <b>Cuenta bloqueada temporalmente</b>
            <span aria-hidden="true">
              {String(Math.floor(secondsRemaining / 60)).padStart(2, '0')}:
              {String(secondsRemaining % 60).padStart(2, '0')}
            </span>
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy || secondsRemaining > 0}>
          {busy ? 'Ingresando…' : 'Ingresar'} <span>→</span>
        </button>
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
  const [passwordValid, setPasswordValid] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [stepIndex, setStepIndex] = useState(0);

  function update(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
    setPasswordErrors([]);
    setFieldErrors((current) => ({ ...current, [event.target.name]: '' }));
  }

  function validatePersonalData() {
    const errors = {
      nombres: form.nombres.trim() ? '' : 'Ingresa tus nombres.',
      apellidos: form.apellidos.trim() ? '' : 'Ingresa tus apellidos.',
    };
    setFieldErrors(errors);
    return !Object.values(errors).some(Boolean);
  }

  function validateStudentData() {
    const errors = {
      codigoEstudiantil: form.codigoEstudiantil.trim() ? '' : 'Ingresa tu código estudiantil.',
    };
    setFieldErrors(errors);
    return !Object.values(errors).some(Boolean);
  }

  function validateAccount() {
    const errors = {
      correo: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.correo.trim())
        ? ''
        : 'Ingresa un correo electrónico válido.',
    };
    setFieldErrors(errors);
    return !Object.values(errors).some(Boolean) && passwordValid;
  }

  async function submit() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api('/auth/registro', { method: 'POST', body: JSON.stringify(form) });
      setMessage('Cuenta creada. Ya puedes iniciar sesión.');
      window.setTimeout(() => navigate('/login'), 900);
    } catch (cause) {
      setPasswordErrors(cause.details?.contrasena || []);
      if (cause.code === 'CODIGO_EXISTENTE') setStepIndex(1);
      else if (cause.code === 'CORREO_EXISTENTE' || cause.details?.correo) setStepIndex(2);
      else if (cause.details?.contrasena) setStepIndex(2);
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  const steps = [
    {
      id: 'datos',
      titulo: 'Tus datos',
      descripcion: 'Cuéntanos cómo te llamas.',
      validar: validatePersonalData,
      contenido: (
        <div className="wz-fields">
          <label>Nombres
            <input name="nombres" value={form.nombres} onChange={update} required
              aria-invalid={Boolean(fieldErrors.nombres)} aria-describedby="error-nombres" />
            {fieldErrors.nombres && <small id="error-nombres" className="error">{fieldErrors.nombres}</small>}
          </label>
          <label>Apellidos
            <input name="apellidos" value={form.apellidos} onChange={update} required
              aria-invalid={Boolean(fieldErrors.apellidos)} aria-describedby="error-apellidos" />
            {fieldErrors.apellidos && <small id="error-apellidos" className="error">{fieldErrors.apellidos}</small>}
          </label>
        </div>
      ),
    },
    {
      id: 'carrera',
      titulo: 'Tu carrera',
      descripcion: 'Usamos estos datos para validar tu elegibilidad en las elecciones.',
      validar: validateStudentData,
      contenido: (
        <div className="wz-fields">
          <label>Código estudiantil
            <input name="codigoEstudiantil" value={form.codigoEstudiantil} onChange={update} required
              aria-invalid={Boolean(fieldErrors.codigoEstudiantil)} aria-describedby="error-codigo" />
            {fieldErrors.codigoEstudiantil && <small id="error-codigo" className="error">{fieldErrors.codigoEstudiantil}</small>}
          </label>
          <label>Facultad
            <select name="facultad" value={form.facultad} onChange={update} required>
              <option>Ingeniería</option><option>Ciencias Empresariales</option><option>Derecho</option>
            </select>
          </label>
          <label>Carrera
            <select name="carrera" value={form.carrera} onChange={update} required>
              <option>Software</option><option>Sistemas</option><option>Administración</option><option>Derecho</option>
            </select>
          </label>
        </div>
      ),
    },
    {
      id: 'cuenta',
      titulo: 'Tu cuenta',
      descripcion: 'Define el correo y una contraseña segura para ingresar.',
      validar: validateAccount,
      contenido: (
        <>
          <label>Correo electrónico
            <input name="correo" type="email" value={form.correo} onChange={update} required
              autoComplete="email" aria-invalid={Boolean(fieldErrors.correo)} aria-describedby="error-correo" />
            {fieldErrors.correo && <small id="error-correo" className="error">{fieldErrors.correo}</small>}
          </label>
          <PasswordField
            name="contrasena"
            value={form.contrasena}
            onChange={update}
            correo={form.correo}
            codigoEstudiantil={form.codigoEstudiantil}
            errorCodes={passwordErrors}
            onValidityChange={setPasswordValid}
          />
        </>
      ),
    },
    {
      id: 'revision',
      titulo: 'Revisión',
      descripcion: 'Confirma que los datos estén correctos. La contraseña no se muestra en este resumen.',
      contenido: (
        <dl className="wz-review">
          <div><dt>Nombres y apellidos</dt><dd>{form.nombres} {form.apellidos}</dd></div>
          <div><dt>Código estudiantil</dt><dd>{form.codigoEstudiantil}</dd></div>
          <div><dt>Facultad y carrera</dt><dd>{form.facultad} · {form.carrera}</dd></div>
          <div><dt>Correo</dt><dd>{form.correo}</dd></div>
        </dl>
      ),
    },
  ];

  return (
    <section className="narrow">
      <Link to="/login" className="link">← Volver al inicio</Link>
      <h1>Registro de estudiante</h1>
      {message && <p className="success" role="status">{message}</p>}
      <Wizard
        steps={steps}
        stepIndex={stepIndex}
        onStepChange={setStepIndex}
        onFinish={submit}
        busy={busy}
        finishLabel="Crear cuenta"
        error={error}
      />
    </section>
  );
}
