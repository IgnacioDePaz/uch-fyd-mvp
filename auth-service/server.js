// Servicio de autenticación: registra e inicia sesiones, y permite administrar usuarios.
require("dotenv").config();

const crypto = require("node:crypto");
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const PORT = Number(process.env.PORT || 3000);
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

for (const [name, value] of Object.entries({
  MONGODB_URI,
  JWT_SECRET,
  ADMIN_API_KEY,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
})) {
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
}

if (JWT_SECRET.length < 32 || ADMIN_API_KEY.length < 32) {
  throw new Error("JWT_SECRET and ADMIN_API_KEY must be at least 32 characters");
}

if (ADMIN_PASSWORD.length < 12 || ADMIN_PASSWORD.length > 72) {
  throw new Error("ADMIN_PASSWORD must be between 12 and 72 characters");
}

if (!isValidEmail(ADMIN_EMAIL.trim().toLowerCase())) {
  throw new Error("ADMIN_EMAIL must be a valid email address");
}

const userSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    rol: {
      type: String,
      enum: ["usuario", "administrador"],
      default: "usuario",
      required: true,
    },
    estado: {
      type: String,
      enum: ["inactivo", "activo"],
      default: "inactivo",
      required: true,
    },
  },
  { timestamps: true },
);

const User = mongoose.model("User", userSchema);
const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));

app.get("/health", (_req, res) => {
  const connected = mongoose.connection.readyState === 1;
  return res.status(connected ? 200 : 503).json({
    status: connected ? "ok" : "unavailable",
    database: connected ? "connected" : "disconnected",
  });
});

app.post("/auth/register", async (req, res) => {
  const { nombre, email, password } = req.body || {};
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

  if (
    typeof nombre !== "string" ||
    !nombre.trim() ||
    nombre.trim().length > 100 ||
    !isValidEmail(normalizedEmail) ||
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 72
  ) {
    return res.status(400).json({
      error: "Datos inválidos: nombre, email válido y contraseña de 8 a 72 caracteres son requeridos",
    });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const user = await User.create({
      nombre: nombre.trim(),
      email: normalizedEmail,
      passwordHash,
    });

    return res.status(201).json({
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      estado: user.estado,
      message: "Cuenta registrada. Debe ser aprobada por un administrador antes de iniciar sesión.",
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: "Ya existe una cuenta con ese email" });
    }
    throw error;
  }
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

  if (!isValidEmail(normalizedEmail) || typeof password !== "string") {
    return res.status(400).json({ error: "Email o contraseña inválidos" });
  }

  const user = await User.findOne({ email: normalizedEmail }).select("+passwordHash");
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Email o contraseña inválidos" });
  }

  if (user.estado !== "activo") {
    return res.status(403).json({ error: "La cuenta está pendiente de aprobación" });
  }

  const token = jwt.sign(
    { sub: user.id, rol: user.rol, estado: user.estado },
    JWT_SECRET,
    { expiresIn: "1h" },
  );
  return res.json({
    token,
    tokenType: "Bearer",
    expiresIn: 3600,
    user: {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
      estado: user.estado,
    },
  });
});

app.get("/admin/users/pending", requireAdminJwt, async (_req, res) => {
  const users = await User.find({ estado: "inactivo" })
    .sort({ createdAt: 1 })
    .select("nombre email createdAt");

  return res.json({
    users: users.map((user) => ({
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      createdAt: user.createdAt,
    })),
  });
});

app.post("/admin/users/:id/approve", requireAdminOrKey, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "ID de usuario inválido" });
  }

  const user = await User.findById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: "Usuario no encontrado" });
  }
  if (user.estado === "activo") {
    return res.status(409).json({ error: "El usuario ya está activo" });
  }

  user.estado = "activo";
  await user.save();

  return res.json({
    id: user.id,
    nombre: user.nombre,
    email: user.email,
    estado: user.estado,
  });
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

function isValidEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function requireAdminOrKey(req, res, next) {
  const providedKey = req.get("x-admin-api-key") || "";
  const providedBuffer = Buffer.from(providedKey);
  const expectedBuffer = Buffer.from(ADMIN_API_KEY);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return requireAdminJwt(req, res, next);
  }

  return next();
}

function requireAdminJwt(req, res, next) {
  const authorization = req.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ error: "No autorizado" });
  }

  let claims;
  try {
    claims = jwt.verify(match[1], JWT_SECRET);
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: "Token inválido o expirado" });
    }
    throw error;
  }

  if (
    !claims ||
    typeof claims !== "object" ||
    claims.rol !== "administrador" ||
    claims.estado !== "activo"
  ) {
    return res.status(403).json({ error: "Se requiere una cuenta de administrador activa" });
  }

  return next();
}

async function ensureAdminAccount() {
  const email = ADMIN_EMAIL.trim().toLowerCase();
  const existingAdmin = await User.findOne({ email });

  if (existingAdmin) {
    if (existingAdmin.rol !== "administrador" || existingAdmin.estado !== "activo") {
      throw new Error(
        `ADMIN_EMAIL ${email} is already registered as a non-admin or inactive account`,
      );
    }
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await User.create({
    nombre: "Administrador",
    email,
    passwordHash,
    rol: "administrador",
    estado: "activo",
  });
  console.log(`Created administrator account for ${email}`);
}

async function start() {
  await mongoose.connect(MONGODB_URI);
  await ensureAdminAccount();
  app.listen(PORT, () => {
    console.log(`Auth service listening on port ${PORT}`);
  });
}

start().catch((error) => {
  console.error("Could not start auth service:", error);
  process.exitCode = 1;
});
