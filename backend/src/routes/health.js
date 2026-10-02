"use strict";

const { Router } = require("express");
const { checkDbHealth } = require("../db/pool");

const router = Router();

// Liveness: el proceso esta arriba. No consulta la DB.
// Usado por Docker HEALTHCHECK para saber si el contenedor sigue vivo.
router.get("/", (req, res) => {
  res.json({ status: "ok", service: "backend" });
});

// Readiness: consulta la DB. Si esta caida, responde 503 (no crashea).
// Ideal para probar la caida de la base de datos con curl:
//   curl -i http://localhost:8080/api/health/db
router.get("/db", async (req, res) => {
  const health = await checkDbHealth();
  if (health.ok) {
    return res.json({ status: "ok", db: "up" });
  }
  return res.status(503).json({
    status: "degraded",
    db: "down",
    message: "Base de datos no disponible en este momento.",
  });
});

module.exports = router;
