// Servicio principal: consulta el catálogo y procesa pedidos autenticados.
require("dotenv").config();

const express = require("express");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const PORT = Number(process.env.PORT || 3001);
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET environment variable must be at least 32 characters");
}
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("PORT must be a valid TCP port");
}

const pool = new Pool({ connectionString: DATABASE_URL });
const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    return res.json({ status: "ok", database: "connected" });
  } catch (error) {
    console.error("Database health check failed:", error);
    return res.status(503).json({ status: "unavailable", database: "disconnected" });
  }
});

app.get("/catalog/articles", async (_req, res) => {
  const result = await pool.query(
    `SELECT code AS "codigo", name AS "nombre", stock AS "stockDisponible",
            unit_price AS "precioUnitario"
     FROM articles
     ORDER BY name, code`,
  );
  return res.json({ articles: result.rows });
});

app.get("/catalog/articles/:code", async (req, res) => {
  const result = await pool.query(
    `SELECT code AS "codigo", name AS "nombre", stock AS "stockDisponible",
            unit_price AS "precioUnitario"
     FROM articles
     WHERE code = $1`,
    [req.params.code],
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Artículo no encontrado" });
  }
  return res.json(result.rows[0]);
});

app.post("/orders", requireAuthentication, async (req, res) => {
  const { cliente, codigoArticulo, cantidad } = req.body || {};
  const customerName = typeof cliente === "string" ? cliente.trim() : "";
  const articleCode = typeof codigoArticulo === "string" ? codigoArticulo.trim() : "";

  if (
    !customerName ||
    customerName.length > 160 ||
    !articleCode ||
    articleCode.length > 64 ||
    !Number.isSafeInteger(cantidad) ||
    cantidad < 1
  ) {
    return res.status(400).json({
      error: "Datos inválidos: cliente, código de artículo y cantidad entera positiva son requeridos",
    });
  }

  const client = await pool.connect();
  let transactionOpen = false;

  try {
    await client.query("BEGIN");
    transactionOpen = true;

    const articleResult = await client.query(
      "SELECT code, stock FROM articles WHERE code = $1 FOR UPDATE",
      [articleCode],
    );
    if (articleResult.rowCount === 0) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return res.status(404).json({ error: "Artículo no encontrado" });
    }

    if (articleResult.rows[0].stock < cantidad) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return res.status(409).json({ error: "Stock insuficiente" });
    }

    const orderResult = await client.query(
      `INSERT INTO orders
         (user_id, customer_name, article_code, quantity, unit_price, total_amount)
       SELECT $1, $2, code, $3, unit_price, unit_price * $5
       FROM articles
       WHERE code = $4
       RETURNING order_number, order_date, user_id, customer_name,
                 article_code, quantity, unit_price, total_amount`,
      [req.userId, customerName, cantidad, articleCode, cantidad],
    );

    await client.query(
      "UPDATE articles SET stock = stock - $1 WHERE code = $2",
      [cantidad, articleCode],
    );
    await client.query("COMMIT");
    transactionOpen = false;

    const order = orderResult.rows[0];
    return res.status(201).json({
      numero: order.order_number,
      fecha: order.order_date,
      usuario: order.user_id,
      cliente: order.customer_name,
      codigoArticulo: order.article_code,
      cantidad: order.quantity,
      precioUnitarioHistorico: order.unit_price,
      importeTotal: order.total_amount,
    });
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Could not roll back order transaction:", rollbackError);
      }
    }
    throw error;
  } finally {
    client.release();
  }
});

app.use((error, _req, res, _next) => {
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ error: "El cuerpo de la solicitud debe ser JSON válido" });
  }
  if (error.type === "entity.too.large") {
    return res.status(413).json({ error: "El cuerpo de la solicitud supera el tamaño permitido" });
  }

  console.error(error);
  return res.status(500).json({ error: "Error interno del servidor" });
});

function requireAuthentication(req, res, next) {
  const [scheme, token, ...extra] = (req.get("authorization") || "").split(" ");
  if (scheme !== "Bearer" || !token || extra.length > 0) {
    return res.status(401).json({ error: "Se requiere un token Bearer" });
  }

  try {
    const claims = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    if (
      typeof claims.sub !== "string" ||
      !claims.sub ||
      claims.estado !== "activo" ||
      !["usuario", "administrador"].includes(claims.rol)
    ) {
      return res.status(401).json({ error: "Token inválido" });
    }
    req.userId = claims.sub;
    return next();
  } catch (_error) {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
}

async function start() {
  await pool.query("SELECT 1");
  const server = app.listen(PORT, () => {
    console.log(`Core service listening on port ${PORT}`);
  });

  const shutdown = () => {
    server.close(async (error) => {
      if (error) {
        console.error("Could not close the HTTP server cleanly:", error);
        process.exitCode = 1;
      }
      await pool.end();
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

start().catch(async (error) => {
  console.error("Could not start core service:", error);
  await pool.end();
  process.exitCode = 1;
});
