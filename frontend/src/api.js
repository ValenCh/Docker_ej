// Cliente de la API. Todas las llamadas van a rutas relativas ("/api/...")
// para que, en produccion, sea el reverse proxy (Nginx) el que decida a
// donde reenviarlas. Asi el frontend no necesita saber el host/puerto real
// del backend.

const BASE_URL = "/api";

/**
 * Error especifico para cuando el backend responde 503 (o directamente no
 * responde por caida de red/backend). Permite que la UI distinga "la base
 * de datos / el backend estan caidos" de otros errores (400, 404, etc.).
 */
export class ServiceUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = "ServiceUnavailableError";
  }
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch (networkError) {
    // fetch rechaza la promesa cuando ni siquiera se pudo establecer
    // conexion (proxy caido, sin red, etc.). Lo tratamos igual que un 503.
    throw new ServiceUnavailableError(
      "No se pudo contactar al servidor. Verifica tu conexion o intenta nuevamente."
    );
  }

  if (response.status === 503) {
    const body = await safeJson(response);
    throw new ServiceUnavailableError(
      body?.message || "Servicio no disponible temporalmente (la base de datos podria estar caida)."
    );
  }

  if (response.status === 204) {
    return null;
  }

  const body = await safeJson(response);

  if (!response.ok) {
    throw new Error(body?.message || `Error ${response.status}`);
  }

  return body;
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export const api = {
  listTareas: () => request("/tareas"),
  createTarea: (data) => request("/tareas", { method: "POST", body: JSON.stringify(data) }),
  updateTarea: (id, data) => request(`/tareas/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTarea: (id) => request(`/tareas/${id}`, { method: "DELETE" }),
  checkDbHealth: () => request("/health/db"),
};
