"use strict";

const { Pool } = require("pg");

/**
 * Pool de conexiones a PostgreSQL.
 *
 * PUNTO CLAVE PARA LA PRUEBA DE CHAOS TESTING:
 * -------------------------------------------
 * Cuando se hace `docker stop <db_container>` mientras el pool tiene clientes
 * inactivos (idle), pg emite un evento "error" sobre esos clientes. Si ese
 * evento no se escucha, Node.js lo trata como una excepcion no capturada y
 * el proceso del backend se cae (crash) por completo.
 *
 * Por eso registramos un listener en `pool.on("error", ...)`: esto evita que
 * el backend crashee cuando la base de datos se cae de forma abrupta. El
 * pool simplemente descarta el cliente roto y, en la siguiente query,
 * intenta abrir una conexion nueva (reintento implicito de `pg`).
 */
const pool = new Pool({
  host: process.env.PGHOST || "db",
  port: Number(process.env.PGPORT) || 5432,
  database: process.env.POSTGRES_DB || "adr_tp",
  user: process.env.POSTGRES_USER || "adr_user",
  password: process.env.POSTGRES_PASSWORD || "postgres",
  max: 10,
  idleTimeoutMillis: 30000,
  // Si la DB esta caida, no queremos que una request quede colgada
  // esperando para siempre: fallamos rapido y devolvemos 503.
  connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS) || 3000,
});

pool.on("error", (err) => {
  // No relanzar el error: solo loguear. Esto es lo que evita el crash
  // del proceso cuando la base de datos se cae abruptamente.
  console.error(
    "[db] Error inesperado en un cliente inactivo del pool (la DB puede estar caida):",
    err.message
  );
});

/**
 * Codigos de error de `pg` / Node que indican que el problema es de
 * DISPONIBILIDAD de la base de datos (no un error de programacion ni de
 * datos invalidos). Ante estos, el backend debe responder 503, no 500.
 */
const CONNECTION_ERROR_CODES = new Set([
  "ECONNREFUSED", // el contenedor de la DB esta parado / puerto cerrado
  "ECONNRESET", // la conexion se cerro abruptamente (docker stop)
  "EHOSTUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT",
  "57P01", // admin_shutdown (postgres se esta apagando)
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
]);

class ServiceUnavailableError extends Error {
  constructor(message = "No se pudo conectar con la base de datos") {
    super(message);
    this.name = "ServiceUnavailableError";
    this.statusCode = 503;
    this.isOperational = true;
  }
}

function isConnectionError(err) {
  if (!err) return false;
  if (CONNECTION_ERROR_CODES.has(err.code)) return true;
  // pg tira este mensaje generico cuando el timeout de conexion expira
  if (typeof err.message === "string" && /timeout/i.test(err.message)) {
    return true;
  }
  return false;
}

/**
 * Wrapper de queries: si la falla es de conectividad con la DB, la
 * convertimos en un ServiceUnavailableError (503) en lugar de dejar que
 * explote como un 500 generico o, peor, tumbe el proceso.
 */
async function query(text, params) {
  try {
    return await pool.query(text, params);
  } catch (err) {
    if (isConnectionError(err)) {
      console.error("[db] Error de conectividad con la base de datos:", err.message);
      throw new ServiceUnavailableError(
        "Base de datos no disponible en este momento. Intenta nuevamente en unos segundos."
      );
    }
    // Cualquier otro error (SQL invalido, constraint violado, etc.) sigue
    // su curso normal para ser tratado como 400/500 en el error handler.
    throw err;
  }
}

/**
 * Chequeo de salud de la conexion a la base de datos, con timeout corto.
 * Usado por /api/health/db y por el HEALTHCHECK del Dockerfile.
 */
async function checkDbHealth() {
  try {
    await pool.query("SELECT 1");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { pool, query, checkDbHealth, isConnectionError, ServiceUnavailableError };
