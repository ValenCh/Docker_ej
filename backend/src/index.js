"use strict";

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const { ensureSchema } = require("./db/init");
const tareasRouter = require("./routes/tareas");
const healthRouter = require("./routes/health");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");

const app = express();
const PORT = Number(process.env.PORT) || 4000;

// --- Seguridad basica a nivel aplicacion (complementa el hardening de Docker) ---
app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || true,
  })
);
app.use(express.json({ limit: "100kb" }));

// Limite de requests para mitigar abuso / fuerza bruta sobre la API.
app.use(
  "/api",
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// --- Rutas ---
app.use("/api/health", healthRouter);
app.use("/api/tareas", tareasRouter);

app.use(notFoundHandler);
app.use(errorHandler);

// --- Manejo global defensivo (red de seguridad adicional) ---
// Estos handlers son el ultimo recurso: capturan errores que se escaparon
// de cualquier try/catch o del pool.on("error"). Loguean en vez de dejar
// que el proceso muera de forma abrupta y sin registro.
process.on("unhandledRejection", (reason) => {
  console.error("[process] unhandledRejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[process] uncaughtException:", err);
  // No hacemos process.exit() aca a proposito: para la prueba de chaos
  // testing queremos que el backend siga respondiendo. Los errores de DB ya
  // estan controlados antes de llegar aca (ver src/db/pool.js).
});

let server;

async function start() {
  // Intenta preparar el esquema, pero NO bloquea el arranque del servidor
  // HTTP si la base de datos todavia no esta lista o esta caida: el server
  // debe poder levantar igual y responder 503 en los endpoints que la usan.
  ensureSchema().catch((err) => {
    console.error("[startup] Error preparando el esquema (no bloqueante):", err.message);
  });

  server = app.listen(PORT, () => {
    console.log(`[backend] Escuchando en el puerto ${PORT} (entorno: ${process.env.NODE_ENV || "development"})`);
  });
}

function shutdown(signal) {
  console.log(`[backend] Señal ${signal} recibida, cerrando servidor de forma ordenada...`);
  if (server) {
    server.close(() => {
      console.log("[backend] Servidor HTTP cerrado.");
      process.exit(0);
    });
    // Si no cierra en 10s, forzamos salida.
    setTimeout(() => process.exit(1), 10000).unref();
  } else {
    process.exit(0);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

start();

module.exports = app;
