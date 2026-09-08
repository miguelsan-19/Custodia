# Custodia

Aplicación web para administrar el dinero de varias personas que convive en una sola cuenta bancaria.
Cada persona tiene su propio saldo, calculado automáticamente a partir de todos sus movimientos.

- **Frontend + API** → hospedados en **Vercel** (gratis, con dominio propio opcional)
- **Base de datos** → **Supabase** (PostgreSQL en la nube, gratis)

---

## 1) Preparar la base de datos (Supabase)

1. Entra a https://supabase.com → **New project** (plan **Free**).
2. Copia las credenciales de acceso:
   - Ve a **Project Settings → Database → Connection string**.
   - Usa la cadena **Session pooler** (puerto `6543`) o la directa (puerto `5432`) con tu contraseña de base de datos.
   - Te quedará algo como:
     ```
     postgresql://postgres.xxxxx:TU_CONTRASENA@aws-0-us-east-1.pooler.supabase.com:6543/postgres
     ```
3. Abre **SQL Editor → New query**, pega TODO el contenido del archivo **`supabase.sql`** (que está en esta carpeta) y pulsa **Run**.
4. Copia la cadena de conexión: la vas a usar en los pasos siguientes.

> Guarda el archivo `supabase.sql`: vuelve a ejecutarlo si creas un proyecto nuevo. No hace daño repetirlo.

---

## 2) Publicar en Vercel

### Opción A — Con la interfaz web de Vercel (más fácil la primera vez)

1. Sube esta carpeta a un repositorio de GitHub (o usa la CLI de la opción B).
2. Entra a https://vercel.com → **Add New → Project** → importa tu repositorio.
3. El framework se detecta solo (Node.js). No cambies nada más.
4. En **Environment Variables** agrega:
   - **Name:** `DATABASE_URL`
   - **Value:** tu cadena de conexión de Supabase
5. Pulsa **Deploy**. En un minuto tendrás tu aplicación en algo como:
   `https://tu-proyecto.vercel.app`

### Opción B — Con la línea de comandos (sin GitHub)

```
npm i -g vercel
vercel            # primera vez: inicia sesión y enlaza el proyecto
vercel env add DATABASE_URL production
vercel --prod
```

---

## 3) Primer uso (una sola vez)

Abre tu enlace de Vercel y crea la **contraseña** de acceso y define la **moneda**.
Esa contraseña queda cifrada en la base de datos y se pedirá cada vez que entres.

---

## 4) Ponerle tu dominio propio

Vercel te da un enlace gratis (`tu-proyecto.vercel.app`). Si quieres tu propio dominio (ej. `micuentas.com`):

1. Compra un dominio en Namecheap, GoDaddy, etc. (cuesta ~10 USD/año).
2. En Vercel: **Project → Settings → Domains → Add** escribe tu dominio.
3. Vercel te mostrará los registros DNS que debes crear en tu proveedor de dominio (un registro `A` o `CNAME`). Los creas ahí.
4. En pocos minutos Vercel activa el HTTPS automáticamente.

> Puedes agregar varios dominios; todos apuntan a la misma aplicación.

---

## 5) Probar en tu PC (opcional)

Si quieres probar cambios antes de publicarlos:

1. Crea el archivo **`.env`** en esta carpeta con:
   ```
   DATABASE_URL=cadena-de-conexion-supabase
   ```
2. Ejecuta:
   ```
   npm install
   npm start
   ```
3. Abre `http://localhost:3000`.

---

## Cómo usarla

- **Personas**: agrega a cada dueño del dinero. No se puede eliminar una persona que tenga movimientos (elimina primero sus movimientos).
- **Movimientos** (sin límite):
  - **Ingreso**: dinero que deposita o llega para una persona.
  - **Egreso**: retiro o pago hecho con el dinero de una persona.
  - **Transferencia**: movimiento entre dos personas dentro de la misma cuenta.
- **Resumen**: muestra el saldo de cada persona y el total en la cuenta. Toca a una persona para ver solo sus movimientos.
- **Filtros**: por persona, tipo y búsqueda por nota.

---

## Seguridad y datos

- La contraseña se guarda cifrada (scrypt). Las sesiones se guardan en la tabla `sessions`.
- Todos los movimientos usan consultas parametrizadas (protegidas contra inyección SQL).
- **Respaldos**: Supabase hace backups automáticos del proyecto. También puedes descargar las tablas desde **Project Settings → Database → Backups**.
- En producción (Vercel) no compartas tu enlace público con desconocidos: quien tenga la contraseña puede ver y modificar los movimientos.
- El `DATABASE_URL` es una credencial privada: **nunca la subas a un repositorio público** (el archivo `.env` ya está en `.gitignore`).

---

## Cómo está hecho

```
public/              → la interfaz (HTML, CSS, JS)
api/                 → funciones serverless (Vercel)
api/_lib.js          → conexión a Supabase y lógica compartida
supabase.sql         → esquema de la base de datos
server.js            → servidor local para desarrollo (usa la misma API)
vercel.json          → configuración de Vercel
```