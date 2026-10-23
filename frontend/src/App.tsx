import { FormEvent, useEffect, useMemo, useState } from "react";
import { Component, inventoryApi } from "./api";

export function App() {
  const [components, setComponents] = useState<Component[]>([]);
  const [token, setToken] = useState(() => localStorage.getItem("iot-token") ?? "");
  const [error, setError] = useState("");
  const [login, setLogin] = useState({ username: "", password: "" });
  const [form, setForm] = useState({ id: "", name: "", category: "", quantity: 0, available: 0 });

  const stats = useMemo(() => ({
    total: components.reduce((sum, item) => sum + item.quantity, 0),
    available: components.reduce((sum, item) => sum + item.available, 0),
    lowStock: components.filter((item) => item.available <= 2).length,
  }), [components]);

  async function load() {
    try { setComponents((await inventoryApi.list()).data); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Error cargando inventario"); }
  }
  useEffect(() => { void load(); }, []);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await inventoryApi.login(login.username, login.password);
      localStorage.setItem("iot-token", result.data.token);
      setToken(result.data.token);
      setLogin({ username: "", password: "" });
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Credenciales inválidas"); }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    try { await inventoryApi.create(form, token); setForm({ id: "", name: "", category: "", quantity: 0, available: 0 }); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo crear"); }
  }

  async function remove(id: string) {
    try { await inventoryApi.remove(id, token); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo eliminar"); }
  }

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
}
