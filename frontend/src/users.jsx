import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Shell, useAuth } from './common';
import { AdminPasswordResetRequests } from './password-reset';

export function Users() {
  const { request, api, user } = useAuth();
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ pagina: 1, totalPaginas: 1, total: 0 });
  const [filters, setFilters] = useState({ busqueda: '', facultad: '', carrera: '', rol: '', estado: '' });
  const [query, setQuery] = useState(filters);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [importResult, setImportResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ pagina: String(page), limite: '20' });
    Object.entries(query).forEach(([key, value]) => { if (value) params.set(key, value); });
    try {
      const response = await request(`/usuarios?${params}`);
      setItems(response?.data || []);
      setMeta(response?.meta || { pagina: page, totalPaginas: 1, total: 0 });
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }, [page, query, request]);

  useEffect(() => { load(); }, [load]);

  async function updateUser(id, path, body) {
    setBusyId(id);
    setError('');
    try {
      await api(path, { method: 'PATCH', body: JSON.stringify(body) });
      toast.success('Se actualizaron los datos del usuario.');
      await load();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusyId('');
    }
  }

  async function importCsv(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = form.elements.csv.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('El archivo supera el límite de 5 MB.');
      return;
    }
    setError('');
    setImportResult(null);
    setBusyId('import');
    try {
      const csv = await file.text();
      const result = await api('/usuarios/importar', { method: 'POST', body: JSON.stringify({ csv }) });
      setImportResult(result);
      toast.success(`Importación finalizada: ${result.creados} creados, ${result.omitidos} omitidos.`);
      await load();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusyId('');
      form.reset();
    }
  }

  function downloadTemplate() {
    const csv = '\uFEFFnombres,apellidos,correo,codigoEstudiantil,facultad,carrera,contrasena\r\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla-estudiantes.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <Shell>
      <span className="eyebrow">ADMINISTRACIÓN</span><h1>Usuarios</h1>
      {error && <p className="error" role="alert">{error}</p>}
      <form className="panel form-grid filter-form" onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery({ ...filters }); }}>
        <label className="full">Búsqueda<input value={filters.busqueda} onChange={(event) => setFilters({ ...filters, busqueda: event.target.value })} placeholder="Nombre, correo o código" /></label>
        <label>Facultad<select value={filters.facultad} onChange={(event) => setFilters({ ...filters, facultad: event.target.value })}>
          <option value="">Todas</option><option>Ingeniería</option><option>Ciencias Empresariales</option><option>Derecho</option>
        </select></label>
        <label>Carrera<select value={filters.carrera} onChange={(event) => setFilters({ ...filters, carrera: event.target.value })}>
          <option value="">Todas</option><option>Software</option><option>Sistemas</option><option>Administración</option><option>Derecho</option>
        </select></label>
        <label>Rol<select value={filters.rol} onChange={(event) => setFilters({ ...filters, rol: event.target.value })}>
          <option value="">Todos</option><option value="ESTUDIANTE">Estudiante</option><option value="ADMINISTRADOR">Administrador</option>
        </select></label>
        <label>Estado<select value={filters.estado} onChange={(event) => setFilters({ ...filters, estado: event.target.value })}>
          <option value="">Todos</option><option value="ACTIVO">Activo</option><option value="INACTIVO">Inactivo</option>
        </select></label>
        <button className="primary full">Aplicar filtros</button>
      </form>
      <p className="muted">Usuarios encontrados: {meta.total || 0}</p>
      {loading ? <p role="status">Cargando usuarios…</p> : items.length === 0 ? (
        <div className="panel empty"><h3>No se encontraron usuarios</h3><p className="muted">Prueba con otros filtros.</p></div>
      ) : (
        <div className="panel table-wrap">
          <table><thead><tr><th>Nombre</th><th>Correo</th><th>Facultad / carrera</th><th>Rol</th><th>Estado</th></tr></thead>
            <tbody>{items.map((item) => (
              <tr key={item.id}>
                <td>{item.nombres} {item.apellidos}</td><td>{item.correo}</td><td>{item.facultad} / {item.carrera}</td>
                <td><select aria-label={`Rol de ${item.correo}`} value={item.rol} disabled={busyId === item.id || item.id === user.id}
                  onChange={(event) => updateUser(item.id, `/usuarios/${item.id}/rol`, { rol: event.target.value })}>
                  <option value="ESTUDIANTE">Estudiante</option><option value="ADMINISTRADOR">Administrador</option>
                </select></td>
                <td><select aria-label={`Estado de ${item.correo}`} value={item.estado} disabled={busyId === item.id}
                  onChange={(event) => updateUser(item.id, `/usuarios/${item.id}`, { estado: event.target.value })}>
                  <option value="ACTIVO">Activo</option><option value="INACTIVO">Inactivo</option>
                </select></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <div className="pagination">
        <button className="secondary" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Anterior</button>
        <span>Página {meta.pagina || page} de {meta.totalPaginas || 1}</span>
        <button className="secondary" disabled={page >= (meta.totalPaginas || 1) || loading} onClick={() => setPage(page + 1)}>Siguiente</button>
      </div>
      <section className="panel section-panel">
        <h2>Importar usuarios desde CSV</h2>
        <p className="muted">
          La primera fila debe contener los encabezados exactos: nombres, apellidos, correo,
          codigoEstudiantil, facultad, carrera y contrasena. Máximo 5 MB.
        </p>
        <button className="secondary" type="button" onClick={downloadTemplate}>
          Descargar plantilla CSV
        </button>
        <form className="import-form" onSubmit={importCsv}>
          <label>Archivo CSV<input type="file" name="csv" accept=".csv,text/csv" required /></label>
          <button className="primary" disabled={busyId === 'import'}>{busyId === 'import' ? 'Importando…' : 'Importar CSV'}</button>
        </form>
        {importResult && (
          <div className="import-summary" role="status">
            <p className="success">Importación finalizada: {importResult.creados} creados, {importResult.omitidos} omitidos.</p>
            {importResult.errores?.length > 0 && (
              <>
                <h3>Filas omitidas</h3>
                <ul>{importResult.errores.slice(0, 25).map((item) => (
                  <li key={`${item.fila}-${item.motivo}`}>Fila {item.fila}: {item.motivo}</li>
                ))}</ul>
                {importResult.errores.length > 25 && <p className="muted">Se muestran 25 de {importResult.errores.length} errores.</p>}
              </>
            )}
          </div>
        )}
      </section>
      <AdminPasswordResetRequests />
    </Shell>
  );
}
