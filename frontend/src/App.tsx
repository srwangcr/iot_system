import { FormEvent, useEffect, useMemo, useState } from "react";
import { Component, inventoryApi } from "./api";

type Role = "admin" | "member";

const emptyForm = { id: "", name: "", category: "", quantity: 0, available: 0 };

export function App() {
  const [components, setComponents] = useState<Component[]>([]);
  const [token, setToken] = useState(() => localStorage.getItem("iot-token") ?? "");
  const [role, setRole] = useState<Role>(() => (localStorage.getItem("iot-role") as Role) ?? "member");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [login, setLogin] = useState({ username: "", password: "" });
  const [form, setForm] = useState(emptyForm);

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

  function signOut() {
    localStorage.removeItem("iot-token");
    localStorage.removeItem("iot-role");
    setToken("");
    setRole("member");
    setComponents([]);
    setQuery("");
  }

  async function load(currentToken = token) {
    try {
      setComponents((await inventoryApi.list(currentToken)).data);
      setError("");
    } catch (reason) {
      if (reason instanceof Error && reason.message === "AUTH_REQUIRED") signOut();
      else setError(reason instanceof Error ? reason.message : "Error cargando inventario");
    }
  }

  useEffect(() => {
    if (token) void load();
  }, [token]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await inventoryApi.login(login.username, login.password);
      localStorage.setItem("iot-token", result.data.token);
      localStorage.setItem("iot-role", result.data.role);
      setToken(result.data.token);
      setRole(result.data.role as Role);
      setLogin({ username: "", password: "" });
      setError("");
      await load(result.data.token);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Credenciales inválidas");
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    try {
      await inventoryApi.create(form, token);
      setForm(emptyForm);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo crear");
    }
  }

  async function remove(id: string) {
    try {
      await inventoryApi.remove(id, token);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo eliminar");
    }
  }

<<<<<<< HEAD
  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const result = await inventoryApi.import(file, token);
      await load();
      setError(`Importación completada: ${result.data.imported} filas procesadas.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo importar el Excel");
    }
  }

  if (!token) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <span className="eyebrow">CLUB DE IoT</span>
          <h1>Centro de inventario</h1>
          <p>Inicia sesión para consultar y administrar los componentes del club.</p>
          {error && <div className="alert">{error}</div>}
          <form className="form" onSubmit={signIn}>
            <label>Usuario<input required autoComplete="username" placeholder="Tu usuario" value={login.username} onChange={(event) => setLogin({ ...login, username: event.target.value })} /></label>
            <label>Contraseña<input required type="password" autoComplete="current-password" placeholder="Tu contraseña" value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} /></label>
            <button type="submit">Iniciar sesión</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main>
      <header>
        <div><span className="eyebrow">CLUB DE IoT</span><h1>Centro de inventario</h1></div>
        <div className="header-actions"><span className="user-role">{role === "admin" ? "Administrador" : "Miembro"}</span><button className="secondary" onClick={() => void load()}>Actualizar</button><button className="secondary" onClick={signOut}>Cerrar sesión</button></div>
      </header>
      {error && <div className="alert">{error}</div>}
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
              <tbody>{filteredComponents.map((item) => <tr key={item.id}><td><b>{item.name}</b><small>{item.id}</small></td><td>{item.category}</td><td>{item.quantity}</td><td><span className={item.available <= 2 ? "badge warning" : "badge"}>{item.available}</span></td>{role === "admin" && <td><button className="delete" onClick={() => void remove(item.id)}>Eliminar</button></td>}</tr>)}</tbody>
            </table>
            {!filteredComponents.length && <div className="empty-state"><strong>No encontramos componentes</strong><span>Prueba con otro término de búsqueda.</span></div>}
          </div>
        </div>
        {role === "admin" && <aside>
          <form className="panel form" onSubmit={add}><h2>Agregar componente</h2><label className="file-label">Importar Excel (.xlsx/.xls)<input type="file" accept=".xlsx,.xls" onChange={(event) => void importFile(event)} /></label><label>ID<input required placeholder="ej. arduino-uno" value={form.id} onChange={(event) => setForm({ ...form, id: event.target.value })} /></label><label>Nombre<input required placeholder="Nombre del componente" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>Categoría<input required placeholder="Categoría" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></label><div className="row"><label>Total<input type="number" min="0" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })} /></label><label>Disponible<input type="number" min="0" value={form.available} onChange={(event) => setForm({ ...form, available: Number(event.target.value) })} /></label></div><button>Guardar componente</button></form>
        </aside>}
      </section>
    </main>
  );
=======
  return <main>
    <header><div><span className="eyebrow">CLUB DE IoT</span><h1>Centro de inventario</h1></div><button className="secondary" onClick={() => void load()}>Actualizar</button></header>
    {error && <div className="alert">{error}</div>}
    <section className="stats">
      <article><span>Componentes</span><strong>{components.length}</strong></article>
      <article><span>Unidades totales</span><strong>{stats.total}</strong></article>
      <article><span>Disponibles</span><strong>{stats.available}</strong></article>
      <article><span>Stock bajo</span><strong>{stats.lowStock}</strong></article>
    </section>
    <section className="grid">
      <div className="panel"><div className="panel-title"><h2>Componentes</h2><span>{components.length} registros</span></div>
        <div className="table-wrap"><table><thead><tr><th>Componente</th><th>Categoría</th><th>Total</th><th>Disponible</th><th></th></tr></thead>
          <tbody>{components.map((item) => <tr key={item.id}><td><b>{item.name}</b><small>{item.id}</small></td><td>{item.category}</td><td>{item.quantity}</td><td><span className={item.available <= 2 ? "badge warning" : "badge"}>{item.available}</span></td><td>{token && <button className="delete" onClick={() => void remove(item.id)}>Eliminar</button>}</td></tr>)}</tbody>
        </table></div>
      </div>
      <aside>
        {!token ? <form className="panel form" onSubmit={signIn}><h2>Acceso de encargado</h2><p>Inicia sesión para administrar el inventario.</p><input placeholder="Usuario" value={login.username} onChange={(event) => setLogin({ ...login, username: event.target.value })} /><input type="password" placeholder="Contraseña" value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} /><button>Iniciar sesión</button></form> :
          <form className="panel form" onSubmit={add}><h2>Agregar componente</h2><input required placeholder="ID (ej. arduino-uno)" value={form.id} onChange={(event) => setForm({ ...form, id: event.target.value })} /><input required placeholder="Nombre" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /><input required placeholder="Categoría" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /><div className="row"><input type="number" min="0" placeholder="Total" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })} /><input type="number" min="0" placeholder="Disponible" value={form.available} onChange={(event) => setForm({ ...form, available: Number(event.target.value) })} /></div><button>Guardar componente</button><button type="button" className="secondary" onClick={() => { localStorage.removeItem("iot-token"); setToken(""); }}>Cerrar sesión</button></form>}
      </aside>
    </section>
  </main>;
>>>>>>> parent of dc52a23 (feat(inventory): add Excel import functionality for components)
}
