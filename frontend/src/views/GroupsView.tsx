import { type FormEvent, useMemo, useState } from "react";
import { type Group, type Role, groupsApi } from "../api";

interface GroupsViewProps {
  groups: Group[];
  role: Role;
  token: string;
  onRefresh: () => Promise<void>;
  onError: (reason: unknown, fallback: string) => void;
  onNotice: (message: string) => void;
}

const emptyGroup: Group = {
  id: "",
  name: "",
  description: "",
  lead: "",
  memberCount: 0,
  status: "active",
};

export function GroupsView({ groups, role, token, onRefresh, onError, onNotice }: GroupsViewProps) {
  const [form, setForm] = useState<Group>(emptyGroup);

  const stats = useMemo(() => ({
    active: groups.filter((group) => group.status === "active").length,
    members: groups.reduce((sum, group) => sum + group.memberCount, 0),
    inactive: groups.filter((group) => group.status === "inactive").length,
  }), [groups]);

  async function add(event: FormEvent) {
    event.preventDefault();
    try {
      await groupsApi.create(form, token);
      setForm(emptyGroup);
      onNotice(`Grupo "${form.name}" creado.`);
      await onRefresh();
    } catch (reason) {
      onError(reason, "No se pudo crear el grupo");
    }
  }

  async function remove(group: Group) {
    if (!window.confirm(`¿Eliminar el grupo "${group.name}"?`)) return;
    try {
      await groupsApi.remove(group.id, token);
      onNotice(`Grupo "${group.name}" eliminado.`);
      await onRefresh();
    } catch (reason) {
      onError(reason, "No se pudo eliminar el grupo");
    }
  }

  return (
    <>
      <section className="stats">
        <article><span>Grupos</span><strong>{groups.length}</strong></article>
        <article><span>Activos</span><strong>{stats.active}</strong></article>
        <article><span>Miembros</span><strong>{stats.members}</strong></article>
        <article><span>Inactivos</span><strong>{stats.inactive}</strong></article>
      </section>
      <section className="grid">
        <div className="panel">
          <div className="panel-title"><div><h2>Grupos del club</h2><span>{groups.length} equipos registrados</span></div></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Grupo</th><th>Responsable</th><th>Miembros</th><th>Estado</th>{role === "admin" && <th>Acciones</th>}</tr></thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.id}>
                    <td><b>{group.name}</b><small>{group.id}</small>{group.description && <small>{group.description}</small>}</td>
                    <td>{group.lead || "—"}</td>
                    <td>{group.memberCount}</td>
                    <td><span className={group.status === "active" ? "badge" : "badge neutral"}>{group.status === "active" ? "Activo" : "Inactivo"}</span></td>
                    {role === "admin" && <td><button className="delete" onClick={() => void remove(group)}>Eliminar</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {!groups.length && <div className="empty-state"><strong>No hay grupos todavía</strong><span>{role === "admin" ? "Crea el primer grupo con el formulario." : "Un administrador debe crear los grupos."}</span></div>}
          </div>
        </div>
        {role === "admin" && <aside>
          <form className="panel form" onSubmit={add}>
            <h2>Crear grupo</h2>
            <label>ID<input required placeholder="ej. iot-core" value={form.id} onChange={(event) => setForm({ ...form, id: event.target.value })} /></label>
            <label>Nombre<input required placeholder="Nombre del grupo" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            <label>Responsable<input placeholder="Usuario responsable" value={form.lead} onChange={(event) => setForm({ ...form, lead: event.target.value })} /></label>
            <div className="row">
              <label>Miembros<input type="number" min="0" value={form.memberCount} onChange={(event) => setForm({ ...form, memberCount: Number(event.target.value) })} /></label>
              <label>Estado<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Group["status"] })}><option value="active">Activo</option><option value="inactive">Inactivo</option></select></label>
            </div>
            <label>Descripción<textarea rows={3} maxLength={500} placeholder="Enfoque del grupo" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
            <button>Guardar grupo</button>
          </form>
        </aside>}
      </section>
    </>
  );
}
