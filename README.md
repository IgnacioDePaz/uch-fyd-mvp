# uch-fyd-mvp
mvp integrador 

## Servicio de autenticación

El servicio Node.js de autenticación está en [`auth-service/`](./auth-service/). Guarda usuarios en MongoDB, protege las contraseñas con bcrypt, emite JWT para cuentas activas y crea las cuentas nuevas como inactivas hasta que un administrador las apruebe.

Variables de entorno requeridas:

- `MONGODB_URI`: cadena de conexión a MongoDB.
- `JWT_SECRET`: clave para firmar los JWT (al menos 32 caracteres).
- `ADMIN_API_KEY`: clave requerida para aprobar usuarios (al menos 32 caracteres).
- `ADMIN_EMAIL` y `ADMIN_PASSWORD`: credenciales de la cuenta administradora inicial (contraseña de 12 a 72 caracteres). La cuenta se crea al iniciar auth-service si aún no existe; cambiar estas variables después no cambia su contraseña.
- `PORT`: puerto HTTP opcional (por defecto `3000`).

Para ejecutarlo localmente: `cd auth-service && npm install && npm start`.

### Endpoints disponibles

- `GET /health`: estado del servicio y de la conexión a MongoDB.
- `POST /auth/register`: recibe `{ "nombre": "...", "email": "...", "password": "..." }` y crea una cuenta `inactivo`.
- `POST /auth/login`: recibe `{ "email": "...", "password": "..." }` y emite un JWT de una hora solo si la cuenta está `activo`; el token incluye ID, rol y estado.
- `GET /admin/users/pending`: devuelve las cuentas pendientes para una sesión administradora.
- `POST /admin/users/:id/approve`: activa una cuenta. Acepta una sesión administradora o `ADMIN_API_KEY` en el encabezado `x-admin-api-key`.

## Servicio core

El servicio separado [`core-service/`](./core-service/) implementa el catálogo y los pedidos del MVP sobre PostgreSQL con Node.js y Express. El catálogo es de consulta; la carga de artículos se realiza externamente, de acuerdo con el alcance definido. La caché Redis queda para una etapa posterior.

Variables requeridas: `DATABASE_URL` (conexión PostgreSQL) y `JWT_SECRET` (la misma clave que usa auth-service); `PORT` es opcional y por defecto es `3001`. Aplicar el esquema con `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f core-service/init.sql`; se pueden cargar artículos directamente en la tabla `articles`.

- `GET /health`: estado del servicio y PostgreSQL.
- `GET /catalog/articles` y `GET /catalog/articles/:code`: consulta del catálogo.
- `GET /catalog/recommendations`: recomienda hasta seis artículos disponibles al usuario autenticado. Compara los artículos de su historial con los de otros usuarios y, si aún no hay compras similares, prioriza los artículos más comprados. No requiere proveedor ni envía datos fuera del servicio.
- `POST /orders`: crea un pedido autenticado con JWT de usuario activo. Recibe `{ "cliente": "...", "codigoArticulo": "...", "cantidad": 1 }`; valida y descuenta stock en una transacción con bloqueo `SELECT FOR UPDATE`, y guarda el precio histórico y el total. Opcionalmente acepta `Idempotency-Key` (1–128 caracteres ASCII imprimibles sin espacios), que debe reutilizarse en reintentos de la misma operación. La clave se limita a cada usuario: repetirla con los mismos datos devuelve el pedido original sin volver a descontar stock; reutilizarla con datos distintos devuelve `409`. Sin este encabezado, se conserva el comportamiento actual.

El catálogo de la aplicación muestra recomendaciones personalizadas mediante filtrado colaborativo local basado en el historial de pedidos. Para usuarios sin historial, usa la popularidad general; si todavía no hay pedidos, muestra artículos disponibles. A medida que crecen los pedidos, las sugerencias pueden mejorar sin agregar dependencias ni servicios externos.

Para permitir reintentos seguros, cada operación debe usar un identificador estable y único:

```sh
curl -X POST http://localhost:3001/orders \
  -H 'Authorization: Bearer <JWT>' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: compra-<identificador-unico>' \
  -d '{"cliente":"Usuario de prueba","codigoArticulo":"ART-001","cantidad":1}'
```

Al usar una base PostgreSQL ya inicializada, aplicar la actualización de esquema sin volver a ejecutar `init.sql` (que también vuelve a cargar los artículos de ejemplo):

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -c 'ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128)' \
  -c 'CREATE UNIQUE INDEX IF NOT EXISTS orders_user_id_idempotency_key_idx ON orders (user_id, idempotency_key)' \
  -c 'CREATE INDEX IF NOT EXISTS orders_article_code_user_id_idx ON orders (article_code, user_id)'
```

## Levantar el MVP con Docker Compose

Docker Compose levanta MongoDB, PostgreSQL, auth-service, core-service, frontend y un gateway Nginx en una red privada, con volúmenes persistentes para las bases. El gateway publica la aplicación y enruta las solicitudes a los servicios. El montaje del esquema de PostgreSQL usa la etiqueta `Z` para que Fedora/SELinux permita al contenedor leerlo:

1. Copiar `.env.example` a `.env` y reemplazar las claves y credenciales de ejemplo por valores locales propios. No subir `.env` al repositorio.
2. Ejecutar `docker compose up --build -d`.
3. Comprobar el estado con `docker compose ps`; las bases y los servicios auth/core deben aparecer como `healthy`, y frontend/gateway como `running`.
4. Abrir la aplicación en `http://localhost:8080` y comprobar los servicios con `curl http://localhost:3000/health` y `curl http://localhost:3001/health`.

El frontend usa el gateway en el mismo origen: `/auth` y `/admin` se enrutan a auth-service, y `/catalog` y `/orders` a core-service. Auth y core también conservan sus puertos locales `3000` y `3001` para pruebas directas. PostgreSQL ejecuta `core-service/init.sql` al inicializar su volumen por primera vez; el script crea las tablas y carga 20 artículos de ejemplo. Si PostgreSQL ya tenía un volumen inicializado, los scripts de inicialización no se vuelven a ejecutar: carga el catálogo manualmente o recrea los datos locales con `docker compose down -v` (esto elimina los datos persistidos). MongoDB y PostgreSQL conservan sus datos en volúmenes Docker. Para detener los servicios sin borrar datos: `docker compose down`.

La cuenta administradora usa `ADMIN_EMAIL` y `ADMIN_PASSWORD` de `.env`. Al iniciar sesión en la página, abre el panel para aprobar compradores pendientes. Para registrar una cuenta compradora, usa el botón **Crear cuenta**; luego el administrador la aprueba desde ese panel.

También se puede registrar una cuenta por API:

```sh
curl -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"nombre":"Usuario de prueba","email":"prueba@example.com","password":"ClaveSegura123"}'
```

La respuesta incluye el `id` de la cuenta creada en estado `inactivo`. Como alternativa al panel, se puede aprobar reemplazando `<ID>` por ese valor y `<ADMIN_API_KEY de .env>` por la clave configurada localmente:

```sh
curl -X POST 'http://localhost:3000/admin/users/<ID>/approve' \
  -H 'x-admin-api-key: <ADMIN_API_KEY de .env>'
```

Luego iniciar sesión en `/auth/login` para obtener un JWT. Los artículos se cargan externamente en la tabla PostgreSQL `articles`; después de cargar uno, se puede crear un pedido autenticado en `POST /orders` con `Authorization: Bearer <JWT>`.
