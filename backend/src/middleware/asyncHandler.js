"use strict";

/**
 * Envuelve un handler async para que cualquier excepcion (incluida
 * ServiceUnavailableError lanzada por src/db/pool.js) llegue al
 * errorHandler central en vez de colgar la request o tirar el proceso.
 */
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
