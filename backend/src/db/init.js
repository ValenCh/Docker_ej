"use strict";

const { pool } = require("./pool");

/**
 * Crea la tabla `tareas` si no existe todavia. Se ejecuta al levantar el
 * backend. Si la DB no esta disponible en ese momento, no rompe el proceso:
 * queda registrado el error y el backend sigue vivo respondiendo 503 hasta
 * que la base de datos aparezca (por ejemplo, mientras el contenedor de
 * postgres todavia esta iniciando).
 */
async function ensureSchema(retries = 10, delayMs = 3000) {
  const sql = `
    CREATE TABLE IF NOT EXISTS tareas (
      id SERIAL PRIMARY KEY,
      titulo VARCHAR(200) NOT NULL,
      descripcion TEXT,
      completada BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query(sql);
      console.log("[db] Esquema verificado/creado correctamente.");
      return;
    } catch (err) {
      console.error(
        `[db] Intento ${attempt}/${retries} fallo al preparar el esquema: ${err.message}`
      );
      if (attempt === retries) {
        console.error(
          "[db] No se pudo preparar el esquema tras varios intentos. " +
            "El servidor seguira arriba y respondera 503 en los endpoints que usan la DB."
        );
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

module.exports = { ensureSchema };
