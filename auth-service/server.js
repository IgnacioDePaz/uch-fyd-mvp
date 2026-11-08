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

for (const [name, value] of Object.entries({
  MONGODB_URI,
  JWT_SECRET,
  ADMIN_API_KEY,
})) {
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
}

if (JWT_SECRET.length < 32 || ADMIN_API_KEY.length < 32) {
  throw new Error("JWT_SECRET and ADMIN_API_KEY must be at least 32 characters");
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

app.post("/admin/users/:id/approve", requireAdminKey, async (req, res) => {
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

function requireAdminKey(req, res, next) {
  const providedKey = req.get("x-admin-api-key") || "";
  const providedBuffer = Buffer.from(providedKey);
  const expectedBuffer = Buffer.from(ADMIN_API_KEY);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return res.status(401).json({ error: "No autorizado" });
  }

  return next();
}

async function start() {
  await mongoose.connect(MONGODB_URI);
  app.listen(PORT, () => {
    console.log(`Auth service listening on port ${PORT}`);
  });
}

start().catch((error) => {
  console.error("Could not start auth service:", error);
  process.exitCode = 1;
});
