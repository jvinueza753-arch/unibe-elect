import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { confirmAction, Shell, fmt, toLocalInput, useAuth } from './common';

export function ElectionList() {
  const { api, request, user } = useAuth();
  const admin = user.rol === 'ADMINISTRADOR';
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        if (admin) {
          const query = new URLSearchParams({ pagina: String(page), limite: '20' });
          if (status) query.set('estado', status);
          const response = await request(`/elecciones?${query}`);
          if (!active) return;
          setItems(response?.data || []);
          setPages(response?.meta?.totalPaginas || 1);
        } else {
          const data = await api('/elecciones/estudiante');
          if (!active) return;
          setItems((data || []).filter((election) => election.estado !== 'CERRADA'));
        }
      } catch (cause) {
        if (active) setError(cause.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [admin, api, page, request, status]);

  return (
    <Shell>
      <div className="section-head">
        <div><span className="eyebrow">VOTACIONES</span><h1>{admin ? 'Gestión de elecciones' : 'Elecciones disponibles'}</h1></div>
        {admin && <Link className="primary button-link" to="/admin/elecciones/nueva">+ Crear elección</Link>}
      </div>
      {admin && (
        <label className="filter">Filtrar por estado
          <select value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}>
            <option value="">Todos</option>
            <option value="BORRADOR">Borrador</option><option value="PROGRAMADA">Programada</option>
            <option value="ABIERTA">Abierta</option><option value="CERRADA">Cerrada</option>
            <option value="CANCELADA">Cancelada</option>
          </select>
        </label>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {loading ? <p role="status">Cargando elecciones…</p> : items.length === 0 ? (
        <div className="panel empty"><h3>No hay elecciones para mostrar</h3><p className="muted">Cuando haya elecciones aparecerán aquí.</p></div>
      ) : (
        <div className="list">
          {items.map((election) => (
            <article className="panel election" key={election.id}>
              <div>
                <span className={`status ${String(election.estado || '').toLowerCase()}`}>{election.estado}</span>
                <h3>{election.titulo}</h3>
                <p>{election.descripcion || 'Elección universitaria de UNIBE'}</p>
                <small>Apertura: {fmt(election.fechaApertura)} · Cierre: {fmt(election.fechaCierre)}</small>
              </div>
              {admin ? (
                <div className="action-row">
                  <Link className="secondary button-link" to={`/admin/elecciones/${election.id}`}>Gestionar</Link>
                  {election.estado === 'CERRADA' && <Link className="primary button-link" to={`/admin/resultados/${election.id}`}>Escrutinio →</Link>}
                </div>
              ) : election.yaVoto ? (
                <span className="success">Voto registrado</span>
              ) : election.estado === 'ABIERTA' ? (
                <Link className="primary button-link" to={`/elecciones/${election.id}/votar`}>Votar →</Link>
              ) : (
                <span className="muted">La votación aún no comienza</span>
              )}
            </article>
          ))}
        </div>
      )}
      {admin && pages > 1 && (
        <div className="pagination">
          <button className="secondary" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Anterior</button>
          <span>Página {page} de {pages}</span>
          <button className="secondary" disabled={page >= pages || loading} onClick={() => setPage(page + 1)}>Siguiente</button>
        </div>
      )}
    </Shell>
  );
}

export function Vote() {
  const { id } = useParams();
  const { api } = useAuth();
  const [election, setElection] = useState(null);
  const [selected, setSelected] = useState('BLANCO');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [receipt, setReceipt] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const detail = await api(`/elecciones/${id}`);
        if (!active) return;
        setElection(detail);
        if (detail.estado !== 'ABIERTA') setMessage('Esta elección no está abierta para recibir votos.');
        const participation = await api(`/votacion/elecciones/${id}/mi-participacion`);
        if (active && participation?.haVotado) setMessage('Ya registraste tu voto en esta elección.');
      } catch (cause) {
        if (active) setError(cause.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [api, id]);

  async function submit() {
    if (!(await confirmAction('¿Confirmas tu voto?', 'Esta acción no se puede deshacer.'))) return;
    setBusy(true);
    setError('');
    try {
      const result = await api(`/votacion/elecciones/${id}/votos`, {
        method: 'POST',
        body: JSON.stringify({ candidaturaId: selected === 'BLANCO' ? null : selected }),
      });
      setReceipt(result.comprobante);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Shell><p role="status">Cargando papeleta…</p></Shell>;
  if (receipt) {
    return (
      <Shell>
        <div className="panel receipt">
          <span className="success-icon">✓</span><span className="eyebrow">VOTO REGISTRADO</span>
          <h1>Gracias por participar.</h1>
          <p>Tu voto fue registrado de forma anónima. Este comprobante confirma únicamente tu participación.</p>
          <div className="receipt-code">{receipt}</div>
          <button className="secondary" onClick={() => navigator.clipboard?.writeText(receipt)}>Copiar comprobante</button>
          <p><Link className="link" to="/elecciones">Volver a elecciones</Link></p>
        </div>
      </Shell>
    );
  }
  return (
    <Shell>
      <Link className="link" to="/elecciones">← Volver a elecciones</Link>
      {error && <p className="error" role="alert">{error}</p>}
      {message ? <div className="panel empty"><h2>{message}</h2></div> : election && (
        <section className="narrow">
          <span className="eyebrow">PAPELETA ELECTRÓNICA</span><h1>{election.titulo}</h1>
          <p className="muted">Selecciona una candidatura o vota en blanco. Tu selección es anónima.</p>
          <div className="ballot">
            {(election.candidaturas || []).map((candidate) => (
              <label className={`candidate ${selected === candidate.id ? 'selected' : ''}`} key={candidate.id}>
                <input type="radio" name="candidatura" checked={selected === candidate.id} onChange={() => setSelected(candidate.id)} />
                {candidate.fotoUrl && <img className="candidate-photo" src={candidate.fotoUrl} alt={`Foto de ${candidate.nombre}`} />}
                <span><b>{candidate.nombre}</b><small>{candidate.descripcion || 'Candidatura'}</small></span>
              </label>
            ))}
            <label className={`candidate ${selected === 'BLANCO' ? 'selected' : ''}`}>
              <input type="radio" name="candidatura" checked={selected === 'BLANCO'} onChange={() => setSelected('BLANCO')} />
              <span><b>Voto en blanco</b><small>No apoyar a ninguna candidatura.</small></span>
            </label>
          </div>
          <button className="primary wide" disabled={busy} onClick={submit}>{busy ? 'Registrando…' : 'Confirmar mi voto →'}</button>
        </section>
      )}
    </Shell>
  );
}

export function NewElection() {
  const { api } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    titulo: '', descripcion: '', fechaApertura: toLocalInput(new Date()),
    fechaCierre: toLocalInput(new Date(Date.now() + 60 * 60 * 1000)),
    candidaturasRequeridas: 2, abrirAhora: true,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function update(event) {
    setForm({ ...form, [event.target.name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value });
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const election = await api('/elecciones', {
        method: 'POST',
        body: JSON.stringify({
          titulo: form.titulo,
          descripcion: form.descripcion,
          fechaApertura: form.abrirAhora ? new Date().toISOString() : new Date(form.fechaApertura).toISOString(),
          fechaCierre: new Date(form.fechaCierre).toISOString(),
          candidaturasRequeridas: Number(form.candidaturasRequeridas),
          facultadesPermitidas: [],
          carrerasPermitidas: [],
        }),
      });
      navigate(`/admin/elecciones/${election.id}`);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <section className="narrow">
        <Link className="link" to="/admin/elecciones">← Volver a elecciones</Link>
        <h1>Nueva elección</h1>
        <form className="panel form-grid" onSubmit={submit}>
          <label className="full">Título<input name="titulo" value={form.titulo} onChange={update} required /></label>
          <label className="full">Descripción<textarea name="descripcion" value={form.descripcion} onChange={update} /></label>
          <label className="full">Candidaturas requeridas
            <input name="candidaturasRequeridas" type="number" min="2" max="100"
              value={form.candidaturasRequeridas} onChange={update} required />
            <small className="muted">La elección no se podrá publicar hasta registrar esta cantidad.</small>
          </label>
          <label className="check full"><input type="checkbox" name="abrirAhora" checked={form.abrirAhora} onChange={update} /> Abrir ahora</label>
          {!form.abrirAhora && <label className="full">Fecha y hora de apertura<input type="datetime-local" name="fechaApertura" value={form.fechaApertura} onChange={update} required /></label>}
          <label className="full">Fecha y hora de cierre<input type="datetime-local" name="fechaCierre" value={form.fechaCierre} onChange={update} required /></label>
          {error && <p className="error full" role="alert">{error}</p>}
          <button className="primary full" disabled={busy}>{busy ? 'Guardando…' : 'Crear borrador y continuar'}</button>
        </form>
      </section>
    </Shell>
  );
}

export function ManageElection() {
  const { id } = useParams();
  const { api } = useAuth();
  const navigate = useNavigate();
  const [election, setElection] = useState(null);
  const [form, setForm] = useState(null);
  const [candidate, setCandidate] = useState({ nombre: '', descripcion: '', fotoUrl: '' });
  const [editCandidate, setEditCandidate] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api(`/elecciones/${id}`);
      setElection(data);
      setForm({
        titulo: data.titulo,
        descripcion: data.descripcion || '',
        fechaApertura: toLocalInput(data.fechaApertura),
        fechaCierre: toLocalInput(data.fechaCierre),
        candidaturasRequeridas: data.candidaturasRequeridas,
      });
      setError('');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }, [api, id]);

  useEffect(() => { load(); }, [load]);

  async function saveElection(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/elecciones/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          titulo: form.titulo,
          descripcion: form.descripcion,
          fechaApertura: new Date(form.fechaApertura).toISOString(),
          fechaCierre: new Date(form.fechaCierre).toISOString(),
          candidaturasRequeridas: Number(form.candidaturasRequeridas),
        }),
      });
      toast.success('Se guardaron los datos de la elección.');
      await load();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  async function addCandidate(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/elecciones/${id}/candidaturas`, {
        method: 'POST',
        body: JSON.stringify({
          nombre: candidate.nombre,
          descripcion: candidate.descripcion,
          ...(candidate.fotoUrl ? { fotoUrl: candidate.fotoUrl } : {}),
        }),
      });
      setCandidate({ nombre: '', descripcion: '', fotoUrl: '' });
      toast.success('Se agregó la candidatura.');
      await load();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveCandidate(item, event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await api(`/elecciones/${id}/candidaturas/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          nombre: data.get('nombre'),
          descripcion: data.get('descripcion'),
          fotoUrl: data.get('fotoUrl') || null,
        }),
      });
      setEditCandidate('');
      await load();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  async function perform(path, method, confirmation, returnToList = false) {
    if (!(await confirmAction('Confirma esta acción', confirmation))) return;
    setBusy(true);
    setError('');
    try {
      await api(path, { method, body: method === 'POST' ? '{}' : undefined });
      if (returnToList) navigate('/admin/elecciones');
      else await load();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeCandidate(candidateId) {
    if (!(await confirmAction('¿Eliminar esta candidatura?', 'Esta acción no se puede deshacer.'))) return;
    setBusy(true);
    try {
      await api(`/elecciones/${id}/candidaturas/${candidateId}`, { method: 'DELETE' });
      toast.success('Se eliminó la candidatura.');
      await load();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Shell><p role="status">Cargando elección…</p></Shell>;
  if (!election) return <Shell><p className="error" role="alert">{error || 'No se encontró la elección.'}</p></Shell>;
  const draft = election.estado === 'BORRADOR';
  const canCancel = ['PROGRAMADA', 'ABIERTA'].includes(election.estado);

  return (
    <Shell>
      <section className="narrow">
        <Link className="link" to="/admin/elecciones">← Volver a elecciones</Link>
        <div className="section-head">
          <div><span className={`status ${election.estado.toLowerCase()}`}>{election.estado}</span><h1>{election.titulo}</h1></div>
          {election.estado === 'CERRADA' && <Link className="primary button-link" to={`/admin/resultados/${id}`}>Ver escrutinio →</Link>}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {draft ? (
          <form className="panel form-grid" onSubmit={saveElection}>
            <h2 className="full">Datos de la elección</h2>
            <label className="full">Título<input value={form.titulo} onChange={(event) => setForm({ ...form, titulo: event.target.value })} required /></label>
            <label className="full">Descripción<textarea value={form.descripcion} onChange={(event) => setForm({ ...form, descripcion: event.target.value })} /></label>
            <label className="full">Candidaturas requeridas
              <input type="number" min="2" max="100" value={form.candidaturasRequeridas}
                onChange={(event) => setForm({ ...form, candidaturasRequeridas: event.target.value })} required />
              <small className="muted">Indica cuántas candidaturas deben registrarse antes de publicar.</small>
            </label>
            <label>Fecha y hora de apertura<input type="datetime-local" value={form.fechaApertura} onChange={(event) => setForm({ ...form, fechaApertura: event.target.value })} required /></label>
            <label>Fecha y hora de cierre<input type="datetime-local" value={form.fechaCierre} onChange={(event) => setForm({ ...form, fechaCierre: event.target.value })} required /></label>
            <button className="secondary full" disabled={busy}>Guardar cambios</button>
          </form>
        ) : (
          <div className="panel">
            <p>{election.descripcion || 'Sin descripción.'}</p>
            <p className="muted">Apertura: {fmt(election.fechaApertura)}<br />Cierre: {fmt(election.fechaCierre)}</p>
          </div>
        )}
        <section className="panel section-panel">
          <h2>Candidaturas</h2>
          <p className="muted">
            Registradas: {election.candidaturas.length} de {election.candidaturasRequeridas}.
            {draft && election.candidaturas.length < election.candidaturasRequeridas
              ? ` Faltan ${election.candidaturasRequeridas - election.candidaturas.length} para publicar.`
              : ''}
          </p>
          {(election.candidaturas || []).length === 0 && <p className="muted">Aún no hay candidaturas.</p>}
          <div className="list">
            {(election.candidaturas || []).map((item) => (
              <article className="candidate-manage" key={item.id}>
                {draft && editCandidate === item.id ? (
                  <form className="form-grid" onSubmit={(event) => saveCandidate(item, event)}>
                    <label>Nombre<input name="nombre" defaultValue={item.nombre} required /></label>
                    <label>Descripción<input name="descripcion" defaultValue={item.descripcion || ''} /></label>
                    <label className="full">URL de foto<input name="fotoUrl" type="url" defaultValue={item.fotoUrl || ''} /></label>
                    <button className="secondary" disabled={busy}>Guardar</button>
                    <button type="button" className="ghost" onClick={() => setEditCandidate('')}>Cancelar</button>
                  </form>
                ) : (
                  <>
                    {item.fotoUrl && <img className="candidate-photo" src={item.fotoUrl} alt={`Foto de ${item.nombre}`} />}
                    <div><b>{item.nombre}</b><p className="muted">{item.descripcion || 'Sin descripción.'}</p></div>
                    {draft && <div className="action-row">
                      <button className="secondary" onClick={() => setEditCandidate(item.id)}>Editar</button>
                      <button className="danger" disabled={busy} onClick={() => removeCandidate(item.id)}>Eliminar</button>
                    </div>}
                  </>
                )}
              </article>
            ))}
          </div>
          {draft && (
            <form className="form-grid candidate-add" onSubmit={addCandidate}>
              <h3 className="full">Agregar candidatura</h3>
              <label>Nombre<input value={candidate.nombre} onChange={(event) => setCandidate({ ...candidate, nombre: event.target.value })} required /></label>
              <label>Descripción<input value={candidate.descripcion} onChange={(event) => setCandidate({ ...candidate, descripcion: event.target.value })} /></label>
              <label className="full">URL de foto (opcional)<input type="url" value={candidate.fotoUrl} onChange={(event) => setCandidate({ ...candidate, fotoUrl: event.target.value })} /></label>
              <button className="secondary full" disabled={busy}>Agregar candidatura</button>
            </form>
          )}
        </section>
        <div className="action-row">
          {draft && <button className="primary" disabled={busy || election.candidaturas.length < election.candidaturasRequeridas}
            title={election.candidaturas.length < election.candidaturasRequeridas
              ? `Faltan ${election.candidaturasRequeridas - election.candidaturas.length} candidaturas para publicar.`
              : ''}
            onClick={() => perform(`/elecciones/${id}/publicar`, 'POST', '¿Publicar esta elección?')}>Publicar</button>}
          {election.estado === 'ABIERTA' && <button className="primary" disabled={busy}
            onClick={() => perform(`/elecciones/${id}/cerrar`, 'POST', '¿Cerrar la elección? Ya no se aceptarán votos.')}>Cerrar elección</button>}
          {canCancel && <button className="danger" disabled={busy}
            onClick={() => perform(`/elecciones/${id}/cancelar`, 'POST', '¿Cancelar esta elección?')}>Cancelar elección</button>}
          {draft && <button className="danger" disabled={busy}
            onClick={() => perform(`/elecciones/${id}`, 'DELETE', '¿Eliminar este borrador? Esta acción no se puede deshacer.', true)}>Eliminar borrador</button>}
        </div>
      </section>
    </Shell>
  );
}
