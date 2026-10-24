import React, { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Shell, fmt, useAuth } from './common';

export function Home() {
  const { api, user } = useAuth();
  const admin = user?.rol === 'ADMINISTRADOR';
  const [elections, setElections] = useState([]);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        const [data, publishedResults] = admin
          ? await Promise.all([
              api('/elecciones/panel-administrador'),
              api('/resultados'),
            ])
          : await Promise.all([
              api('/elecciones/estudiante'),
              api('/resultados'),
            ]);
        const available = admin
          ? data
          : data.filter((election) =>
              ['ABIERTA', 'PROGRAMADA'].includes(election.estado),
            );
        const rows = await Promise.all(
          available.map(async (election) => {
            if (election.estado !== 'ABIERTA') return election;
            const participacion = admin
              ? election.participacion
              : await api(`/elecciones/${election.id}/participacion`);
            return { ...election, participacion };
          }),
        );
        if (active) {
          setElections(rows);
          setResults(publishedResults);
          setError('');
        }
      } catch (cause) {
        if (active) setError(cause.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    const refresh = window.setInterval(load, 60_000);
    return () => {
      active = false;
      window.clearInterval(refresh);
    };
  }, [admin, api, user]);

  if (!user) return <Navigate to="/login" replace />;

  const totalVotaron = elections.reduce(
    (total, election) => total + (election.participacion?.totalVotaron || 0),
    0,
  );
  const totalPendientes = elections.reduce(
    (total, election) => total + (election.participacion?.pendientes || 0),
    0,
  );

  return (
    <Shell>
      <section className="hero">
        <span className="eyebrow">PANEL PRINCIPAL</span>
        <h1>Hola, {user.nombres}.</h1>
        <p>
          {admin
            ? 'Consulta la participación y el cierre de las elecciones abiertas.'
            : 'Revisa tus elecciones, fechas de cierre y participación.'}
        </p>
        <div className="role-pill">
          {admin ? 'Administrador' : 'Estudiante'} · {user.facultad}
        </div>
      </section>

      {error && <p className="error" role="alert">{error}</p>}
      {loading ? (
        <p role="status">Cargando el panel…</p>
      ) : admin ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <section className="panel dashboard-stat">
              <span className="muted">Elecciones abiertas</span>
              <strong>{elections.length}</strong>
            </section>
            <section className="panel dashboard-stat">
              <span className="muted">Participaciones registradas</span>
              <strong>{totalVotaron}</strong>
            </section>
            <section className="panel dashboard-stat">
              <span className="muted">Participaciones pendientes</span>
              <strong>{totalPendientes}</strong>
            </section>
          </div>
          <div className="section-head dashboard-section">
            <div>
              <span className="eyebrow">SEGUIMIENTO</span>
              <h2>Elecciones abiertas</h2>
            </div>
            <Link className="secondary button-link" to="/admin/elecciones">
              Gestionar elecciones
            </Link>
          </div>
          {elections.length === 0 ? (
            <div className="panel empty">
              <h3>No hay elecciones abiertas</h3>
              <p className="muted">Las nuevas elecciones aparecerán aquí al publicarse.</p>
            </div>
          ) : (
            <div className="list">
              {elections.map((election) => (
                <article className="panel dashboard-election" key={election.id}>
                  <div className="section-head">
                    <div>
                      <span className="status abierta">ABIERTA</span>
                      <h3>{election.titulo}</h3>
                      <p className="muted">Cierra: {fmt(election.fechaCierre)}</p>
                    </div>
                    <Link className="secondary button-link" to={`/admin/elecciones/${election.id}`}>
                      Ver elección
                    </Link>
                  </div>
                  <Participation election={election} admin />
                </article>
              ))}
            </div>
          )}
          <DashboardResults results={results} admin={admin} />
          <div className="cards dashboard-links">
            <Link className="feature panel" to="/admin/usuarios">
              <span className="feature-num">01</span>
              <h3>Usuarios</h3>
              <p>Consulta estudiantes y administra accesos.</p>
            </Link>
            <Link className="feature panel" to="/resultados">
              <span className="feature-num">02</span>
              <h3>Resultados</h3>
              <p>Revisa escrutinios y publica resultados oficiales.</p>
            </Link>
          </div>
        </>
      ) : (
        <>
          <div className="section-head dashboard-section">
            <div>
              <span className="eyebrow">TU PARTICIPACIÓN</span>
              <h2>Elecciones disponibles</h2>
            </div>
            <Link className="secondary button-link" to="/resultados">
              Ver escrutinios publicados
            </Link>
          </div>
          {elections.length === 0 ? (
            <div className="panel empty">
              <h3>No tienes elecciones programadas o abiertas</h3>
              <p className="muted">Aquí aparecerán las elecciones en las que puedes participar.</p>
            </div>
          ) : (
            <div className="list">
              {elections.map((election) => (
                <article className="panel dashboard-election" key={election.id}>
                  <div className="section-head">
                    <div>
                      <span className={`status ${election.estado.toLowerCase()}`}>
                        {election.estado}
                      </span>
                      <h3>{election.titulo}</h3>
                      <p className="muted">
                        {election.estado === 'ABIERTA' ? 'Cierra' : 'Abre'}:{' '}
                        {fmt(
                          election.estado === 'ABIERTA'
                            ? election.fechaCierre
                            : election.fechaApertura,
                        )}
                      </p>
                    </div>
                    {election.estado === 'ABIERTA' &&
                      (election.yaVoto ? (
                        <span className="success">Tu voto ya está registrado</span>
                      ) : (
                        <Link className="primary button-link" to={`/elecciones/${election.id}/votar`}>
                          Tu voto está pendiente · Votar
                        </Link>
                      ))}
                  </div>
                  {election.estado === 'ABIERTA' && (
                    <Participation election={election} />
                  )}
                </article>
              ))}
            </div>
          )}
          <DashboardResults results={results} admin={admin} />
          <div className="cards dashboard-links">
            <Link className="feature panel" to="/perfil">
              <span className="feature-num">01</span>
              <h3>Mi perfil</h3>
              <p>Revisa tus datos y cambia tu contraseña.</p>
            </Link>
          </div>
        </>
      )}
    </Shell>
  );
}

function DashboardResults({ results, admin }) {
  return (
    <>
      <div className="section-head dashboard-section">
        <div>
          <span className="eyebrow">TRANSPARENCIA</span>
          <h2>{admin ? 'Escrutinios y publicaciones' : 'Escrutinios publicados'}</h2>
        </div>
      </div>
      {results.length === 0 ? (
        <div className="panel empty">
          <h3>{admin ? 'Aún no hay escrutinios generados' : 'Aún no hay escrutinios publicados'}</h3>
          <p className="muted">Los resultados oficiales estarán disponibles al publicarse.</p>
        </div>
      ) : (
        <div className="list">
          {results.map((result) => (
            <Link className="panel election" key={result.eleccionId}
              to={`${admin ? '/admin/resultados' : '/resultados'}/${result.eleccionId}`}>
              <div>
                <span className="status">{result.estado}</span>
                <h3>{result.titulo}</h3>
                <small>
                  {result.publicadoEn ? 'Publicado' : 'Generado'}:{' '}
                  {fmt(result.publicadoEn || result.generadoEn)}
                </small>
              </div>
              <span className="arrow">↗</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function Participation({ election, admin = false }) {
  const stats = election.participacion;
  if (!stats) return null;

  return (
    <div className="dashboard-participation">
      <div className="dashboard-participation-heading">
        <span>
          Participación general: <strong>{stats.porcentaje}%</strong>
        </span>
        <span className="muted">
          {stats.totalVotaron} de {stats.totalHabilitados} han votado
        </span>
      </div>
      <div
        className="bar"
        role="progressbar"
        aria-label={`Participación en ${election.titulo}`}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={stats.porcentaje}
      >
        <span style={{ width: `${Math.min(100, stats.porcentaje)}%` }} />
      </div>
      {admin && (
        <p className="muted dashboard-pending">
          {stats.pendientes} {stats.pendientes === 1 ? 'persona pendiente' : 'personas pendientes'} por votar.
        </p>
      )}
    </div>
  );
}
