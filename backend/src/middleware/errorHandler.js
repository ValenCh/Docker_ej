"use strict";

/**
 * Middleware central de manejo de errores.
 *
 * Traduce excepciones a respuestas HTTP consistentes y "amigables" para el
 * frontend, sin exponer stack traces ni detalles internos. Este es el punto
 * donde se cumple el requisito de la prueba de resiliencia: los errores de
 * conectividad con la base de datos (marcados como ServiceUnavailableError,
 * ver src/db/pool.js) se traducen a 503, no a un 500 generico ni a un
 * crash del proceso.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;

  if (statusCode >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl} ->`, err.message);
  } else {
    console.warn(`[warn] ${req.method} ${req.originalUrl} ->`, err.message);
  }

  const errorCodeByStatus = {
    400: "bad_request",
    404: "not_found",
    503: "service_unavailable",
  };

  const body = {
    error: errorCodeByStatus[statusCode] || "internal_error",
    message:
      err.isOperational || statusCode < 500
        ? err.message
        : "Ocurrio un error inesperado en el servidor.",
  };

  if (statusCode === 503) {
    // Sugerimos al cliente reintentar en unos segundos.
    res.set("Retry-After", "5");
  }

  res.status(statusCode).json(body);
}

function notFoundHandler(req, res) {
  res.status(404).json({
    error: "not_found",
    message: `Recurso no encontrado: ${req.method} ${req.originalUrl}`,
  });
}

module.exports = { errorHandler, notFoundHandler };
