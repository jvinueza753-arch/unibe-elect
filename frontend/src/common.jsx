import React, { Component, createContext, useCallback, useContext, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';

const API = '/api/v1';
const AuthContext = createContext(null);

export function readStoredUser() {
  try {
    const value = sessionStorage.getItem('usuario');
    return value ? JSON.parse(value) : null;
  } catch {
    sessionStorage.removeItem('usuario');
    sessionStorage.removeItem('token');
    return null;
  }
}

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [token, setToken] = useState(() => sessionStorage.getItem('token') || '');
  const [user, setUser] = useState(readStoredUser);

  const logout = useCallback((redirect = false) => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('usuario');
    setToken('');
    setUser(null);
    if (redirect) navigate('/login', { replace: true });
  }, [navigate]);

  const request = useCallback(async (path, options = {}) => {
    const headers = { ...(options.headers || {}) };
    if (options.body != null && !(options.body instanceof FormData) && !(options.body instanceof Blob)) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${API}${path}`, { ...options, headers });
    let payload = null;
    if (response.status !== 204) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/csv') || contentType.includes('application/pdf')) {
        payload = await response.blob();
      } else {
        const text = await response.text();
        if (text) {
          try {
            payload = JSON.parse(text);
          } catch {
            throw new Error('El servidor devolvió una respuesta no válida.');
          }
        }
      }
    }

    if (response.status === 401 && token && payload?.error?.codigo === 'NO_AUTENTICADO') {
      logout(true);
      throw new Error('La sesión venció. Inicia sesión de nuevo.');
    }

    if (!response.ok) {
      const error = new Error(payload?.error?.mensaje || `No se pudo completar la solicitud (${response.status}).`);
      error.status = response.status;
      error.code = payload?.error?.codigo;
      error.details = payload?.error?.detalles;
      const retryAfter = response.headers.get('retry-after');
      error.retryAfter = retryAfter && Number.isFinite(Number(retryAfter))
        ? Number(retryAfter)
        : null;
      throw error;
    }
    return payload;
  }, [logout, token]);

  const api = useCallback(async (path, options) => {
    const payload = await request(path, options);
    return payload?.data ?? payload;
  }, [request]);

  const login = useCallback((data) => {
    if (!data?.token || !data?.usuario) throw new Error('La respuesta de inicio de sesión está incompleta.');
    sessionStorage.setItem('token', data.token);
    sessionStorage.setItem('usuario', JSON.stringify(data.usuario));
    setToken(data.token);
    setUser(data.usuario);
  }, []);

  return (
    <AuthContext.Provider value={{ api, request, token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export async function confirmAction(title, text) {
  const result = await Swal.fire({
    title,
    text,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Confirmar',
    cancelButtonText: 'Cancelar',
    reverseButtons: true,
    focusCancel: true,
    buttonsStyling: false,
    customClass: {
      popup: 'confirm-dialog',
      title: 'confirm-dialog-title',
      htmlContainer: 'confirm-dialog-text',
      actions: 'confirm-dialog-actions',
      confirmButton: 'primary',
      cancelButton: 'secondary',
    },
  });
  return result.isConfirmed;
}

export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main className="container">
          <section className="panel narrow">
            <h1>No se pudo mostrar esta pantalla</h1>
            <p className="error">{this.state.error.message || 'Ocurrió un error inesperado.'}</p>
            <button className="primary" onClick={() => window.location.reload()}>Volver a cargar</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

export function fmt(date) {
  return date
    ? new Date(date).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })
    : '—';
}

export function toLocalInput(date) {
  if (!date) return '';
  const value = new Date(date);
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function Shell({ children }) {
  const { user, logout } = useAuth();
  return (
    <>
      <header className="top sticky top-0 z-20 bg-white/95 backdrop-blur">
        <Link to="/" className="brand">
          <span className="mark">U</span>
          <span><b>UNIBE Elect</b><small>Votaciones universitarias</small></span>
        </Link>
        {user && (
          <nav>
            {user.rol === 'ADMINISTRADOR' ? (
              <>
                <Link to="/admin/elecciones">Elecciones</Link>
                <Link to="/admin/usuarios">Usuarios</Link>
                <Link to="/resultados">Resultados</Link>
              </>
            ) : (
              <>
                <Link to="/elecciones">Votar</Link>
                <Link to="/resultados">Resultados</Link>
                <Link to="/perfil">Mi perfil</Link>
              </>
            )}
            <span className="who">{user.nombres}</span>
            <button className="ghost" onClick={() => logout(true)}>Cerrar sesión</button>
          </nav>
        )}
      </header>
      <main className="container">{children}</main>
      <footer>UNIBE Elect ·2026</footer>
    </>
  );
}

export function Protected({ children, role }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.rol !== role) return <Navigate to="/" replace />;
  return children;
}
