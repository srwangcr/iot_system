const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/+$/, "");

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
    if (response.status === 401) throw new Error("AUTH_REQUIRED");
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "No se pudo completar la solicitud");
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

export const inventoryApi = {
  list: (token: string) => request<{ data: Component[] }>("/api/inventory/components", { headers: authHeaders(token) }),
  create: (component: Component, token: string) => request<{ data: Component }>("/api/inventory/components", {
    method: "POST", body: JSON.stringify(component), headers: authHeaders(token),
  }),
  update: (id: string, component: Omit<Component, "id">, token: string) =>
    request<{ data: Component }>(`/api/inventory/components/${encodeURIComponent(id)}`, {
      method: "PUT", body: JSON.stringify(component), headers: authHeaders(token),
    }),
  remove: (id: string, token: string) => request<void>(`/api/inventory/components/${encodeURIComponent(id)}`, {
    method: "DELETE", headers: authHeaders(token),
  }),
  login: (username: string, password: string) => request<{ data: { token: string; role: string } }>("/api/auth/login", {
    method: "POST", body: JSON.stringify({ username, password }),
  }),
};
