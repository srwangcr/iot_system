import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  type Component,
  type Group,
  type Project,
  type Role,
  groupsApi,
  inventoryApi,
  projectsApi,
} from "./api";
import { InventoryView } from "./views/InventoryView";
import { GroupsView } from "./views/GroupsView";
import { ProjectsView } from "./views/ProjectsView";

type View = "inventory" | "groups" | "projects";

function readStoredRole(): Role {
  return localStorage.getItem("iot-role") === "admin" ? "admin" : "member";
}

export function App() {
  const [components, setComponents] = useState<Component[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [token, setToken] = useState(() => localStorage.getItem("iot-token") ?? "");
  const [role, setRole] = useState<Role>(readStoredRole);
  const [view, setView] = useState<View>("inventory");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [login, setLogin] = useState({ username: "", password: "" });

  const counts = useMemo(() => ({
    inventory: components.length,
    groups: groups.length,
    projects: projects.length,
  }), [components.length, groups.length, projects.length]);

  function signOut() {
    localStorage.removeItem("iot-token");
    localStorage.removeItem("iot-role");
    setToken("");
    setRole("member");
    setComponents([]);
    setGroups([]);
    setProjects([]);
    setView("inventory");
  }

  function handleFailure(reason: unknown, fallback: string) {
    setNotice("");
    if (reason instanceof Error && reason.message === "AUTH_REQUIRED") {
      signOut();
      setError("Tu sesión expiró. Inicia sesión de nuevo.");
      return;
    }
    setError(reason instanceof Error ? reason.message : fallback);
  }

  function showNotice(message: string) {
    setError("");
    setNotice(message);
  }

  async function loadAll(currentToken = token) {
    if (!currentToken) return;
    try {
      const [inventoryResult, groupsResult, projectsResult] = await Promise.all([
        inventoryApi.list(currentToken),
        groupsApi.list(currentToken),
        projectsApi.list(currentToken),
      ]);
      setComponents(inventoryResult.data);
      setGroups(groupsResult.data);
      setProjects(projectsResult.data);
      setError("");
    } catch (reason) {
      handleFailure(reason, "Error cargando los datos del club");
    }
  }

  useEffect(() => {
    if (token) void loadAll(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await inventoryApi.login(login.username, login.password);
      localStorage.setItem("iot-token", result.data.token);
      localStorage.setItem("iot-role", result.data.role);
      setRole(result.data.role === "admin" ? "admin" : "member");
      setLogin({ username: "", password: "" });
      setError("");
      setNotice("");
      setToken(result.data.token);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Credenciales inválidas");
    }
  }

  function openView(nextView: View) {
    setView(nextView);
    setError("");
    setNotice("");
  }

  if (!token) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <span className="eyebrow">CLUB DE IoT</span>
          <h1>Centro de gestión</h1>
          <p>Inicia sesión para consultar el inventario, los grupos y los proyectos del club.</p>
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
        <div><span className="eyebrow">CLUB DE IoT</span><h1>Centro de gestión</h1></div>
        <div className="header-actions"><span className="user-role">{role === "admin" ? "Administrador" : "Miembro"}</span><button className="secondary" onClick={() => void loadAll()}>Actualizar</button><button className="secondary" onClick={signOut}>Cerrar sesión</button></div>
      </header>

      <nav className="tabs" aria-label="Secciones">
        <button className={view === "inventory" ? "tab active" : "tab"} onClick={() => openView("inventory")}>Inventario <span>{counts.inventory}</span></button>
        <button className={view === "groups" ? "tab active" : "tab"} onClick={() => openView("groups")}>Grupos <span>{counts.groups}</span></button>
        <button className={view === "projects" ? "tab active" : "tab"} onClick={() => openView("projects")}>Proyectos <span>{counts.projects}</span></button>
      </nav>

      {error && <div className="alert">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      {view === "inventory" && (
        <InventoryView
          components={components}
          role={role}
          token={token}
          onRefresh={loadAll}
          onError={handleFailure}
          onNotice={showNotice}
        />
      )}
      {view === "groups" && (
        <GroupsView
          groups={groups}
          role={role}
          token={token}
          onRefresh={loadAll}
          onError={handleFailure}
          onNotice={showNotice}
        />
      )}
      {view === "projects" && (
        <ProjectsView
          projects={projects}
          groups={groups}
          role={role}
          token={token}
          onRefresh={loadAll}
          onError={handleFailure}
          onNotice={showNotice}
        />
      )}
    </main>
  );
}
