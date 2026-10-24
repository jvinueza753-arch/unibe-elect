import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Shell, fmt, useAuth } from './common';

export function ResultsList() {
  const { api, user } = useAuth();
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api('/resultados')
      .then((data) => { if (active) setItems(data || []); })
      .catch((cause) => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api]);

  const admin = user.rol === 'ADMINISTRADOR';
  return (
    <Shell>
      <span className="eyebrow">TRANSPARENCIA</span><h1>Resultados electorales</h1>
      {error && <p className="error" role="alert">{error}</p>}
      {loading ? <p role="status">Cargando resultados…</p> : items.length === 0 ? (
        <div className="panel empty"><h3>Aún no hay resultados publicados</h3><p className="muted">Los escrutinios estarán disponibles cuando se cierre una elección.</p></div>
      ) : (
        <div className="list">
          {items.map((item) => (
            <Link className="panel election" key={item.eleccionId}
              to={admin ? `/admin/resultados/${item.eleccionId}` : `/resultados/${item.eleccionId}`}>
              <div><span className="status">{item.estado}</span><h3>{item.titulo}</h3>
                <small>{item.publicadoEn ? `Publicado: ${fmt(item.publicadoEn)}` : `Generado: ${fmt(item.generadoEn)}`}</small></div>
              <span className="arrow">↗</span>
            </Link>
          ))}
        </div>
      )}
    </Shell>
  );
}

export function ResultDetail({ admin = false }) {
  const { id } = useParams();
  const { api, request } = useAuth();
  const [election, setElection] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (admin) setElection(await api(`/elecciones/${id}`));
      try {
        setResult(await api(`/resultados/elecciones/${id}`));
      } catch (cause) {
        if (!admin || cause.status !== 404) throw cause;
        setResult(null);
      }
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }, [admin, api, id]);

  useEffect(() => { load(); }, [load]);

  async function generate() {
    setBusy(true);
    setError('');
    try {
      await api(`/resultados/elecciones/${id}/escrutinio`, { method: 'POST', body: '{}' });
      await load();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    setError('');
    try {
      await api(`/resultados/elecciones/${id}/publicar`, { method: 'POST', body: '{}' });
      await load();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    setBusy(true);
    setError('');
    try {
      const blob = await request(`/resultados/elecciones/${id}/exportar`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `escrutinio-${id}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Shell><p role="status">Cargando escrutinio…</p></Shell>;
  const closed = election?.estado === 'CERRADA';
  return (
    <Shell>
      <section className="narrow">
        <Link className="link" to={admin ? '/admin/elecciones' : '/resultados'}>← Volver</Link>
        {error && <p className="error" role="alert">{error}</p>}
        {admin && !result && election && closed && (
          <div className="panel empty"><h1>{election.titulo}</h1><p>No se ha generado el escrutinio.</p>
            <button className="primary" disabled={busy} onClick={generate}>{busy ? 'Generando…' : 'Generar escrutinio'}</button>
          </div>
        )}
        {admin && !result && election && !closed && (
          <div className="panel empty"><h1>{election.titulo}</h1><p>El escrutinio estará disponible cuando la elección esté cerrada.</p></div>
        )}
        {result && (
          <>
            <span className="eyebrow">ESCRUTINIO OFICIAL</span>
            <span className={`status ${String(result.estado || '').toLowerCase()}`}>{result.estado}</span>
            <h1>{result.titulo}</h1>
            <div className="stats">
              <div className="panel"><small>Votos emitidos</small><b>{result.totalVotos}</b></div>
              <div className="panel"><small>Personas habilitadas</small><b>{result.totalHabilitados}</b></div>
              <div className="panel"><small>Participación</small><b>{result.participacion}%</b></div>
            </div>
            <div className="panel">
              <h2>Resultados por candidatura</h2>
              {result.candidaturas.map((candidate) => (
                <div className="result-row" key={candidate.candidaturaId}>
                  <div><b>{candidate.nombre}{candidate.ganadora ? ' · Ganadora' : ''}</b><span>{candidate.votos} votos · {candidate.porcentaje}%</span></div>
                  <div className="bar"><span style={{ width: `${Math.min(100, Math.max(0, candidate.porcentaje))}%` }} /></div>
                </div>
              ))}
              <div className="result-row">
                <div><b>Votos en blanco</b><span>{result.votosEnBlanco} votos{result.totalVotos ? ` · ${(result.votosEnBlanco * 100 / result.totalVotos).toFixed(2)}%` : ''}</span></div>
                <div className="bar"><span style={{ width: `${result.totalVotos ? Math.min(100, result.votosEnBlanco * 100 / result.totalVotos) : 0}%` }} /></div>
              </div>
              {result.empate && <p className="role-pill">Resultado empatado</p>}
              {!result.totalVotos && <p className="muted">No se registraron votos en esta elección.</p>}
            </div>
            {admin && (
              <>
                <section className="panel section-panel">
                  <h2>Participación por facultad y carrera</h2>
                  {(result.participacionPorGrupo || []).length === 0 ? <p className="muted">No hay grupos habilitados para mostrar.</p> : (
                    <div className="table-wrap"><table><thead><tr><th>Facultad</th><th>Carrera</th><th>Votaron</th><th>Habilitados</th><th>Participación</th></tr></thead>
                      <tbody>{result.participacionPorGrupo.map((group) => (
                        <tr key={group.id}><td>{group.facultad}</td><td>{group.carrera}</td>
                          <td>{group.votaron}</td><td>{group.habilitados}</td>
                          <td>{group.habilitados ? (group.votaron * 100 / group.habilitados).toFixed(2) : 0}%</td></tr>
                      ))}</tbody>
                    </table></div>
                  )}
                </section>
                <div className="action-row">
                  {result.estado !== 'PUBLICADO' && <button className="primary" disabled={busy} onClick={publish}>Publicar resultados</button>}
                  <button className="secondary" disabled={busy} onClick={exportCsv}>Exportar CSV</button>
                </div>
              </>
            )}
          </>
        )}
      </section>
    </Shell>
  );
}
