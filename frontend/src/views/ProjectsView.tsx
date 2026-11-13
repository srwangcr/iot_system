import { type FormEvent, useMemo, useState } from "react";
import { type Group, type Project, type Role, projectsApi } from "../api";

interface ProjectsViewProps {
  projects: Project[];
  groups: Group[];
  role: Role;
  token: string;
  onRefresh: () => Promise<void>;
  onError: (reason: unknown, fallback: string) => void;
  onNotice: (message: string) => void;
}

const emptyProject: Project = {
  id: "",
  name: "",
  description: "",
  groupId: "",
  status: "planned",
  startDate: null,
  endDate: null,
};

const statusLabels: Record<Project["status"], string> = {
  planned: "Planificado",
  active: "Activo",
  paused: "En pausa",
  completed: "Completado",
  cancelled: "Cancelado",
};

const statusClasses: Record<Project["status"], string> = {
  planned: "badge neutral",
  active: "badge",
  paused: "badge warning",
  completed: "badge info",
  cancelled: "badge danger",
};

export function ProjectsView({
  projects,
  groups,
  role,
  token,
  onRefresh,
  onError,
  onNotice,
}: ProjectsViewProps) {
  const [form, setForm] = useState<Project>(emptyProject);

  const groupNames = useMemo(
    () => new Map(groups.map((group) => [group.id, group.name])),
    [groups],
  );

  const stats = useMemo(() => ({
    active: projects.filter((project) => project.status === "active").length,
    planned: projects.filter((project) => project.status === "planned").length,
    completed: projects.filter((project) => project.status === "completed").length,
  }), [projects]);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      onError(new Error("La fecha de fin no puede ser anterior a la de inicio"), "Fechas inválidas");
      return;
    }
    try {
      await projectsApi.create(
        { ...form, startDate: form.startDate || null, endDate: form.endDate || null },
        token,
      );
      setForm(emptyProject);
      onNotice(`Proyecto "${form.name}" creado.`);
      await onRefresh();
    } catch (reason) {
      onError(reason, "No se pudo crear el proyecto");
    }
  }

  async function remove(project: Project) {
    if (!window.confirm(`¿Eliminar el proyecto "${project.name}"?`)) return;
    try {
      await projectsApi.remove(project.id, token);
      onNotice(`Proyecto "${project.name}" eliminado.`);
      await onRefresh();
    } catch (reason) {
      onError(reason, "No se pudo eliminar el proyecto");
    }
  }

  return (
    <>
      <section className="stats">
        <article><span>Proyectos</span><strong>{projects.length}</strong></article>
        <article><span>Activos</span><strong>{stats.active}</strong></article>
        <article><span>Planificados</span><strong>{stats.planned}</strong></article>
        <article><span>Completados</span><strong>{stats.completed}</strong></article>
      </section>
      <section className="grid">
        <div className="panel">
          <div className="panel-title"><div><h2>Proyectos del club</h2><span>{projects.length} proyectos registrados</span></div></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Proyecto</th><th>Grupo</th><th>Estado</th><th>Inicio</th><th>Fin</th>{role === "admin" && <th>Acciones</th>}</tr></thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id}>
                    <td><b>{project.name}</b><small>{project.id}</small>{project.description && <small>{project.description}</small>}</td>
                    <td>{groupNames.get(project.groupId) ?? project.groupId}</td>
                    <td><span className={statusClasses[project.status]}>{statusLabels[project.status]}</span></td>
                    <td>{project.startDate ?? "—"}</td>
                    <td>{project.endDate ?? "—"}</td>
                    {role === "admin" && <td><button className="delete" onClick={() => void remove(project)}>Eliminar</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {!projects.length && <div className="empty-state"><strong>No hay proyectos todavía</strong><span>{role === "admin" && groups.length ? "Crea el primer proyecto con el formulario." : "Un administrador debe crear los proyectos."}</span></div>}
          </div>
        </div>
        {role === "admin" && <aside>
          {groups.length ? (
            <form className="panel form" onSubmit={add}>
              <h2>Crear proyecto</h2>
              <label>ID<input required placeholder="ej. smart-greenhouse" value={form.id} onChange={(event) => setForm({ ...form, id: event.target.value })} /></label>
              <label>Nombre<input required placeholder="Nombre del proyecto" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label>Grupo<select required value={form.groupId} onChange={(event) => setForm({ ...form, groupId: event.target.value })}><option value="" disabled>Selecciona un grupo</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
              <div className="row">
                <label>Estado<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Project["status"] })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label>Inicio<input type="date" value={form.startDate ?? ""} onChange={(event) => setForm({ ...form, startDate: event.target.value || null })} /></label>
              </div>
              <label>Fin<input type="date" value={form.endDate ?? ""} onChange={(event) => setForm({ ...form, endDate: event.target.value || null })} /></label>
              <label>Descripción<textarea rows={3} maxLength={1000} placeholder="Objetivo del proyecto" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
              <button>Guardar proyecto</button>
            </form>
          ) : (
            <div className="panel empty-state"><strong>Primero crea un grupo</strong><span>Los proyectos deben pertenecer a un grupo del club.</span></div>
          )}
        </aside>}
      </section>
    </>
  );
}
