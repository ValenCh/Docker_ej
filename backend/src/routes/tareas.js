"use strict";

const { Router } = require("express");
const { query } = require("../db/pool");
const { asyncHandler } = require("../middleware/asyncHandler");

const router = Router();

class BadRequestError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 400;
    this.isOperational = true;
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 404;
    this.isOperational = true;
  }
}

function validateTareaBody(body, { partial = false } = {}) {
  const { titulo, descripcion, completada } = body || {};

  if (!partial || titulo !== undefined) {
    if (typeof titulo !== "string" || titulo.trim().length === 0) {
      throw new BadRequestError("El campo 'titulo' es obligatorio y debe ser un texto no vacio.");
    }
    if (titulo.length > 200) {
      throw new BadRequestError("El campo 'titulo' no puede superar los 200 caracteres.");
    }
  }

  if (descripcion !== undefined && descripcion !== null && typeof descripcion !== "string") {
    throw new BadRequestError("El campo 'descripcion' debe ser un texto.");
  }

  if (completada !== undefined && typeof completada !== "boolean") {
    throw new BadRequestError("El campo 'completada' debe ser true o false.");
  }
}

// GET /api/tareas
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const result = await query(
      "SELECT id, titulo, descripcion, completada, created_at FROM tareas ORDER BY created_at DESC"
    );
    res.json(result.rows);
  })
);

// GET /api/tareas/:id
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new BadRequestError("El id debe ser numerico.");

    const result = await query(
      "SELECT id, titulo, descripcion, completada, created_at FROM tareas WHERE id = $1",
      [id]
    );
    if (result.rows.length === 0) throw new NotFoundError(`No existe la tarea con id ${id}.`);
    res.json(result.rows[0]);
  })
);

// POST /api/tareas
router.post(
  "/",
  asyncHandler(async (req, res) => {
    validateTareaBody(req.body);
    const { titulo, descripcion = null, completada = false } = req.body;

    const result = await query(
      `INSERT INTO tareas (titulo, descripcion, completada)
       VALUES ($1, $2, $3)
       RETURNING id, titulo, descripcion, completada, created_at`,
      [titulo.trim(), descripcion, completada]
    );
    res.status(201).json(result.rows[0]);
  })
);

// PUT /api/tareas/:id
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new BadRequestError("El id debe ser numerico.");
    validateTareaBody(req.body, { partial: true });

    const existing = await query("SELECT id FROM tareas WHERE id = $1", [id]);
    if (existing.rows.length === 0) throw new NotFoundError(`No existe la tarea con id ${id}.`);

    const { titulo, descripcion, completada } = req.body;
    const result = await query(
      `UPDATE tareas SET
         titulo = COALESCE($1, titulo),
         descripcion = COALESCE($2, descripcion),
         completada = COALESCE($3, completada)
       WHERE id = $4
       RETURNING id, titulo, descripcion, completada, created_at`,
      [titulo ?? null, descripcion ?? null, completada ?? null, id]
    );
    res.json(result.rows[0]);
  })
);

// DELETE /api/tareas/:id
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new BadRequestError("El id debe ser numerico.");

    const result = await query("DELETE FROM tareas WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) throw new NotFoundError(`No existe la tarea con id ${id}.`);
    res.status(204).send();
  })
);

module.exports = router;
