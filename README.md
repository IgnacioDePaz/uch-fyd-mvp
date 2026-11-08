# uch-fyd-mvp
mvp integrador 

## Servicio de autenticación

El servicio Node.js de autenticación está en [`auth-service/`](./auth-service/). Guarda usuarios en MongoDB, protege las contraseñas con bcrypt, emite JWT para cuentas activas y crea las cuentas nuevas como inactivas hasta que un administrador las apruebe.

Variables de entorno requeridas:

- `MONGODB_URI`: cadena de conexión a MongoDB.
- `JWT_SECRET`: clave para firmar los JWT (al menos 32 caracteres).
- `ADMIN_API_KEY`: clave requerida para aprobar usuarios (al menos 32 caracteres).
- `PORT`: puerto HTTP opcional (por defecto `3000`).

Para ejecutarlo localmente: `cd auth-service && npm install && npm start`.

### Endpoints disponibles

- `GET /health`: estado del servicio y de la conexión a MongoDB.
- `POST /auth/register`: recibe `{ "nombre": "...", "email": "...", "password": "..." }` y crea una cuenta `inactivo`.
- `POST /auth/login`: recibe `{ "email": "...", "password": "..." }` y emite un JWT de una hora solo si la cuenta está `activo`; el token incluye ID, rol y estado.
- `POST /admin/users/:id/approve`: activa una cuenta. Enviar `ADMIN_API_KEY` en el encabezado `x-admin-api-key`.

## Servicio core

El servicio separado [`core-service/`](./core-service/) implementa el catálogo y los pedidos del MVP sobre PostgreSQL con Node.js y Express. El catálogo es de consulta; la carga de artículos se realiza externamente, de acuerdo con el alcance definido. La caché Redis queda para una etapa posterior.

Variables requeridas: `DATABASE_URL` (conexión PostgreSQL) y `JWT_SECRET` (la misma clave que usa auth-service); `PORT` es opcional y por defecto es `3001`. Aplicar el esquema con `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f core-service/init.sql`; se pueden cargar artículos directamente en la tabla `articles`.

- `GET /health`: estado del servicio y PostgreSQL.
- `GET /catalog/articles` y `GET /catalog/articles/:code`: consulta del catálogo.
- `POST /orders`: crea un pedido autenticado con JWT de usuario activo. Recibe `{ "cliente": "...", "codigoArticulo": "...", "cantidad": 1 }`; valida y descuenta stock en una transacción con bloqueo `SELECT FOR UPDATE`, y guarda el precio histórico y el total.

## Levantar el MVP con Docker Compose

Docker Compose levanta MongoDB, PostgreSQL, auth-service y core-service en una red privada, con volúmenes persistentes para las bases. El montaje del esquema de PostgreSQL usa la etiqueta `Z` para que Fedora/SELinux permita al contenedor leerlo:

1. Copiar `.env.example` a `.env` y reemplazar las claves de ejemplo por valores locales propios. No subir `.env` al repositorio.
2. Ejecutar `docker compose up --build -d`.
3. Comprobar el estado con `docker compose ps`; los servicios deben aparecer como `healthy`.
4. Probar los endpoints: `curl http://localhost:3000/health` y `curl http://localhost:3001/health`.

Auth queda disponible en `http://localhost:3000` y core en `http://localhost:3001`. PostgreSQL ejecuta `core-service/init.sql` al inicializar su volumen por primera vez; MongoDB y PostgreSQL conservan sus datos en volúmenes Docker. Para detener los servicios sin borrar datos: `docker compose down`. Para borrar también las bases locales: `docker compose down -v`.

Para registrar y aprobar una cuenta:

```sh
curl -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"nombre":"Usuario de prueba","email":"prueba@example.com","password":"ClaveSegura123"}'
```

La respuesta incluye el `id` de la cuenta creada en estado `inactivo`. Aprobarla reemplazando `<ID>` por ese valor y `<ADMIN_API_KEY de .env>` por la clave configurada localmente:

```sh
curl -X POST http://localhost:3000/admin/users/<ID>/approve \
  -H 'x-admin-api-key: <ADMIN_API_KEY de .env>'
```

Luego iniciar sesión en `/auth/login` para obtener un JWT. Los artículos se cargan externamente en la tabla PostgreSQL `articles`; después de cargar uno, se puede crear un pedido autenticado en `POST /orders` con `Authorization: Bearer <JWT>`.
