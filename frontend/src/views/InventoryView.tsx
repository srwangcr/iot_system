import { type ChangeEvent, type FormEvent, useMemo, useState } from "react";
import { type Component, type Role, inventoryApi } from "../api";

interface InventoryViewProps {
  components: Component[];
  role: Role;
  token: string;
  onRefresh: () => Promise<void>;
  onError: (reason: unknown, fallback: string) => void;
  onNotice: (message: string) => void;
}

const emptyForm: Component = { id: "", name: "", category: "", quantity: 0, available: 0 };

export function InventoryView({
  components,
  role,
  token,
  onRefresh,
  onError,
  onNotice,
}: InventoryViewProps) {
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<Component>(emptyForm);
  const [importing, setImporting] = useState(false);

  const stats = useMemo(() => ({
    total: components.reduce((sum, item) => sum + item.quantity, 0),
    available: components.reduce((sum, item) => sum + item.available, 0),
    lowStock: components.filter((item) => item.available <= 2).length,
  }), [components]);

  const filteredComponents = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return components;
    return components.filter((item) =>
      [item.id, item.name, item.category].some((value) =>
        value.toLocaleLowerCase().includes(normalizedQuery),
      ),
    );
  }, [components, query]);

  async function add(event: FormEvent) {
    event.preventDefault();
    try {
      await inventoryApi.create(form, token);
      setForm(emptyForm);
      onNotice(`Componente "${form.name}" agregado.`);
      await onRefresh();
    } catch (reason) {
      onError(reason, "No se pudo crear el componente");
    }
  }

  async function remove(component: Component) {
    if (!window.confirm(`¿Eliminar "${component.name}"?`)) return;
    try {
      await inventoryApi.remove(component.id, token);
      onNotice(`Componente "${component.name}" eliminado.`);
      await onRefresh();
    } catch (reason) {
      onError(reason, "No se pudo eliminar el componente");
    }
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const result = await inventoryApi.import(file, token);
      onNotice(`Importación completada: ${result.data.imported} filas procesadas.`);
      await onRefresh();
    } catch (reason) {
      onError(reason, "No se pudo importar el archivo Excel");
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <section className="stats">
        <article><span>Componentes</span><strong>{components.length}</strong></article>
        <article><span>Unidades totales</span><strong>{stats.total}</strong></article>
        <article><span>Disponibles</span><strong>{stats.available}</strong></article>
        <article><span>Stock bajo</span><strong>{stats.lowStock}</strong></article>
      </section>
      <section className="grid">
        <div className="panel inventory-panel">
          <div className="panel-title"><div><h2>Componentes</h2><span>{filteredComponents.length} de {components.length} registros</span></div></div>
          <div className="search-bar">
            <label htmlFor="component-search">Buscar componentes</label>
            <div className="search-controls"><input id="component-search" type="search" placeholder="Buscar por ID, nombre o categoría..." value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button className="secondary" onClick={() => setQuery("")}>Limpiar</button>}</div>
          </div>
          <div className="table-wrap">
            <table><thead><tr><th>Componente</th><th>Categoría</th><th>Total</th><th>Disponible</th>{role === "admin" && <th>Acciones</th>}</tr></thead>
              <tbody>{filteredComponents.map((item) => <tr key={item.id}><td><b>{item.name}</b><small>{item.id}</small></td><td>{item.category}</td><td>{item.quantity}</td><td><span className={item.available <= 2 ? "badge warning" : "badge"}>{item.available}</span></td>{role === "admin" && <td><button className="delete" onClick={() => void remove(item)}>Eliminar</button></td>}</tr>)}</tbody>
            </table>
            {!filteredComponents.length && <div className="empty-state"><strong>No encontramos componentes</strong><span>Prueba con otro término de búsqueda.</span></div>}
          </div>
        </div>
        {role === "admin" && <aside>
          <form className="panel form" onSubmit={add}>
            <h2>Agregar componente</h2>
            <label className="file-label">Importar Excel (.xlsx)<input type="file" accept=".xlsx" disabled={importing} onChange={(event) => void importFile(event)} /><small>{importing ? "Importando..." : "Formatos: id/name/category/quantity/available o ID/Nombre/Valor-Serial/Cantidad/Disponible."}</small></label>
            <label>ID<input required placeholder="ej. arduino-uno" value={form.id} onChange={(event) => setForm({ ...form, id: event.target.value })} /></label>
            <label>Nombre<input required placeholder="Nombre del componente" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            <label>Categoría<input required placeholder="Categoría" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></label>
            <div className="row"><label>Total<input type="number" min="0" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })} /></label><label>Disponible<input type="number" min="0" value={form.available} onChange={(event) => setForm({ ...form, available: Number(event.target.value) })} /></label></div>
            <button>Guardar componente</button>
          </form>
        </aside>}
      </section>
    </>
  );
}
