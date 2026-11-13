# IoT Club Management

Sistema de gestión de inventario para un club de IoT. Backend modular en **Node.js + Express + TypeScript**, base de datos **PostgreSQL** y frontend **React + Vite**.

El repositorio quedó reparado tras un `revert` que había dejado marcadores de conflicto de Git en el código y una funcionalidad de importación de Excel a medio eliminar. Actualmente el proyecto compila, arranca, pasa las pruebas automatizadas y fue validado de extremo a extremo contra una instancia real de PostgreSQL.

---

## 1. Características

- Arquitectura modular: cada módulo (`auth`, `inventory`) se descubre y carga desde su `manifest.json`.
- Autenticación por token Bearer con dos roles: `admin` y `member`.
- CRUD de componentes de inventario con validación de datos.
- Inventario inicial (seed) automático la primera vez que se crea la tabla.
- Frontend React con inicio de sesión, búsqueda, estadísticas, tabla y formulario de alta para administradores.
- CORS configurable, manejo centralizado de errores, healthchecks y apagado ordenado.
- Docker multi-stage para API y frontend, con PostgreSQL en Docker Compose.
- Pruebas unitarias, de integración y end-to-end automatizadas.

---

## 2. Arquitectura

```text
┌─────────────────────┐        HTTP/JSON        ┌──────────────────────────┐
│  Frontend React     │ ──────────────────────▶ │  API Express + TS        │
│  Vite / Nginx :8080 │ ◀────────────────────── │  :3000                   │
└─────────────────────┘                         │  ┌────────────────────┐  │
                                                │  │ core/moduleLoader  │  │
                                                │  ├────────────────────┤  │
                                                │  │ modules/auth       │  │
                                                │  │ modules/inventory  │  │
                                                │  └─────────┬──────────┘  │
                                                └────────────┼─────────────┘
                                                             │ pg
                                                   ┌─────────▼──────────┐
                                                   │ PostgreSQL 16      │
                                                   │ inventory_components│
                                                   └────────────────────┘
```

Flujo de una petición:

1. `src/server.ts` carga `.env` (si existe), crea la app y escucha en `PORT`.
2. `createApp()` registra JSON, CORS, `/health` y carga los módulos.
3. Cada módulo registra rutas y hooks de inicialización.
4. Las rutas de inventario validan autenticación/rol y delegan en el controlador.
5. El controlador valida con Zod y ejecuta SQL parametrizado en PostgreSQL.
6. Los errores se normalizan como JSON (`400`, `401`, `403`, `404`, `409`, `500`).

La documentación detallada está en [`docs/DOCUMENTACION-TECNICA.md`](docs/DOCUMENTACION-TECNICA.md).

---

## 3. Requisitos

- Node.js **22 o superior** (probado con Node 26).
- npm 10 o superior.
- PostgreSQL 16 (local o contenedor).
- Opcional: Docker + Docker Compose.

---

## 4. Puesta en marcha

### 4.1 Con Docker Compose (recomendado)

```bash
cp .env.example .env
# Edita .env y cambia contraseñas y tokens antes de desplegar

docker compose up --build
```

Servicios:

| Servicio   | URL                          |
| ---------- | ---------------------------- |
| Frontend   | http://localhost:8080        |
| API        | http://localhost:3000        |
| Health API | http://localhost:3000/health |
| PostgreSQL | interno, puerto 5432         |

Credenciales por defecto (cámbialas en `.env`):

| Rol    | Usuario  | Contraseña                 |
| ------ | -------- | -------------------------- |
| admin  | `admin`  | `change-me-in-production`  |
| member | `member` | `change-me-in-production`  |

### 4.2 En local

1. Crea la base de datos:

   ```sql
   CREATE USER iot WITH PASSWORD 'change-me-in-production';
   CREATE DATABASE iot_club OWNER iot;
   ```

2. Configura el entorno:

   ```bash
   cp .env.example .env
   # Ajusta DATABASE_URL a tu PostgreSQL local, por ejemplo:
   # DATABASE_URL=postgresql://iot:change-me-in-production@localhost:5432/iot_club
   ```

3. Instala y arranca el backend:

   ```bash
   npm install
   npm run dev          # recarga automática con tsx
   ```

   El servidor carga `.env` automáticamente mediante `process.loadEnvFile()`.

4. Instala y arranca el frontend en otra terminal:

   ```bash
   cd frontend
   npm install
   npm run dev          # http://localhost:5173
   ```

   Si el frontend corre en otro puerto, ajusta `VITE_API_URL` y `FRONTEND_ORIGIN`.

5. Producción local:

   ```bash
   npm run build
   npm start
   ```

---

## 5. Variables de entorno

| Variable               | Obligatoria | Descripción                                                        |
| ---------------------- | ----------- | ------------------------------------------------------------------ |
| `PORT`                 | No          | Puerto de la API. Por defecto `3000`.                              |
| `DATABASE_URL`         | Sí          | Cadena de conexión PostgreSQL.                                     |
| `FRONTEND_ORIGIN`      | No          | Origen permitido por CORS. Por defecto `http://localhost:8080`.    |
| `AUTH_ADMIN_USERNAME`  | Sí          | Usuario administrador.                                             |
| `AUTH_ADMIN_PASSWORD`  | Sí          | Contraseña del administrador.                                      |
| `AUTH_ADMIN_TOKEN`     | Sí          | Token Bearer del administrador. Debe ser distinto al de member.    |
| `AUTH_MEMBER_USERNAME` | Sí          | Usuario miembro.                                                   |
| `AUTH_MEMBER_PASSWORD` | Sí          | Contraseña del miembro.                                            |
| `AUTH_MEMBER_TOKEN`    | Sí          | Token Bearer del miembro.                                          |
| `VITE_API_URL`         | No          | URL de la API usada al compilar el frontend.                       |

La API **falla al arrancar** si falta cualquier `AUTH_*` o si ambos roles comparten token. Esto evita emitir sesiones que luego no pueden validarse.

---

## 6. Scripts

| Comando              | Descripción                                                        |
| -------------------- | ------------------------------------------------------------------ |
| `npm run dev`        | API en modo desarrollo con recarga (`tsx watch`).                  |
| `npm run build`      | Compila TypeScript y copia los `manifest.json` a `dist/`.          |
| `npm start`          | Ejecuta la API compilada (`dist/server.js`).                       |
| `npm test`           | Pruebas unitarias + integración end-to-end.                        |
| `npm run test:watch` | Pruebas en modo vigilancia.                                        |
| `npm run clean`      | Borra `dist/`.                                                     |
| `cd frontend && npm run build` | Compila el frontend para producción.                    |

---

## 7. API

Base: `http://localhost:3000`. Todas las respuestas son JSON.

### 7.1 Autenticación

```http
POST /api/auth/login
Content-Type: application/json

{ "username": "admin", "password": "change-me-in-production" }
```

Respuesta `200`:

```json
{
  "data": {
    "token": "replace-admin-token",
    "role": "admin",
    "username": "admin"
  }
}
```

Las rutas protegidas esperan:

```http
Authorization: Bearer <token>
```

### 7.2 Endpoints

| Método   | Ruta                             | Rol requerido | Descripción                         |
| -------- | -------------------------------- | ------------- | ----------------------------------- |
| `GET`    | `/health`                        | —             | Estado de la API.                   |
| `POST`   | `/api/auth/login`                | —             | Inicio de sesión.                   |
| `GET`    | `/api/inventory/components`      | admin/member  | Lista componentes ordenados por nombre. |
| `POST`   | `/api/inventory/components`      | admin         | Crea un componente.                 |
| `PUT`    | `/api/inventory/components/:id`  | admin         | Actualiza un componente.            |
| `DELETE` | `/api/inventory/components/:id`  | admin         | Elimina un componente.              |

### 7.3 Ejemplos

```bash
TOKEN="replace-admin-token"

curl http://localhost:3000/health

curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"change-me-in-production"}'

curl http://localhost:3000/api/inventory/components \
  -H "Authorization: Bearer $TOKEN"

curl -X POST http://localhost:3000/api/inventory/components \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"id":"arduino-uno","name":"Arduino Uno","category":"microcontroller","quantity":5,"available":5}'

curl -X PUT http://localhost:3000/api/inventory/components/arduino-uno \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Arduino Uno R3","category":"microcontroller","quantity":7,"available":6}'

curl -X DELETE http://localhost:3000/api/inventory/components/arduino-uno \
  -H "Authorization: Bearer $TOKEN"
```

### 7.4 Errores

| Código | Significado                                                        |
| ------ | ------------------------------------------------------------------ |
| `400`  | Body inválido, JSON malformado o cantidades inconsistentes.        |
| `401`  | Token ausente/inválido o credenciales incorrectas.                 |
| `403`  | Token válido sin el rol necesario.                                 |
| `404`  | Componente o ruta inexistente.                                     |
| `409`  | Ya existe un componente con ese `id`.                              |
| `500`  | Error interno.                                                     |

Formato:

```json
{ "error": "Invalid component", "details": { "...": "..." } }
```

---

## 8. Modelo de datos

```sql
CREATE TABLE inventory_components (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  category   TEXT NOT NULL,
  quantity   INTEGER NOT NULL CHECK (quantity >= 0),
  available  INTEGER NOT NULL CHECK (available >= 0 AND available <= quantity),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Reglas de validación en la API:

- `id`: obligatorio, minúsculas, números y guiones (`^[a-z0-9-]+$`), máximo implícito por body.
- `name`: 1–120 caracteres.
- `category`: 1–80 caracteres.
- `quantity` y `available`: enteros ≥ 0.
- `available <= quantity`.

Si la tabla está vacía, se insertan tres componentes de ejemplo: `esp32-devkit`, `raspberry-pi-4` y `dht22`.

---

## 9. Estructura del proyecto

```text
.
├── src/
│   ├── app.ts                     # Construcción de la app Express
│   ├── server.ts                  # Arranque, .env, apagado ordenado
│   ├── core/
│   │   ├── module.ts              # Contrato IModule y ModuleContext
│   │   └── moduleLoader.ts        # Descubrimiento y validación de módulos
│   └── modules/
│       ├── auth/                  # Cuentas, login y middleware de roles
│       └── inventory/             # Rutas, controlador, validación y PostgreSQL
├── frontend/
│   ├── src/                       # React: App, cliente API y estilos
│   ├── nginx.conf                 # SPA + cabeceras de seguridad
│   └── Dockerfile
├── test/                          # Pruebas unitarias y end-to-end
├── docs/DOCUMENTACION-TECNICA.md  # Documentación técnica detallada
├── scripts/copy-manifests.cjs     # Copia manifiestos a dist/
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## 10. Pruebas

```bash
npm test
```

Cobertura actual (17 pruebas):

- **Unitarias**
  - Validación de manifiestos de módulos.
  - Resolución del entry `.js` → `.ts` en desarrollo.
  - Carga determinista de módulos y ejecución de hooks.
  - Rechazo de metadatos inconsistentes, módulos duplicados y rutas de escape.
  - Validación de configuración de autenticación y matching de tokens Bearer.
- **End-to-end de API** (Express real + PostgreSQL en memoria `pg-mem`)
  - Healthcheck y preflight CORS.
  - Login inválido, incompleto, admin y member.
  - Protección de rutas y distinción `401` / `403`.
  - Datos semilla, creación, duplicados, actualización, borrado y `404`.
  - Validación de cantidades, JSON malformado y rutas inexistentes.

Además se validó manualmente el flujo completo con:

- `npm run build` + `node dist/server.js`.
- Una instancia **real de PostgreSQL 16**.
- Login, CRUD, roles, CORS, persistencia tras reinicio y apagado con `SIGTERM`.
- `npm run dev` con carga automática de `.env` y resolución de módulos `.ts`.

---

## 11. Seguridad

- Los endpoints de escritura exigen rol `admin`; la lectura exige autenticación.
- Los tokens se comparan con el header `Authorization: Bearer`.
- La configuración de auth se valida al arrancar (fail-fast).
- Todas las consultas SQL usan parámetros (`$1`, `$2`, ...), sin concatenación.
- Se valida el body con Zod antes de llegar a la base de datos.
- Se aplica `limit` de 1 MB al body JSON y se desactiva `x-powered-by`.
- Nginx añade `X-Content-Type-Options`, `X-Frame-Options` y `Referrer-Policy`.

Limitaciones conocidas y siguientes pasos recomendados:

- Los tokens son estáticos (definidos por entorno); para producción se recomienda JWT con expiración y rotación.
- No hay rate limiting en `/api/auth/login`.
- No hay HTTPS en el proyecto; debe terminarse TLS en un proxy/ingress.
- Las contraseñas se comparan en texto plano contra variables de entorno; usar hashes (Argon2/bcrypt) si se migra a usuarios en base de datos.
- No hay migraciones versionadas; el esquema se crea con `CREATE TABLE IF NOT EXISTS`.
- El frontend no implementa edición de componentes (la API `PUT` sí está disponible y probada).

---

## 12. Solución de problemas

| Síntoma                                                        | Causa / solución                                                                 |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `Missing authentication environment variables: ...`            | Copia `.env.example` a `.env` y define todos los `AUTH_*`.                        |
| `AUTH_ADMIN_TOKEN and AUTH_MEMBER_TOKEN must be different`      | Usa tokens distintos por rol.                                                     |
| Error de conexión a PostgreSQL                                 | Revisa `DATABASE_URL`, que PostgreSQL esté activo y que la base exista.           |
| El frontend muestra error de CORS                              | Ajusta `FRONTEND_ORIGIN` al origen real del navegador y recompila si cambió `VITE_API_URL`. |
| `npm run dev` no encuentra `index.js`                          | El loader resuelve automáticamente `index.ts` en desarrollo; verifica el nombre del entry en `manifest.json`. |
| El build de Docker falla en `copy-manifests`                   | El `Dockerfile` debe copiar `scripts/`; ya está corregido en este repositorio.    |
| `EADDRINUSE`                                                   | Otro proceso usa `PORT`; cámbialo o detén el proceso anterior.                   |

---

## 13. Correcciones aplicadas en esta revisión

1. Resueltos los marcadores de conflicto en `src/modules/inventory/routes.ts`, `frontend/src/App.tsx`, `frontend/src/api.ts` y `frontend/src/styles.css`.
2. Eliminados los restos de la funcionalidad Excel (`multer`, `exceljs`, endpoint `/api/inventory/import`, UI y método del cliente).
3. Corregido `npm run dev`: el loader ahora resuelve entradas `.js` de los manifiestos hacia `.ts` en desarrollo.
4. Corregido el build Docker: se copia `scripts/` antes de `npm run build`.
5. Añadido `src/app.ts` con una app reutilizable y `server.ts` con carga de `.env` y apagado ordenado.
6. Autenticación endurecida: configuración fail-fast, sin tokens aleatorios inválidos, `403` correcto para roles insuficientes y matching estricto de Bearer.
7. `pg` ahora crea el pool de forma perezosa y se puede inyectar en pruebas; se cierra en el apagado.
8. Añadido manejo centralizado de errores (`400` para JSON inválido, `404` JSON) y CORS con `Vary: Origin`.
9. Actualizado `zod` a 4.x para eliminar una vulnerabilidad de denegación de servicio (0 vulnerabilidades en `npm audit --omit=dev`).
10. Añadidos healthchecks, `.dockerignore`, configuración de Nginx y variables de Compose parametrizables.
11. Añadida la suite de pruebas y esta documentación.
