# Documentación técnica — IoT Club Management

**Versión del documento:** 1.1  
**Última actualización:** 13 de noviembre de 2026  
**Estado:** proyecto compilando, 26 pruebas automatizadas en verde y flujo end-to-end (43 comprobaciones + 10 específicas de registro/ubicaciones) validado contra PostgreSQL 16 real.

---

## Índice

1. [Visión general](#1-visión-general)
2. [Arquitectura](#2-arquitectura)
3. [Ciclo de vida del backend](#3-ciclo-de-vida-del-backend)
4. [Sistema de módulos](#4-sistema-de-módulos)
5. [Autenticación y autorización](#5-autenticación-y-autorización)
6. [Dominios de negocio](#6-dominios-de-negocio)
7. [Capa HTTP y manejo de errores](#7-capa-http-y-manejo-de-errores)
8. [Base de datos](#8-base-de-datos)
9. [Frontend](#9-frontend)
10. [Configuración y despliegue](#10-configuración-y-despliegue)
11. [Estrategia de pruebas](#11-estrategia-de-pruebas)
12. [Operación y mantenimiento](#12-operación-y-mantenimiento)
13. [Guías de extensión](#13-guías-de-extensión)
14. [Decisiones, limitaciones y riesgos](#14-decisiones-limitaciones-y-riesgos)
15. [Apéndice: resolución del incidente de merge](#15-apéndice-resolución-del-incidente-de-merge)

---

## 1. Visión general

El sistema administra el inventario de hardware, los grupos de trabajo y los proyectos de un club de IoT, e incluye importación de inventario desde Excel. Está compuesto por:

- **API REST** en Node.js, Express 4, TypeScript en modo estricto y módulos ESM.
- **PostgreSQL 16** como almacenamiento transaccional.
- **Frontend SPA** en React 18 + Vite 6.
- **Contenedores** multi-stage para API y frontend, orquestados con Docker Compose.

### Objetivos de diseño

| Objetivo                      | Implementación                                                      |
| ----------------------------- | ------------------------------------------------------------------- |
| Modularidad                    | Manifiestos + contrato `IModule` cargados en runtime.               |
| Tipado estricto                | `strict: true`, `NodeNext`, validación con Zod.                     |
| Separación de responsabilidades | Rutas → middleware → controlador → acceso a datos.                  |
| Seguridad básica               | Roles, tokens Bearer, SQL parametrizado, CORS y fail-fast.          |
| Operabilidad                   | Healthcheck, apagado ordenado, logs y configuración por entorno.    |
| Testabilidad                   | Pool de base de datos inyectable + pruebas unitarias e integración. |

---

## 2. Arquitectura

### 2.1 Diagrama de componentes

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Navegador                                                                │
│  React 18 (App.tsx) ── api.ts ── fetch ──▶ API                           │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ HTTP/JSON + Bearer token
┌───────────────────────────────▼──────────────────────────────────────────┐
│ API Express (src/app.ts)                                                 │
│                                                                          │
│  express.json ─▶ CORS ─▶ /health ─▶ rutas de módulos ─▶ 404 ─▶ errores   │
│                                          │                               │
│            ┌─────────────────────────────┴──────────────────────┐        │
│            │ modules/auth                                   │        │
│            │   /api/auth/login  /api/auth/register          │        │
│            │   requireAuth / requireRole                    │        │
│            ├────────────────────────────────────────────────┤        │
│            │ modules/inventory                              │        │
│            │   /api/inventory/components [GET/POST/PUT/DEL]  │        │
│            │   /api/inventory/locations [GET]               │        │
│            │   /api/inventory/import [POST]                 │        │
│            │   controller.ts + importer.ts (Zod/ExcelJS)    │        │
│            ├────────────────────────────────────────────────┤        │
│            │ modules/groups                                 │        │
│            │   /api/groups [GET/POST/PUT/DEL]               │        │
│            ├────────────────────────────────────────────────┤        │
│            │ modules/projects                               │        │
│            │   /api/projects [GET/POST/PUT/DEL]             │        │
│            └─────────────┬──────────────────────────────────┘        │
└──────────────────────────┼───────────────────────────────────────────┘
                           │ SQL parametrizado
                 ┌─────────▼────────────┐
                 │ PostgreSQL 16        │
                 │ inventory_components │
                 │ groups / projects    │
                 │ users                │
                 └──────────────────────┘
```

### 2.2 Estructura de carpetas

```text
src/
├── app.ts                         # createApp(): middlewares + módulos
├── server.ts                      # .env, listen, señales, cierre del pool
├── core/
│   ├── database.ts                # Pool PostgreSQL perezoso (getPool/setPool/closePool)
│   ├── databaseErrors.ts          # Detección de unique/FK/check violations
│   ├── module.ts                  # IModule, ModuleContext
│   └── moduleLoader.ts            # Descubrimiento, validación, import dinámico
└── modules/
    ├── auth/
    │   ├── accounts.ts            # Cuentas de entorno + resolución de tokens
    │   ├── database.ts            # Tabla users, hash scrypt y tokens
    │   ├── index.ts               # Implementación de IModule
    │   ├── manifest.json
    │   ├── middleware.ts          # requireAuth, requireRole
    │   └── routes.ts              # POST /login y POST /register
    ├── inventory/
    │   ├── controller.ts          # Handlers HTTP + esquemas Zod
    │   ├── database.ts            # Consultas SQL + upsert transaccional
    │   ├── importer.ts            # Lectura/validación del workbook .xlsx
    │   ├── index.ts               # Implementación de IModule
    │   ├── manifest.json
    │   ├── routes.ts              # Rutas protegidas + multer
    │   └── types.ts               # HardwareComponent
    ├── groups/
    │   ├── controller.ts          # CRUD + validación Zod
    │   ├── database.ts            # Tabla groups + seed
    │   ├── index.ts
    │   ├── manifest.json
    │   ├── routes.ts
    │   └── types.ts               # Group, GroupStatus
    └── projects/
        ├── controller.ts          # CRUD + validación Zod
        ├── database.ts            # Tabla projects + FK a groups
        ├── index.ts
        ├── manifest.json
        ├── routes.ts
        └── types.ts               # Project, ProjectStatus
```

---

## 3. Ciclo de vida del backend

### 3.1 Arranque

`src/server.ts`:

1. **Carga de entorno**: `process.loadEnvFile()` lee `.env` si existe. Si no existe (`ENOENT`), continúa. Cualquier otro error se propaga.
2. **Validación de `PORT`**: entero entre 1 y 65535; de lo contrario termina con código 1.
3. **Construcción de la app**: `createApp()` (en `src/app.ts`).
4. **Carga de módulos**: el loader lee `src/modules` o `dist/modules` según el punto de ejecución.
5. **Escucha HTTP**: `app.listen(port)`.
6. **Señales**: `SIGINT` y `SIGTERM` cierran el servidor HTTP y luego el pool de PostgreSQL, con un límite de 10 segundos antes de forzar la salida.

La app se construye en una función separada (`createApp`) precisamente para que las pruebas puedan instanciarla sin abrir un puerto real ni depender del proceso principal.

### 3.2 Orden de middlewares

| Orden | Middleware / ruta          | Propósito                                              |
| ----- | -------------------------- | ------------------------------------------------------ |
| 1     | `app.disable("x-powered-by")` | No revelar la tecnología del servidor.              |
| 2     | `express.json({ limit: "1mb" })` | Parseo JSON con límite de tamaño.                 |
| 3     | `cors`                     | Cabeceras CORS y respuesta a `OPTIONS`.                |
| 4     | `GET /health`              | Comprobación de vida.                                   |
| 5     | Rutas de módulos           | `/api/auth/*`, `/api/inventory/*`.                     |
| 6     | `notFoundHandler`          | `404 { "error": "Not found" }`.                         |
| 7     | `errorHandler`             | `400` para JSON inválido, `500` para lo demás.          |

> El orden importa: el manejador de errores debe registrarse al final y tener cuatro parámetros para que Express lo reconozca como `ErrorRequestHandler`.

### 3.3 Apagado ordenado

```ts
server.close(async (error) => {
  await closePool();
  process.exit(error ? 1 : 0);
});
```

El pool se cierra explícitamente para no dejar conexiones colgando durante reinicios o despliegues.

---

## 4. Sistema de módulos

### 4.1 Contrato

`src/core/module.ts`:

```ts
export interface ModuleContext {
  readonly events: EventEmitter;
}

export interface IModule {
  readonly name: string;
  readonly version: string;
  registerRoutes(app: Express, context: ModuleContext): void | Promise<void>;
  registerHooks(context: ModuleContext): void | Promise<void>;
}
```

### 4.2 Manifiesto

Cada módulo declara `manifest.json`:

```json
{
  "name": "inventory",
  "version": "1.0.0",
  "entry": "index.js"
}
```

Reglas de validación del loader:

1. El directorio debe contener un `manifest.json` legible y JSON válido.
2. `name`, `version` y `entry` deben ser strings no vacíos.
3. El nombre del módulo no puede repetirse.
4. El `entry` debe resolver a un archivo **dentro** del directorio del módulo (se rechazan `../` y rutas absolutas).
5. La implementación importada debe exportar (por `default` o directamente) un objeto que cumpla `IModule`.
6. `implementation.name` y `implementation.version` deben coincidir con el manifiesto.

### 4.3 Resolución `.js` → `.ts` en desarrollo

Los manifiestos apuntan al archivo compilado (`index.js`) porque en producción se ejecuta `dist/`. En desarrollo (`tsx`) el archivo fuente es `index.ts`. El loader:

1. Intenta la ruta exacta (`index.js`).
2. Si no existe y termina en `.js`, prueba el mismo nombre con `.ts`.
3. Verifica que la ruta resuelta siga dentro del módulo.

Esto corrige el fallo que impedía ejecutar `npm run dev`.

### 4.4 Orden de carga

Los directorios se ordenan alfabéticamente antes de cargar. En este proyecto:

1. `auth` — registra `/api/auth`, valida configuración e inicializa la tabla `users`.
2. `groups` — registra `/api/groups`, inicializa la tabla y el seed.
3. `inventory` — registra rutas de inventario e importación, inicializa la tabla y el seed.
4. `projects` — registra `/api/projects`, inicializa la tabla (depende de `groups`) y el seed.

### 4.5 Añadir un módulo

1. Crear `src/modules/<nombre>/manifest.json` con `name`, `version`, `entry`.
2. Implementar `index.ts` con un `export default` que cumpla `IModule`.
3. Registrar rutas y hooks.
4. Añadir pruebas.
5. `npm run build` copia el manifiesto automáticamente a `dist/modules/<nombre>/`.

No hace falta tocar `server.ts` ni el loader.

---

## 5. Autenticación y autorización

### 5.1 Modelo

Conviven dos tipos de cuentas:

1. **Cuentas de entorno** (administrador/miembro), definidas en variables:

| Rol    | Variables                                                       |
| ------ | --------------------------------------------------------------- |
| admin  | `AUTH_ADMIN_USERNAME`, `AUTH_ADMIN_PASSWORD`, `AUTH_ADMIN_TOKEN` |
| member | `AUTH_MEMBER_USERNAME`, `AUTH_MEMBER_PASSWORD`, `AUTH_MEMBER_TOKEN` |

2. **Usuarios registrados** desde la aplicación, persistidos en PostgreSQL:

```sql
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  token         TEXT NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

`src/modules/auth/accounts.ts` centraliza las cuentas de entorno y la resolución de tokens; `src/modules/auth/database.ts` gestiona la tabla `users`, el hash de contraseñas y los tokens aleatorios.

### 5.2 Fail-fast

`assertAuthConfiguration()` se ejecuta en `registerHooks()` del módulo `auth`:

- Falla si falta cualquier variable (lista las faltantes).
- Falla si ambos roles comparten token.
- `getAccounts()` solo devuelve cuentas completas, evitando que una petición con `{}` pueda coincidir con variables vacías.

Sin esto, el código anterior podía emitir un token aleatorio en el login que el middleware nunca aceptaba: el usuario iniciaba sesión y todas las peticiones posteriores devolvían `401`.

### 5.3 Login y registro

```http
POST /api/auth/login
```

1. Valida body con Zod (`username` y `password` obligatorios).
2. Busca primero una cuenta de entorno con usuario y contraseña exactos.
3. Si no coincide, busca en `users` y verifica el hash `scrypt` (sal aleatoria + `timingSafeEqual`).
4. Devuelve `{ token, role, username }`.

Las cuentas de entorno devuelven siempre su token configurado. Los usuarios registrados reciben en el registro un token aleatorio de 32 bytes persistido en la tabla.

```http
POST /api/auth/register
Content-Type: application/json

{ "username": "nuevo.miembro", "password": "minimo-8-caracteres" }
```

1. Valida `username` (3–60, letras/números/`.`/`-`/`_`) y `password` (8–200).
2. Rechaza con `409` si coincide con una cuenta de entorno o con un usuario existente.
3. Crea la cuenta **siempre con rol `member`**; un campo `role` enviado por el cliente se ignora.
4. Hashea la contraseña con `scrypt` y genera el token.
5. Responde `201` con `{ token, role, username }`, listo para usar en `Authorization`.

### 5.4 Middleware

- `requireAuth`: exige token válido; adjunta `request.user = { username, role }`.
- `requireRole("admin")`:
  - Sin token o token inválido → `401`.
  - Token válido de otro rol → `403`.
  - Rol correcto → continúa.

`findAccountByAuthorization()` es asíncrona: compara el token con las cuentas de entorno y, si no coincide y existe pool de base de datos, consulta `users`. Así los tokens de entorno siguen funcionando incluso en pruebas unitarias sin base de datos.

El parseo del header acepta `Bearer <token>` sin distinguir mayúsculas en el esquema, pero exige el token exacto.

### 5.5 Matriz de permisos

| Operación                              | Anónimo | member | admin |
| -------------------------------------- | ------- | ------ | ----- |
| `POST /api/auth/login`                 | ✅      | ✅     | ✅    |
| `POST /api/auth/register`              | ✅      | ✅     | ✅    |
| `GET /health`                          | ✅      | ✅     | ✅    |
| `GET /api/inventory/components`        | ❌ 401  | ✅     | ✅    |
| `GET /api/inventory/locations`         | ❌ 401  | ✅     | ✅    |
| `POST/PUT/DELETE /api/inventory/components` | ❌ 401 | ❌ 403 | ✅ |
| `POST /api/inventory/import`           | ❌ 401  | ❌ 403 | ✅    |
| `GET /api/groups`                      | ❌ 401  | ✅     | ✅    |
| `POST/PUT/DELETE /api/groups`          | ❌ 401  | ❌ 403 | ✅    |
| `GET /api/projects`                    | ❌ 401  | ✅     | ✅    |
| `POST/PUT/DELETE /api/projects`        | ❌ 401  | ❌ 403 | ✅    |

### 5.6 Consideraciones de seguridad

- Los tokens de entorno son estáticos y no expiran; los usuarios registrados usan tokens aleatorios persistidos. Para producción se recomienda JWT con `exp`, rotación y revocación.
- No hay rate limiting en login ni registro; añadir `express-rate-limit` o limitarlo en el reverse proxy.
- Los usuarios registrados almacenan contraseñas con `scrypt` y sal aleatoria. Las cuentas de entorno se comparan contra variables; para producción se recomienda Argon2/bcrypt y una política de rotación.
- Desplegar siempre detrás de TLS.

---

## 6. Dominios de negocio

### 6.1 Inventario: tipo

```ts
export interface HardwareComponent {
  id: string;
  name: string;
  category: string;
  location: string;
  quantity: number;
  available: number;
}
```

### 6.2 Validación (Zod)

`componentFields`:

| Campo       | Regla                                                     |
| ----------- | --------------------------------------------------------- |
| `id`        | string, trim, mínimo 1, regex `^[a-z0-9-]+$`              |
| `name`      | string, trim, 1–120                                       |
| `category`  | string, trim, 1–80                                        |
| `location`  | string, trim, máximo 80, opcional (por defecto `""`)      |
| `quantity`  | entero ≥ 0                                                |
| `available` | entero ≥ 0                                                |

Regla cruzada (`refine`): `available <= quantity`, con error asociado al campo `available`.

- Alta: valida el objeto completo.
- Actualización: omite `id` y valida el resto (PUT de reemplazo completo).

### 6.3 Controlador

| Handler          | Comportamiento                                                        |
| ---------------- | --------------------------------------------------------------------- |
| `listComponents` | `200 { data: [...] }`; errores van al middleware de errores.          |
| `listLocations`  | `200 { data: [...] }` agrupado por `location`; requiere autenticación. |
| `addComponent`   | `201 { data: componente }`.                                           |
| `editComponent`  | `200 { data: componente }` o `404` si no existe.                      |
| `removeComponent`| `204` sin body o `404` si no existe.                                  |

### 6.3.1 Tabla de ubicaciones

`findLocations()` lee todos los componentes ordenados por `location` y los agrupa en memoria para devolver:

```ts
export interface InventoryLocation {
  location: string;
  componentCount: number;
  totalUnits: number;
  availableUnits: number;
  components: HardwareComponent[];
}
```

- No se crea una tabla duplicada en PostgreSQL: la tabla de ubicación se deriva del inventario importado, por lo que siempre refleja el Excel.
- Las ubicaciones vacías se agrupan bajo `""` (la UI las muestra como **Sin ubicación**).
- `GET /api/inventory/locations` es de solo lectura y está disponible para `admin` y `member`.
- Con `inventario.xlsx` real se generan 23 grupos: 22 ubicaciones físicas y un grupo **Sin ubicación** con 2 componentes.

### 6.4 Mapeo de errores de PostgreSQL

| Código PG | Significado                    | Respuesta HTTP                          |
| --------- | ------------------------------ | --------------------------------------- |
| `23505`   | Unique violation (`id` repetido) | `409 A component with that id already exists` |
| `23514`   | Check violation                | `400 Invalid component quantities`      |
| Otro      | Error inesperado               | Log + `500 Internal server error`       |

Zod se captura antes y devuelve `400 { error: "Invalid component", details }`.

### 6.5 Grupos (`src/modules/groups`)

Un grupo representa un equipo de trabajo del club. Tipo:

```ts
export interface Group {
  id: string;
  name: string;
  description: string;
  lead: string;
  memberCount: number;
  status: "active" | "inactive";
}
```

Validación Zod: `id` con regex `^[a-z0-9-]+$` (máx. 80), `name` 1–120, `description` máx. 500, `lead` máx. 120, `memberCount` entero 0–10000 y `status` en `active|inactive`. Los campos opcionales usan valores por defecto (`""`, `0`, `active`).

| Handler       | Comportamiento                                             |
| ------------- | ---------------------------------------------------------- |
| `listGroups`  | `200 { data: [...] }` ordenado por nombre.                  |
| `addGroup`    | `201 { data: grupo }`; `409` si el `id` existe.             |
| `editGroup`   | `200 { data: grupo }` o `404`.                              |
| `removeGroup` | `204` o `404`; `409` si todavía tiene proyectos (`23503`).  |

### 6.6 Proyectos (`src/modules/projects`)

Un proyecto pertenece obligatoriamente a un grupo (`group_id` con `ON DELETE RESTRICT`). Tipo:

```ts
export interface Project {
  id: string;
  name: string;
  description: string;
  groupId: string;
  status: "planned" | "active" | "paused" | "completed" | "cancelled";
  startDate: string | null;
  endDate: string | null;
}
```

Validación Zod: `id` y `groupId` con regex `^[a-z0-9-]+$`, `name` 1–120, `description` máx. 1000, `status` en la lista anterior, fechas `YYYY-MM-DD` válidas y regla cruzada `endDate >= startDate` cuando ambas existen.

| Handler         | Comportamiento                                                        |
| --------------- | --------------------------------------------------------------------- |
| `listProjects`  | `200 { data: [...] }` ordenado por nombre.                             |
| `addProject`    | `201 { data: proyecto }`; `400` si el grupo no existe (`23503`).       |
| `editProject`   | `200 { data: proyecto }` o `404`.                                     |
| `removeProject` | `204` o `404`.                                                        |

### 6.7 Importador de Excel (`src/modules/inventory/importer.ts`)

Flujo:

1. `multer` recibe un único archivo en memoria (campo `file`), máximo **10 MB** y extensión `.xlsx`.
2. `ExcelJS` carga el workbook; si falla, se devuelve `400`.
3. Se recorre cada hoja hasta encontrar una con las cinco columnas obligatorias.
4. Se detecta el formato:

   - **Simple:** `id`, `name`, `category`, `location`, `quantity`, `available` (con alias ES/EN).
   - **Inventario del club:** `ID`, `Nombre`, `Valor-Serial`, `Cantidad`, `Disponible`. En este caso `Nombre` se usa como categoría y `Valor-Serial` como nombre. `Ubicación H` y `Ubicación V` se fusionan en `location` (`A` + `5` → `A5`); si ambas están vacías se usa `Ubicación` como respaldo.

5. Se recorren las filas no vacías (máximo **5000**). En el formato del club, celdas como `--` en cantidades se interpretan como `0` y las filas sin texto se omiten.
6. Se normalizan números y se validan con Zod (incluida la regla `available <= quantity` y la ausencia de `id` duplicados).
7. `upsertComponents()` ejecuta `INSERT ... ON CONFLICT (id) DO UPDATE` dentro de una transacción (`BEGIN`/`COMMIT`/`ROLLBACK`).
8. La respuesta es `200 { data: { imported, components } }`.

Cualquier fila inválida cancela la importación completa e informa el número de fila; no se aplican cambios parciales. El formato del club se validó con el archivo real `inventario.xlsx` (131 componentes importados).

---

## 7. Capa HTTP y manejo de errores

### 7.1 CORS

Implementado a mano en `src/app.ts`:

- `Access-Control-Allow-Origin`: valor de `FRONTEND_ORIGIN` (por defecto `http://localhost:8080`).
- `Vary: Origin`.
- Headers permitidos: `Content-Type, Authorization`.
- Métodos: `GET, POST, PUT, DELETE, OPTIONS`.
- `Access-Control-Max-Age: 600`.
- `OPTIONS` responde `204` inmediatamente.

### 7.2 JSON malformado

`express.json` lanza un `SyntaxError` con propiedad `body`. El manejador de errores lo traduce a:

```json
{ "error": "Invalid JSON body" }
```

con estado `400`.

### 7.3 Rutas inexistentes

Cualquier ruta no registrada devuelve:

```json
{ "error": "Not found" }
```

con estado `404`.

### 7.4 Errores internos

Se registran con `console.error` (incluyendo stack) y se responde `500` sin filtrar detalles al cliente.

---

## 8. Base de datos

### 8.1 Pool perezoso

`src/core/database.ts` crea el `pg.Pool` la primera vez que se necesita y lo comparte con todos los módulos:

```ts
let pool: Pool | undefined;
export function getPool(): Pool { ... }
export function setPool(next: Pool | undefined): void { ... }
export async function closePool(): Promise<void> { ... }
```

Ventajas:

- `.env` ya está cargado cuando se configura la conexión.
- Las pruebas inyectan `pg-mem` sin tocar PostgreSQL.
- El apagado ordenado cierra el pool.

### 8.2 Esquema

```sql
CREATE TABLE IF NOT EXISTS inventory_components (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  category   TEXT NOT NULL,
  quantity   INTEGER NOT NULL CHECK (quantity >= 0),
  available  INTEGER NOT NULL CHECK (available >= 0 AND available <= quantity),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS groups (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  lead         TEXT NOT NULL DEFAULT '',
  member_count INTEGER NOT NULL DEFAULT 0 CHECK (member_count >= 0),
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  group_id    TEXT NOT NULL REFERENCES groups(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  status      TEXT NOT NULL DEFAULT 'planned'
              CHECK (status IN ('planned', 'active', 'paused', 'completed', 'cancelled')),
  start_date  DATE,
  end_date    DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)
);
```

La doble validación (Zod + `CHECK`/`FK`) protege tanto la API como escrituras directas. El módulo `projects` se inicializa después de `groups` (orden alfabético del loader), por lo que la clave foránea siempre encuentra su tabla.

### 8.3 Inicialización y seed

Cada módulo inicializa su tabla y, si está vacía, inserta datos de ejemplo:

| Módulo      | Función                        | Seed                                                        |
| ----------- | ------------------------------ | ----------------------------------------------------------- |
| `inventory` | `initializeInventoryDatabase`  | `esp32-devkit`, `raspberry-pi-4`, `dht22`.                  |
| `groups`    | `initializeGroupsDatabase`     | `iot-core`, `robotics-lab`.                                 |
| `projects`  | `initializeProjectsDatabase`   | `smart-greenhouse` (iot-core), `line-follower` (robotics-lab). |

El seed es idempotente: solo se ejecuta cuando el conteo es `0`, por lo que no se duplica en reinicios.

### 8.4 Consultas

Todas usan parámetros posicionales (`$1..$n`). No hay interpolación de strings de usuario. Las columnas se devuelven con alias `camelCase` (`member_count AS "memberCount"`, `group_id AS "groupId"`, `start_date AS "startDate"`, `end_date AS "endDate"`).

La importación usa un cliente dedicado del pool para ejecutar el *upsert* masivo en una transacción; si cualquier fila falla, se hace `ROLLBACK` y no queda ningún cambio parcial.

### 8.5 Migraciones

Actualmente no hay herramienta de migraciones. El esquema evoluciona con `CREATE TABLE IF NOT EXISTS`. Para cambios futuros se recomienda introducir una carpeta `migrations/` y una herramienta como `node-pg-migrate` o `dbmate`, con migraciones versionadas y ejecución previa al arranque.

---

## 9. Frontend

### 9.1 Stack

- React 18
- Vite 6
- TypeScript 5.7 (`strict`, `noEmit`, `moduleResolution: Bundler`)
- CSS plano

### 9.2 Estado principal (`App.tsx`)

| Estado       | Persistencia            | Propósito                                   |
| ------------ | ----------------------- | ------------------------------------------- |
| `components` | —                       | Lista del inventario.                       |
| `locations`  | —                       | Tabla de ubicaciones agrupada por la API.   |
| `groups`     | —                       | Lista de grupos.                            |
| `projects`   | —                       | Lista de proyectos.                         |
| `token`      | `localStorage`          | Token Bearer.                               |
| `role`       | `localStorage`          | Rol para renderizado condicional.           |
| `view`       | —                       | Pestaña activa: `inventory/locations/groups/projects`. |
| `error`      | —                       | Mensajes de error/estado.                   |
| `notice`     | —                       | Confirmaciones de operaciones exitosas.     |
| `login`      | —                       | Formulario de login/registro.               |
| `authMode`   | —                       | Alterna entre `login` y `register`.         |

Las vistas están separadas en `frontend/src/views/`: `InventoryView.tsx`, `LocationsView.tsx`, `GroupsView.tsx` y `ProjectsView.tsx`. Cada una mantiene su propio formulario y filtros locales.

### 9.3 Flujos

1. **Sin token** → pantalla de acceso; permite alternar entre login y registro.
2. **Login/registro exitoso** → guarda token/rol, `setToken` dispara el `useEffect` que carga inventario, ubicaciones, grupos y proyectos en paralelo.
3. **Carga** → `GET /api/inventory/components`, `GET /api/inventory/locations`, `GET /api/groups` y `GET /api/projects`; si recibe `401`, cierra sesión y muestra aviso.
4. **Alta** (solo admin) → `POST` del recurso correspondiente; recarga todas las listas.
5. **Borrado** (solo admin) → `DELETE`; recarga las listas. Si un grupo tiene proyectos, el backend responde `409` y la UI muestra el error.
6. **Importación Excel** (solo admin) → `POST /api/inventory/import` con `FormData`; muestra filas procesadas y recarga.
7. **Búsqueda** → filtrado local del inventario por id, nombre, categoría y ubicación; la pestaña Ubicaciones filtra por ubicación/componente.
8. **Logout** → limpia `localStorage`, estado y listas.

### 9.4 Cliente API (`api.ts`)

- `API_URL` viene de `VITE_API_URL`; se eliminan barras finales.
- No envía `Content-Type: application/json` cuando el body es `FormData`.
- Traduce `401` a `AUTH_REQUIRED` para que la UI cierre sesión.
- Extrae `body.error` para mostrar mensajes del backend.
- Expone `authApi` (`login`, `register`), `inventoryApi` (`list`, `locations`, `create`, `update`, `remove`, `import`), `groupsApi` y `projectsApi` (`list`, `create`, `update`, `remove`).
- Tipos compartidos: `Role`, `Component`, `InventoryLocation`, `Group`, `Project` y sus estados.

### 9.5 Renderizado por rol

- `member`: solo lectura y búsqueda en las cuatro pestañas.
- `admin`: además ve formularios de alta, importación Excel y botones de borrado.

El backend siempre vuelve a validar el rol; ocultar botones es solo UX.

### 9.6 Build

`npm run build` ejecuta `tsc` (sin emitir) y `vite build`. El resultado se sirve con Nginx, que incluye:

- `try_files ... /index.html` para rutas SPA.
- Cache inmutable para `/assets/`.
- `gzip` y cabeceras de seguridad.

---

## 10. Configuración y despliegue

### 10.1 Variables

Ver tabla completa en el [README](../README.md#5-variables-de-entorno).

### 10.2 Docker: API

`Dockerfile` multi-stage:

1. **build**: `npm ci`, copia `tsconfig.json`, `scripts/` y `src/`, ejecuta `npm run build`.
2. **runtime**: `npm ci --omit=dev`, copia `dist/`, ejecuta como usuario `node`, expone `3000`, healthcheck HTTP.

Puntos corregidos:

- Se copia `scripts/` porque `npm run build` ejecuta `node scripts/copy-manifests.cjs`.
- Se usa `npm ci` para instalaciones reproducibles.
- Healthcheck con `fetch` nativo de Node.

### 10.3 Docker: frontend

1. **build**: `npm ci`, copia el proyecto, compila con `VITE_API_URL`.
2. **runtime**: Nginx Alpine con `nginx.conf`, healthcheck con `wget`.

### 10.4 Docker Compose

- `api` espera a que `postgres` esté saludable.
- `frontend` espera a que `api` esté saludable.
- Credenciales y puertos parametrizados con `${VAR:-default}`.
- Volumen persistente `postgres_data`.

Variables de Compose relevantes:

```env
API_PORT=3000
FRONTEND_PORT=8080
VITE_API_URL=http://localhost:3000
FRONTEND_ORIGIN=http://localhost:8080
POSTGRES_PASSWORD=...
AUTH_ADMIN_* / AUTH_MEMBER_*
```

> En un despliegue real, `VITE_API_URL` y `FRONTEND_ORIGIN` deben apuntar al dominio público, no a `localhost`.

#### Cloudflare Tunnel

El overlay `docker-compose.cloudflared.yml` añade un servicio `cloudflared` a la misma red de Compose. El túnel se crea en **Zero Trust → Networks → Tunnels** (tipo Docker) y su token se pasa como `CLOUDFLARE_TUNNEL_TOKEN`. Los *Public Hostnames* se configuran en el panel de Cloudflare:

- `iot.tudominio.com/api` → `HTTP api:3000` (regla específica, evaluada primero; Cloudflare no quita el prefijo `/api`).
- `iot.tudominio.com` → `HTTP frontend:80` (regla general).

Con ese esquema el navegador usa un único origen: `VITE_API_URL=https://iot.tudominio.com` y `FRONTEND_ORIGIN=https://iot.tudominio.com`, sin CORS ni *mixed content*. Alternativamente se pueden usar dos hostnames (`iot` para el frontend e `iot-api` para la API), configurando CORS con `FRONTEND_ORIGIN`. Como `VITE_API_URL` se compila en el bundle, hay que reconstruir la imagen del frontend al cambiarlo:

```bash
docker compose -f docker-compose.yml -f docker-compose.cloudflared.yml up -d --build
```

Con Compose v1, ante el error `KeyError: 'ContainerConfig'`, añade `DOCKER_BUILDKIT=0` delante del comando. Los pasos completos y la verificación están en `README.md`, sección 4.2.

### 10.5 Escalado

- La API es stateless (sin sesiones en memoria), por lo que puede escalar horizontalmente.
- Inventario, grupos y proyectos se comparten vía PostgreSQL.
- El rate limiting y la terminación TLS deben resolverse en el proxy/ingress.

---

## 11. Estrategia de pruebas

### 11.1 Comando

```bash
npm test
```

Ejecuta `node --import tsx --test test/*.test.ts` (actualmente 26 pruebas).

### 11.2 Unitarias (`test/unit.test.ts`)

| Prueba | Qué valida |
| ------ | ---------- |
| `isModuleManifest` | Campos obligatorios y valores vacíos. |
| `resolveModuleEntry` | Fallback `.js`→`.ts`, archivo faltante y path traversal. |
| `loadModules` orden/hooks | Carga alfabética y ejecución de `registerHooks`. |
| `loadModules` errores | Metadatos distintos y nombres duplicados. |
| `loadModules` seguridad | Entry fuera del directorio del módulo. |
| Auth | Fail-fast, cuentas completas, tokens Bearer, tokens duplicados. |

### 11.3 Integración end-to-end (`test/app.test.ts`)

Usa:

- `createApp()` real.
- `pg-mem` como PostgreSQL en memoria, inyectado con `setPool()`.
- `fetch` contra un servidor HTTP en un puerto efímero.

Casos cubiertos:

1. `GET /health`.
2. Preflight CORS.
3. Login inválido/incompleto/admin/member.
4. Registro: validación, rol `member` forzado aunque se envíe `role: admin`, duplicado/reservado `409`, login posterior y acceso con el token emitido.
5. Rutas sin token, con token inválido.
6. Lectura de datos semilla de inventario, ubicaciones, grupos y proyectos por member.
7. `403` para escrituras de member en los tres dominios y en la importación.
8. Inventario: validación de cantidades/ids, `201`, `409`, `200`, `404`, `204`.
9. Ubicaciones: agrupación por `location`, conteos/unidades, detalle de componentes, `401` sin token y actualización tras importar el formato del club.
10. Grupos: seed, `201`, duplicado `409`, `400` de validación, `PUT`, borrado `204` y `409` si tiene proyectos (`FK`).
11. Proyectos: seed, `201`, `400` por grupo inexistente (`FK`) y fechas inválidas, `PUT`, `204`/`404`.
12. Importación Excel: `403` para member, *upsert* de filas nuevas y existentes, reimportación idempotente, formato simple con `location`, formato del club (`ID/Nombre/Valor-Serial/Ubicación H + V/Cantidad/Disponible`) con celdas `--` y filas vacías, columnas faltantes, fila inválida, extensión `.csv`, archivo ausente.
13. JSON malformado `400` y ruta inexistente `404`.

### 11.4 Validación manual con PostgreSQL real

Además de la suite automatizada se ejecutó:

1. `npm run build` y `cd frontend && npm run build`.
2. PostgreSQL 16 real (instancia embebida en el entorno de validación).
3. `node dist/server.js` con variables reales.
4. **43 comprobaciones HTTP**: health, CORS, login, registro, roles, CRUD de inventario/grupos/proyectos, validaciones, duplicados, restricciones `FK` y errores `404`.
5. **10 comprobaciones adicionales** contra PostgreSQL real + `inventario.xlsx`: registro/login de usuario nuevo, importación/reimportación de 131 componentes, ubicaciones fusionadas y `GET /api/inventory/locations` con **23 grupos** (22 ubicaciones + **Sin ubicación**), `A5` con 47 componentes y `A1`/`F4` verificados.
6. Importación Excel real: creación/actualización de componentes, reimportación idempotente y rechazo de archivos/filas inválidas.
7. Importación del archivo real `inventario.xlsx` (formato del club): **131 componentes** cargados, incluidas filas con `--` en cantidad y una fila vacía ignorada; reimportación idempotente.
8. Persistencia: creación de grupo, proyecto y componente importado, `SIGTERM`, reinicio y verificación de que los datos seguían ahí y los seeds no se duplicaron.
9. `npm run dev` con `.env` real: confirmó la carga de entorno y la resolución `.ts` del loader.

Resultado: **todo en verde**.

### 11.5 Qué no cubre la suite

- Pruebas de navegador/UI (no hay Playwright/Cypress).
- Pruebas de carga o concurrencia.
- Migraciones.
- TLS y proxy real.

---

## 12. Operación y mantenimiento

### 12.1 Healthcheck

```bash
curl -fsS http://localhost:3000/health
# {"status":"ok"}
```

Solo comprueba que el proceso HTTP responde. Si se necesita comprobar la base de datos, añadir un endpoint `/health/ready` que ejecute `SELECT 1`.

### 12.2 Logs

- Arranque: puerto y módulos cargados.
- Errores internos: `console.error` con stack.
- Apagado: señal recibida.
- Pool: errores inesperados de conexión.

En producción conviene enviar stdout/stderr a un colector (journald, Loki, CloudWatch, etc.).

### 12.3 Rotación de credenciales

1. Cambiar `AUTH_*_PASSWORD` y `AUTH_*_TOKEN` en `.env`/secret manager.
2. Reiniciar la API (los controles leen el entorno al arrancar; los tokens se resuelven por petición, pero la sesión del frontend queda invalidada y el usuario debe reloguearse).
3. Verificar login y operaciones.

### 12.4 Backup

- `pg_dump` programado de `iot_club`.
- El volumen `postgres_data` no sustituye a un backup lógico.
- Probar restauraciones periódicamente.

### 12.5 Actualización de dependencias

```bash
npm audit
npm outdated
npm update
npm test
npm run build
cd frontend && npm audit && npm run build
```

---

## 13. Guías de extensión

### 13.1 Añadir un endpoint al inventario

1. Añadir la función en `database.ts` con SQL parametrizado.
2. Añadir el handler en `controller.ts` con validación Zod.
3. Registrar la ruta en `routes.ts` con `requireAuth` o `requireRole`.
4. Añadir casos a `test/app.test.ts`.
5. Documentar en `README.md`.

### 13.2 Añadir un módulo

1. Crear `src/modules/<nombre>/manifest.json`.
2. Implementar `index.ts` con `IModule`.
3. Registrar rutas y hooks.
4. Añadir pruebas.
5. `npm run build` y verificar `dist/modules/<nombre>/manifest.json`.

### 13.3 Añadir migraciones

1. Instalar una herramienta (ej. `node-pg-migrate`).
2. Versionar el esquema actual como migración inicial.
3. Ejecutar migraciones en el arranque o en un job previo.
4. Mantener el seed separado de las migraciones.

### 13.4 Añadir edición en el frontend

La API `PUT` ya existe y está probada. Para la UI:

1. Guardar el `id` en edición en el estado.
2. Reutilizar el formulario para cargar valores actuales.
3. Llamar `inventoryApi.update(id, form, token)`.
4. Alternar entre “Agregar” y “Guardar cambios”.

---

## 14. Decisiones, limitaciones y riesgos

### 14.1 Decisiones

| Decisión | Motivo |
| -------- | ------ |
| Manifiestos + import dinámico | Módulos desacoplados y cargables sin tocar el núcleo. |
| Zod para validación | Esquemas declarativos, mensajes y `details` consistentes. |
| Pool perezoso + `setPool` | Entorno cargado antes de conectar y pruebas sin PostgreSQL. |
| Tokens de entorno + tokens persistidos | Simplicidad para cuentas base y registro sin infraestructura extra. |
| Tabla de ubicación derivada | Evita duplicar datos y refleja siempre el último Excel importado. |
| CORS manual | Una sola dependencia menos y control explícito. |
| `pg-mem` en pruebas | Rápido, sin servicios externos, misma capa de acceso a datos. |

### 14.2 Limitaciones

- Tokens sin expiración ni revocación automática.
- Sin rate limiting.
- Sin refresh tokens.
- Las cuentas de entorno siguen usando contraseñas en variables; los usuarios registrados usan `scrypt`.
- Sin migraciones versionadas.
- Sin pruebas de UI.
- Sin paginación en el listado (aceptable para un club pequeño).
- El `PUT` es reemplazo completo, no `PATCH` parcial.

### 14.3 Riesgos y mitigaciones

| Riesgo | Mitigación actual | Siguiente paso |
| ------ | ----------------- | -------------- |
| Fuerza bruta en login | Contraseñas/tokens fuertes | Rate limiting |
| Token filtrado | Rotación manual | Expiración + revocación |
| Caída de PostgreSQL | Reinicio de contenedor | Réplicas/backups |
| Cambios de esquema | `CREATE TABLE IF NOT EXISTS` | Migraciones versionadas |
| Errores 500 sin trazabilidad | Logs con stack | Correlación/observabilidad |

---

## 15. Apéndice: resolución del incidente de merge

### 15.1 Síntoma

El repositorio no compilaba. Cuatro archivos contenían marcadores de conflicto:

```text
frontend/src/App.tsx
frontend/src/api.ts
frontend/src/styles.css
src/modules/inventory/routes.ts
```

Además, código de la funcionalidad de importación de Excel (`multer`, `exceljs`, `importComponents`, `/api/inventory/import`) había quedado referenciado sin sus dependencias ni implementación, porque el commit de `revert` no se resolvió correctamente.

### 15.2 Causa

Secuencia de commits:

1. `dc52a23` añadió importación de Excel.
2. `2106320` añadió autenticación, búsqueda y mejoras de UI sobre esa base.
3. `6174463` intentó revertir `dc52a23`, generando conflictos con los cambios posteriores. Los marcadores se commitearon sin resolver.

### 15.3 Resolución

En esa corrección se conservó la funcionalidad posterior válida (autenticación, roles, búsqueda y UI responsive) y se eliminó la importación de Excel (restaurada después, ya endurecida):

- `routes.ts`: rutas de inventario con `requireAuth`/`requireRole`, sin `multer` ni endpoint de importación.
- `api.ts`: cliente de login/list/create/update/remove, sin `import`.
- `App.tsx`: UI de login, roles, búsqueda y alta; sin selector de archivos ni `importFile`.
- `styles.css`: se conservó el bloque de estilos completo y se eliminaron marcadores y estilos del importador.

### 15.4 Verificación

- `grep` sin marcadores de conflicto.
- `grep` sin referencias a Excel/multer/import.
- `npm run build` ✅
- `npm test` ✅ (17 pruebas en ese momento; hoy son 23)
- Build del frontend ✅
- E2E con PostgreSQL real ✅

> **Nota posterior:** tras resolver el incidente se restauró el importador de Excel (endurecido) y se añadieron los módulos de grupos y proyectos. El estado vigente se describe en las secciones 6, 8 y 11.

---

## Referencias

- [README del proyecto](../README.md)
- [Express 4 — Error handling](https://expressjs.com/en/guide/error-handling.html)
- [Zod](https://zod.dev/)
- [node-postgres](https://node-postgres.com/)
- [React](https://react.dev/)
- [Vite](https://vite.dev/)
