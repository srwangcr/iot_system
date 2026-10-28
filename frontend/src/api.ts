const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface Component {
  id: string;
  name: string;
  category: string;
  quantity: number;
  available: number;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error("AUTH_REQUIRED");
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? "No se pudo completar la solicitud");
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

export const inventoryApi = {
  list: (token: string) => request<{ data: Component[] }>("/api/inventory/components", { headers: authHeaders(token) }),
  create: (component: Component, token: string) => request<{ data: Component }>("/api/inventory/components", {
    method: "POST", body: JSON.stringify(component), headers: authHeaders(token),
  }),
  remove: (id: string, token: string) => request<void>(`/api/inventory/components/${id}`, {
    method: "DELETE", headers: authHeaders(token),
  }),
<<<<<<< HEAD
  import: (file: File, token: string) => request<{ data: { imported: number } }>("/api/inventory/import", {
    method: "POST",
    body: (() => { const form = new FormData(); form.append("file", file); return form; })(),
    headers: authHeaders(token),
  }),
=======
>>>>>>> parent of dc52a23 (feat(inventory): add Excel import functionality for components)
  login: (username: string, password: string) => request<{ data: { token: string; role: string } }>("/api/auth/login", {
    method: "POST", body: JSON.stringify({ username, password }),
  }),
};
