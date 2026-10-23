const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface Component {
  id: string;
  name: string;
  category: string;
  quantity: number;
  available: number;
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
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? "No se pudo completar la solicitud");
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export const inventoryApi = {
  list: () => request<{ data: Component[] }>("/api/inventory/components"),
  create: (component: Component, token: string) => request<{ data: Component }>("/api/inventory/components", {
    method: "POST", body: JSON.stringify(component), headers: { Authorization: `Bearer ${token}` },
  }),
  remove: (id: string, token: string) => request<void>(`/api/inventory/components/${id}`, {
    method: "DELETE", headers: { Authorization: `Bearer ${token}` },
  }),
  import: (file: File, token: string) => request<{ data: { imported: number } }>("/api/inventory/import", {
    method: "POST",
    body: (() => { const form = new FormData(); form.append("file", file); return form; })(),
    headers: { Authorization: `Bearer ${token}` },
  }),
  login: (username: string, password: string) => request<{ data: { token: string; role: string } }>("/api/auth/login", {
    method: "POST", body: JSON.stringify({ username, password }),
  }),
};
