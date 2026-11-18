import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  type Component,
  type Group,
  type InventoryLocation,
  type Project,
  type Role,
  authApi,
  groupsApi,
  inventoryApi,
  projectsApi,
} from "./api";
import { InventoryView } from "./views/InventoryView";
import { GroupsView } from "./views/GroupsView";
import { ProjectsView } from "./views/ProjectsView";
import { LocationsView } from "./views/LocationsView";

type View = "inventory" | "locations" | "groups" | "projects";

function readStoredRole(): Role {
  return localStorage.getItem("iot-role") === "admin" ? "admin" : "member";
}

export function App() {
  const [components, setComponents] = useState<Component[]>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [token, setToken] = useState(() => localStorage.getItem("iot-token") ?? "");
  const [role, setRole] = useState<Role>(readStoredRole);
  const [view, setView] = useState<View>("inventory");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [login, setLogin] = useState({ username: "", password: "" });
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [confirmPassword, setConfirmPassword] = useState("");

  const counts = useMemo(() => ({
    inventory: components.length,
    locations: locations.length,
    groups: groups.length,
    projects: projects.length,
  }), [components.length, locations.length, groups.length, projects.length]);

  function signOut() {
    localStorage.removeItem("iot-token");
    localStorage.removeItem("iot-role");
    setToken("");
    setRole("member");
    setComponents([]);
    setLocations([]);
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
      const [inventoryResult, locationsResult, groupsResult, projectsResult] = await Promise.all([
        inventoryApi.list(currentToken),
        inventoryApi.locations(currentToken),
        groupsApi.list(currentToken),
        projectsApi.list(currentToken),
      ]);
      setComponents(inventoryResult.data);
      setLocations(locationsResult.data);
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

  async function authenticate(event: FormEvent) {
    event.preventDefault();
    if (authMode === "register" && login.password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }
    try {
      const result =
        authMode === "register"
          ? await authApi.register(login.username, login.password)
          : await authApi.login(login.username, login.password);
      localStorage.setItem("iot-token", result.data.token);
      localStorage.setItem("iot-role", result.data.role);
      setRole(result.data.role === "admin" ? "admin" : "member");
      setLogin({ username: "", password: "" });
      setConfirmPassword("");
      setError("");
      setNotice("");
      setAuthMode("login");
      setToken(result.data.token);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo iniciar sesión");
    }
  }

  function switchAuthMode() {
    setAuthMode(authMode === "login" ? "register" : "login");
    setConfirmPassword("");
    setError("");
    setNotice("");
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
          <h1>{authMode === "register" ? "Crear cuenta" : "Centro de gestión"}</h1>
          <p>
            {authMode === "register"
              ? "Regístrate para consultar el inventario, los grupos y los proyectos del club."
              : "Inicia sesión para consultar el inventario, los grupos y los proyectos del club."}
          </p>
          {error && <div className="alert">{error}</div>}
          <form className="form" onSubmit={authenticate}>
            <label>Usuario<input required autoComplete="username" minLength={authMode === "register" ? 3 : undefined} placeholder="Tu usuario" value={login.username} onChange={(event) => setLogin({ ...login, username: event.target.value })} /></label>
            <label>Contraseña<input required type="password" autoComplete={authMode === "register" ? "new-password" : "current-password"} minLength={authMode === "register" ? 8 : undefined} placeholder={authMode === "register" ? "Mínimo 8 caracteres" : "Tu contraseña"} value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} /></label>
            {authMode === "register" && <label>Confirmar contraseña<input required type="password" autoComplete="new-password" minLength={8} placeholder="Repite la contraseña" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>}
            <button type="submit">{authMode === "register" ? "Registrarme" : "Iniciar sesión"}</button>
            <button type="button" className="secondary" onClick={switchAuthMode}>
              {authMode === "register" ? "Ya tengo cuenta" : "Crear una cuenta"}
            </button>
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
        <button className={view === "locations" ? "tab active" : "tab"} onClick={() => openView("locations")}>Ubicaciones <span>{counts.locations}</span></button>
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
      {view === "locations" && <LocationsView locations={locations} />}
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
