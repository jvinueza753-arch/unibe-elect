import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import { confirmAction, Shell, fmt, toLocalInput, useAuth } from './common';
import { Wizard } from './wizard';

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
          const data = await api('/elecciones/disponibles');
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
  const [selected, setSelected] = useState(null);
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
    if (!(await confirmAction('¿Confirmas tu selección?', 'El voto se registrará de forma anónima y no se podrá cambiar.'))) return;
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

  const referendum = election?.tipo === 'REFERENDUM';
  const selectedCandidate = election?.candidaturas?.find((candidate) => candidate.id === selected);
  const steps = election ? [
    {
      id: 'introduccion',
      titulo: 'Antes de votar',
      descripcion: 'Revisa la elección antes de iniciar tu papeleta.',
      contenido: <div className="panel ballot-intro">
        <p><b>{election.titulo}</b></p>
        <p>{election.descripcion || 'Elección universitaria de UNIBE.'}</p>
        {referendum && <p className="ballot-question"><b>Pregunta:</b> {election.pregunta}</p>}
        <p className="muted">Tu identidad no se vincula con la opción que selecciones.</p>
      </div>,
    },
    {
      id: 'seleccion',
      titulo: 'Selecciona tu opción',
      descripcion: referendum ? 'Elige Sí, No o Abstención.' : 'Elige una candidatura o registra un voto en blanco.',
      contenido: <div className="ballot">
        {(election.candidaturas || []).map((candidate) => (
          <label className={`candidate ${selected === candidate.id ? 'selected' : ''}`} key={candidate.id}>
            <input type="radio" name="candidatura" checked={selected === candidate.id}
              onChange={() => setSelected(candidate.id)} />
            {candidate.fotoUrl
              ? <img className="candidate-photo" src={candidate.fotoUrl} alt={`Foto de ${candidate.nombre}`} />
              : <span className="candidate-photo-placeholder" aria-label="Sin imagen">Sin foto</span>}
            <span>
              <b>{candidate.nombre}</b>
              {candidate.lema && <small>{candidate.lema}</small>}
              {candidate.descripcion && <small>{candidate.descripcion}</small>}
              {candidate.propuestas?.length > 0 && <small>{candidate.propuestas.join(' · ')}</small>}
              {candidate.integrantes?.length > 0 && (
                <small>{candidate.integrantes.map((member) => `${member.cargo}: ${member.nombre}`).join(' · ')}</small>
              )}
            </span>
          </label>
        ))}
        {!referendum && (
          <label className={`candidate ${selected === 'BLANCO' ? 'selected' : ''}`}>
            <input type="radio" name="candidatura" checked={selected === 'BLANCO'}
              onChange={() => setSelected('BLANCO')} />
            <span><b>Voto en blanco</b><small>No apoyar a ninguna candidatura.</small></span>
          </label>
        )}
      </div>,
      validar: () => selected !== null || 'Selecciona una opción antes de continuar.',
    },
    {
      id: 'revision',
      titulo: 'Revisa tu selección',
      descripcion: 'Verifica la opción. No se mostrarán resultados asociados a tu identidad.',
      contenido: <div className="panel ballot-review">
        {selected === 'BLANCO'
          ? <p><b>Voto en blanco</b></p>
          : selectedCandidate
            ? <p><b>{selectedCandidate.nombre}</b>{selectedCandidate.lema ? ` · ${selectedCandidate.lema}` : ''}</p>
            : <p className="muted">Aún no has seleccionado una opción.</p>}
        <p className="muted">Al continuar, tu voto se registrará y no podrás modificarlo.</p>
      </div>,
      validar: () => selected !== null || 'Selecciona una opción antes de confirmar.',
    },
  ] : [];

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
          <Wizard steps={steps} onFinish={submit} busy={busy} error={error}
            finishLabel="Emitir voto" />
        </section>
      )}
    </Shell>
  );
}

export function NewElection() {
  const { api } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    titulo: '',
    descripcion: '',
    tipo: 'CANDIDATURAS',
    pregunta: '',
    fechaApertura: toLocalInput(new Date()),
    fechaCierre: toLocalInput(new Date(Date.now() + 60 * 60 * 1000)),
    candidaturasRequeridas: 2,
    abrirAhora: true,
    facultadesPermitidas: [],
    carrerasPermitidas: [],
    cargosRequeridos: ['PRESIDENTE', 'VICEPRESIDENTE'],
  });
  const [catalogos, setCatalogos] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api('/elecciones/catalogos')
      .then((data) => { if (active) setCatalogos(data); })
      .catch((cause) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [api]);

  function update(event) {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
  }

  function toggleList(field, value) {
    setForm((current) => ({
      ...current,
      [field]: current[field].includes(value)
        ? current[field].filter((item) => item !== value)
        : [...current[field], value],
    }));
  }

  async function submit() {
    setBusy(true);
    setError('');
    try {
      const fechaApertura = form.abrirAhora ? new Date() : new Date(form.fechaApertura);
      const fechaCierre = new Date(form.fechaCierre);
      const election = await api('/elecciones', {
        method: 'POST',
        body: JSON.stringify({
          titulo: form.titulo.trim(),
          descripcion: form.descripcion.trim() || null,
          tipo: form.tipo,
          ...(form.tipo === 'REFERENDUM' ? { pregunta: form.pregunta.trim() } : {}),
          fechaApertura: fechaApertura.toISOString(),
          fechaCierre: fechaCierre.toISOString(),
          candidaturasRequeridas: form.tipo === 'REFERENDUM' ? 2 : Number(form.candidaturasRequeridas),
          facultadesPermitidas: form.facultadesPermitidas,
          carrerasPermitidas: form.carrerasPermitidas,
          ordenAleatorio: true,
          ...(form.tipo === 'PLANCHAS' ? { cargosRequeridos: form.cargosRequeridos } : {}),
        }),
      });
      navigate(`/admin/elecciones/${election.id}`);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  const steps = [
    {
      id: 'datos',
      titulo: 'Datos generales',
      descripcion: 'Define el nombre y la descripción que verán los votantes.',
      contenido: <div className="wz-fields">
        <label className="full">Título
          <input name="titulo" value={form.titulo} onChange={update} maxLength="200" required />
        </label>
        <label className="full">Descripción
          <textarea name="descripcion" value={form.descripcion} onChange={update} maxLength="5000" />
        </label>
      </div>,
      validar: () => form.titulo.trim() ? true : 'Escribe un título para la elección.',
    },
    {
      id: 'tipo',
      titulo: 'Tipo de elección',
      descripcion: 'El tipo determina cómo se construye la papeleta.',
      contenido: <div className="wz-fields">
        <label className="full">Modalidad
          <select name="tipo" value={form.tipo} onChange={update}>
            <option value="CANDIDATURAS">Candidaturas</option>
            <option value="REFERENDUM">Referéndum (Sí / No / Abstención)</option>
            <option value="PLANCHAS">Planchas con integrantes por cargo</option>
          </select>
        </label>
        {form.tipo === 'REFERENDUM' && <label className="full">Pregunta del referéndum
          <textarea name="pregunta" value={form.pregunta} onChange={update} minLength="5" maxLength="500" required />
        </label>}
      </div>,
      validar: () => form.tipo !== 'REFERENDUM' || form.pregunta.trim().length >= 5
        ? true
        : 'La pregunta debe tener al menos 5 caracteres.',
    },
    {
      id: 'alcance',
      titulo: 'Población habilitada',
      descripcion: 'Si no seleccionas filtros, podrán participar todas las facultades y carreras.',
      contenido: <div className="wz-fields">
        <fieldset className="full filter-options">
          <legend>Facultades</legend>
          {(catalogos?.facultades || []).map((faculty) => (
            <label className="check" key={faculty}>
              <input type="checkbox" checked={form.facultadesPermitidas.includes(faculty)}
                onChange={() => toggleList('facultadesPermitidas', faculty)} />
              {faculty}
            </label>
          ))}
        </fieldset>
        <fieldset className="full filter-options">
          <legend>Carreras</legend>
          {(catalogos?.carreras || []).map((career) => (
            <label className="check" key={career}>
              <input type="checkbox" checked={form.carrerasPermitidas.includes(career)}
                onChange={() => toggleList('carrerasPermitidas', career)} />
              {career}
            </label>
          ))}
        </fieldset>
      </div>,
    },
    {
      id: 'calendario',
      titulo: 'Calendario',
      descripcion: 'La fecha de cierre debe ser posterior a la apertura.',
      contenido: <div className="wz-fields">
        <label className="check full"><input type="checkbox" name="abrirAhora" checked={form.abrirAhora} onChange={update} />
          Abrir al publicar
        </label>
        {!form.abrirAhora && <label>Fecha y hora de apertura
          <input type="datetime-local" name="fechaApertura" value={form.fechaApertura} onChange={update} required />
        </label>}
        <label className="full">Fecha y hora de cierre
          <input type="datetime-local" name="fechaCierre" value={form.fechaCierre} onChange={update} required />
        </label>
      </div>,
      validar: () => {
        const opening = form.abrirAhora ? Date.now() : new Date(form.fechaApertura).getTime();
        const closing = new Date(form.fechaCierre).getTime();
        return Number.isFinite(opening) && Number.isFinite(closing) && closing > opening
          ? true
          : 'El cierre debe ser posterior a la apertura.';
      },
    },
    {
      id: 'papeleta',
      titulo: 'Configuración de papeleta',
      descripcion: 'Completa estos datos antes de agregar las candidaturas al borrador.',
      contenido: <div className="wz-fields">
        {form.tipo === 'REFERENDUM' ? (
          <p className="full muted">Las opciones Sí, No y Abstención se crean automáticamente y no se pueden editar.</p>
        ) : (
          <label className="full">Candidaturas requeridas
            <input name="candidaturasRequeridas" type="number" min="2" max="100"
              value={form.candidaturasRequeridas} onChange={update} required />
            <small className="muted">La publicación se habilita cuando se registren al menos esta cantidad.</small>
          </label>
        )}
        {form.tipo === 'PLANCHAS' && <fieldset className="full filter-options">
          <legend>Cargos requeridos en cada plancha</legend>
          {(catalogos?.cargos || []).map((cargo) => (
            <label className="check" key={cargo}>
              <input type="checkbox" checked={form.cargosRequeridos.includes(cargo)}
                onChange={() => toggleList('cargosRequeridos', cargo)} />
              {cargo}
            </label>
          ))}
        </fieldset>}
      </div>,
      validar: () => {
        const required = Number(form.candidaturasRequeridas);
        if (form.tipo !== 'REFERENDUM'
          && (!Number.isInteger(required)
            || required < 2
            || required > 100)) {
          return 'Indica entre 2 y 100 candidaturas requeridas.';
        }
        if (form.tipo === 'PLANCHAS' && !form.cargosRequeridos.length) {
          return 'Selecciona al menos un cargo requerido.';
        }
        return true;
      },
    },
    {
      id: 'revision',
      titulo: 'Revisar y crear',
      descripcion: 'Se creará un borrador; podrás completar las candidaturas antes de publicarlo.',
      contenido: <dl className="wz-review">
        <div><dt>Título</dt><dd>{form.titulo || '—'}</dd></div>
        <div><dt>Tipo</dt><dd>{form.tipo}</dd></div>
        {form.tipo === 'REFERENDUM' && <div><dt>Pregunta</dt><dd>{form.pregunta || '—'}</dd></div>}
        <div><dt>Facultades</dt><dd>{form.facultadesPermitidas.length ? form.facultadesPermitidas.join(', ') : 'Todas'}</dd></div>
        <div><dt>Carreras</dt><dd>{form.carrerasPermitidas.length ? form.carrerasPermitidas.join(', ') : 'Todas'}</dd></div>
        <div><dt>Calendario</dt><dd>{form.abrirAhora ? 'Abrir al publicar' : form.fechaApertura} – {form.fechaCierre}</dd></div>
        {form.tipo !== 'REFERENDUM' && <div><dt>Candidaturas</dt><dd>{form.candidaturasRequeridas} requeridas</dd></div>}
        {form.tipo === 'PLANCHAS' && <div><dt>Cargos</dt><dd>{form.cargosRequeridos.join(', ')}</dd></div>}
      </dl>,
      validar: () => form.titulo.trim() && (form.tipo !== 'REFERENDUM' || form.pregunta.trim().length >= 5)
        ? true
        : 'Completa los datos obligatorios antes de crear.',
    },
  ];

  return (
    <Shell>
      <section className="narrow">
        <Link className="link" to="/admin/elecciones">← Volver a elecciones</Link>
        <h1>Nueva elección</h1>
        {!catalogos ? (error
          ? <div><p className="error" role="alert">{error}</p><button className="secondary" onClick={() => window.location.reload()}>Volver a intentar</button></div>
          : <p role="status">Cargando opciones…</p>) : (
          <>
            {error && <p className="error" role="alert">{error}</p>}
            <Wizard steps={steps} onFinish={submit} busy={busy} error={error}
              finishLabel="Crear borrador" />
          </>
        )}
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
  const [candidate, setCandidate] = useState({
    nombre: '',
    descripcion: '',
    lema: '',
    propuestas: '',
    integrantes: {},
  });
  const [catalogos, setCatalogos] = useState(null);
  const [editCandidate, setEditCandidate] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, electionCatalogs] = await Promise.all([
        api(`/elecciones/${id}`),
        api('/elecciones/catalogos'),
      ]);
      setElection(data);
      setCatalogos(electionCatalogs);
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
      const integrantes = election.tipo === 'PLANCHAS'
        ? (catalogos?.cargos || []).flatMap((cargo) => {
          const nombre = String(candidate.integrantes[cargo] || '').trim();
          return nombre ? [{ cargo, nombre }] : [];
        })
        : [];
      await api(`/elecciones/${id}/candidaturas`, {
        method: 'POST',
        body: JSON.stringify({
          nombre: candidate.nombre.trim(),
          descripcion: candidate.descripcion.trim() || null,
          lema: candidate.lema.trim() || null,
          propuestas: candidate.propuestas.split('\n').map((item) => item.trim()).filter(Boolean),
          ...(election.tipo === 'PLANCHAS' ? { integrantes } : {}),
        }),
      });
      setCandidate({ nombre: '', descripcion: '', lema: '', propuestas: '', integrantes: {} });
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
      const integrantes = election.tipo === 'PLANCHAS'
        ? (catalogos?.cargos || []).flatMap((cargo) => {
          const nombre = String(data.get(`integrante-${cargo}`) || '').trim();
          return nombre ? [{ cargo, nombre }] : [];
        })
        : [];
      await api(`/elecciones/${id}/candidaturas/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          nombre: String(data.get('nombre') || '').trim(),
          descripcion: String(data.get('descripcion') || '').trim() || null,
          lema: String(data.get('lema') || '').trim() || null,
          propuestas: String(data.get('propuestas') || '').split('\n').map((value) => value.trim()).filter(Boolean),
          ...(election.tipo === 'PLANCHAS' ? { integrantes } : {}),
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

  async function uploadPhoto(item, event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setError('');
    if (file.size > 2 * 1024 * 1024) {
      setError('La imagen no puede superar 2 MB.');
      input.value = '';
      return;
    }
    setBusy(true);
    try {
      await api(`/elecciones/${id}/candidaturas/${item.id}/foto`, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      toast.success('Se guardó la imagen.');
      await load();
    } catch (cause) {
      setError(cause.message);
    } finally {
      input.value = '';
      setBusy(false);
    }
  }

  async function removePhoto(item) {
    setBusy(true);
    setError('');
    try {
      await api(`/elecciones/${id}/candidaturas/${item.id}/foto`, { method: 'DELETE' });
      toast.success('Se quitó la imagen.');
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

  async function closeElection() {
    const result = await Swal.fire({
      title: 'Cerrar elección',
      text: 'Esta acción es irreversible y dejará de aceptar votos de inmediato.',
      input: 'textarea',
      inputLabel: 'Motivo del cierre',
      inputPlaceholder: 'Describe el motivo (5 a 500 caracteres)',
      inputAttributes: { 'aria-label': 'Motivo del cierre' },
      inputValidator: (value) => {
        const length = String(value || '').trim().length;
        if (length < 5) return 'El motivo debe tener al menos 5 caracteres.';
        if (length > 500) return 'El motivo no puede superar 500 caracteres.';
        return undefined;
      },
      showCancelButton: true,
      confirmButtonText: 'Cerrar elección',
      cancelButtonText: 'Volver',
      reverseButtons: true,
      focusCancel: true,
      buttonsStyling: false,
      customClass: {
        popup: 'confirm-dialog',
        title: 'confirm-dialog-title',
        htmlContainer: 'confirm-dialog-text',
        actions: 'confirm-dialog-actions',
        confirmButton: 'danger',
        cancelButton: 'secondary',
      },
    });
    if (!result.isConfirmed) return;

    setBusy(true);
    setError('');
    try {
      await api(`/elecciones/${id}/cerrar`, {
        method: 'POST',
        body: JSON.stringify({ motivo: String(result.value).trim() }),
      });
      toast.success('La elección se cerró y dejó de aceptar votos.');
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
            {election.cierreAnticipado && (
              <p className="muted">
                Cierre anticipado por {election.cerradaPorCorreo} el {fmt(election.cerradaEn)}.
                {' '}Motivo: {election.motivoCierre} (estaba programada para {fmt(election.fechaCierre)}).
              </p>
            )}
          </div>
        )}
        <section className="panel section-panel">
          <h2>Candidaturas</h2>
          <p className="muted">
            {election.tipo === 'REFERENDUM'
              ? 'Las opciones del referéndum son fijas.'
              : <>Registradas: {election.candidaturas.length} de {election.candidaturasRequeridas}.
                {draft && election.candidaturas.length < election.candidaturasRequeridas
                  ? ` Faltan ${election.candidaturasRequeridas - election.candidaturas.length} para publicar.`
                  : ''}</>}
          </p>
          {election.tipo === 'REFERENDUM' && <p className="ballot-question"><b>Pregunta:</b> {election.pregunta}</p>}
          {(election.candidaturas || []).length === 0 && <p className="muted">Aún no hay candidaturas.</p>}
          <div className="list">
            {(election.candidaturas || []).map((item) => (
              <article className="candidate-manage" key={item.id}>
                {draft && editCandidate === item.id ? (
                  <form className="form-grid" onSubmit={(event) => saveCandidate(item, event)}>
                    <label>Nombre<input name="nombre" defaultValue={item.nombre} required /></label>
                    <label>Descripción<input name="descripcion" defaultValue={item.descripcion || ''} maxLength="2000" /></label>
                    <label className="full">Lema<input name="lema" defaultValue={item.lema || ''} maxLength="140" /></label>
                    <label className="full">Propuestas (una por línea)
                      <textarea name="propuestas" defaultValue={(item.propuestas || []).join('\n')} />
                    </label>
                    {election.tipo === 'PLANCHAS' && <fieldset className="full filter-options">
                      <legend>Integrantes por cargo</legend>
                      {(catalogos?.cargos || []).map((cargo) => (
                        <label key={cargo}>{cargo}{election.cargosRequeridos.includes(cargo) ? ' *' : ''}
                          <input name={`integrante-${cargo}`} defaultValue={
                            item.integrantes?.find((member) => member.cargo === cargo)?.nombre || ''
                          } />
                        </label>
                      ))}
                    </fieldset>}
                    <button className="secondary" disabled={busy}>Guardar</button>
                    <button type="button" className="ghost" onClick={() => setEditCandidate('')}>Cancelar</button>
                  </form>
                ) : (
                  <>
                    {item.fotoUrl
                      ? <img className="candidate-photo" src={item.fotoUrl} alt={`Foto de ${item.nombre}`} />
                      : <span className="candidate-photo-placeholder" aria-label="Sin imagen">Sin foto</span>}
                    <div>
                      <b>{item.nombre}</b>
                      {item.lema && <p className="muted">{item.lema}</p>}
                      <p className="muted">{item.descripcion || 'Sin descripción.'}</p>
                      {item.propuestas?.length > 0 && <p className="muted">Propuestas: {item.propuestas.join(' · ')}</p>}
                      {item.integrantes?.length > 0 && <p className="muted">
                        {item.integrantes.map((member) => `${member.cargo}: ${member.nombre}`).join(' · ')}
                      </p>}
                    </div>
                    {draft && <div className="action-row">
                      <button className="secondary" onClick={() => setEditCandidate(item.id)}>Editar</button>
                      <button className="danger" disabled={busy} onClick={() => removeCandidate(item.id)}>Eliminar</button>
                      <label className="secondary file-button">Subir foto
                        <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy}
                          onChange={(event) => uploadPhoto(item, event)} />
                      </label>
                      {item.fotoUrl && <button className="ghost" disabled={busy} onClick={() => removePhoto(item)}>Quitar foto</button>}
                    </div>}
                  </>
                )}
              </article>
            ))}
          </div>
          {draft && election.tipo !== 'REFERENDUM' && (
            <form className="form-grid candidate-add" onSubmit={addCandidate}>
              <h3 className="full">Agregar candidatura</h3>
              <label>Nombre<input value={candidate.nombre} onChange={(event) => setCandidate({ ...candidate, nombre: event.target.value })} required /></label>
              <label>Descripción<input value={candidate.descripcion} maxLength="2000"
                onChange={(event) => setCandidate({ ...candidate, descripcion: event.target.value })} /></label>
              <label className="full">Lema<input value={candidate.lema} maxLength="140"
                onChange={(event) => setCandidate({ ...candidate, lema: event.target.value })} /></label>
              <label className="full">Propuestas (una por línea, máximo 10)
                <textarea value={candidate.propuestas}
                  onChange={(event) => setCandidate({ ...candidate, propuestas: event.target.value })} />
              </label>
              {election.tipo === 'PLANCHAS' && <fieldset className="full filter-options">
                <legend>Integrantes por cargo (* requerido)</legend>
                {(catalogos?.cargos || []).map((cargo) => (
                  <label key={cargo}>{cargo}{election.cargosRequeridos.includes(cargo) ? ' *' : ''}
                    <input value={candidate.integrantes[cargo] || ''}
                      onChange={(event) => setCandidate({
                        ...candidate,
                        integrantes: { ...candidate.integrantes, [cargo]: event.target.value },
                      })} />
                  </label>
                ))}
              </fieldset>}
              <button className="secondary full" disabled={busy || election.candidaturas.length >= 100}>
                Agregar candidatura
              </button>
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
            onClick={closeElection}>Cerrar elección</button>}
          {canCancel && <button className="danger" disabled={busy}
            onClick={() => perform(`/elecciones/${id}/cancelar`, 'POST', '¿Cancelar esta elección?')}>Cancelar elección</button>}
          {draft && <button className="danger" disabled={busy}
            onClick={() => perform(`/elecciones/${id}`, 'DELETE', '¿Eliminar este borrador? Esta acción no se puede deshacer.', true)}>Eliminar borrador</button>}
        </div>
      </section>
    </Shell>
  );
}
