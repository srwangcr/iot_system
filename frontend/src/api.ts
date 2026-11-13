const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/+$/, "");

export type Role = "admin" | "member";

export interface Component {
  id: string;
  name: string;
  category: string;
  quantity: number;
  available: number;
}

export type GroupStatus = "active" | "inactive";

export interface Group {
  id: string;
  name: string;
  description: string;
  lead: string;
  memberCount: number;
  status: GroupStatus;
}

export type ProjectStatus = "planned" | "active" | "paused" | "completed" | "cancelled";

export interface Project {
  id: string;
  name: string;
  description: string;
  groupId: string;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const isFormData = options?.body instanceof FormData;
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...options?.headers,
    },
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error("AUTH_REQUIRED");
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "No se pudo completar la solicitud");
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });
const jsonAuthHeaders = (token: string) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${token}`,
});

export const inventoryApi = {
  list: (token: string) =>
    request<{ data: Component[] }>("/api/inventory/components", { headers: authHeaders(token) }),
  create: (component: Component, token: string) =>
    request<{ data: Component }>("/api/inventory/components", {
      method: "POST",
      body: JSON.stringify(component),
      headers: jsonAuthHeaders(token),
    }),
  update: (id: string, component: Omit<Component, "id">, token: string) =>
    request<{ data: Component }>(`/api/inventory/components/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(component),
      headers: jsonAuthHeaders(token),
    }),
  remove: (id: string, token: string) =>
    request<void>(`/api/inventory/components/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: authHeaders(token),
    }),
  import: (file: File, token: string) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ data: { imported: number; components: Component[] } }>("/api/inventory/import", {
      method: "POST",
      body: form,
      headers: authHeaders(token),
    });
  },
  login: (username: string, password: string) =>
    request<{ data: { token: string; role: string; username: string } }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
};

export const groupsApi = {
  list: (token: string) => request<{ data: Group[] }>("/api/groups", { headers: authHeaders(token) }),
  create: (group: Group, token: string) =>
    request<{ data: Group }>("/api/groups", {
      method: "POST",
      body: JSON.stringify(group),
      headers: jsonAuthHeaders(token),
    }),
  update: (id: string, group: Omit<Group, "id">, token: string) =>
    request<{ data: Group }>(`/api/groups/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(group),
      headers: jsonAuthHeaders(token),
    }),
  remove: (id: string, token: string) =>
    request<void>(`/api/groups/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: authHeaders(token),
    }),
};

export const projectsApi = {
  list: (token: string) =>
    request<{ data: Project[] }>("/api/projects", { headers: authHeaders(token) }),
  create: (project: Project, token: string) =>
    request<{ data: Project }>("/api/projects", {
      method: "POST",
      body: JSON.stringify(project),
      headers: jsonAuthHeaders(token),
    }),
  update: (id: string, project: Omit<Project, "id">, token: string) =>
    request<{ data: Project }>(`/api/projects/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(project),
      headers: jsonAuthHeaders(token),
    }),
  remove: (id: string, token: string) =>
    request<void>(`/api/projects/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: authHeaders(token),
    }),
};
