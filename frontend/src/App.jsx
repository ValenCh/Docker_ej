import React, { useCallback, useEffect, useRef, useState } from "react";
import { api, ServiceUnavailableError } from "./api.js";
import TaskForm from "./components/TaskForm.jsx";
import TaskList from "./components/TaskList.jsx";
import StatusBanner from "./components/StatusBanner.jsx";

const AUTO_RETRY_INTERVAL_MS = 5000;

export default function App() {
  const [tareas, setTareas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [down, setDown] = useState(false);
  const [downMessage, setDownMessage] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [genericError, setGenericError] = useState(null);
  const pollRef = useRef(null);

  const loadTareas = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.listTareas();
      setTareas(data);
      setDown(false);
      setDownMessage("");
      setGenericError(null);
    } catch (err) {
      if (err instanceof ServiceUnavailableError) {
        // Este es el escenario del chaos test: el backend respondio 503
        // (o no respondio) porque la base de datos esta caida. La UI NO
        // se rompe: muestra un banner claro y sigue funcionando.
        setDown(true);
        setDownMessage(err.message);
      } else {
        setGenericError(err.message);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTareas();
  }, [loadTareas]);

  // Mientras el servicio este caido, reintentamos automaticamente cada
  // pocos segundos para detectar la recuperacion (por ejemplo, cuando en
  // el chaos test se hace `docker start <db_container>` de nuevo) sin que
  // el usuario tenga que hacer nada.
  useEffect(() => {
    if (down) {
      pollRef.current = setInterval(() => {
        loadTareas({ silent: true });
      }, AUTO_RETRY_INTERVAL_MS);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [down, loadTareas]);

  async function handleCreate(data) {
    try {
      const nueva = await api.createTarea(data);
      setTareas((prev) => [nueva, ...prev]);
      setDown(false);
    } catch (err) {
      if (err instanceof ServiceUnavailableError) {
        setDown(true);
        setDownMessage(err.message);
      } else {
        setGenericError(err.message);
      }
    }
  }

  async function handleToggle(tarea) {
    try {
      const actualizada = await api.updateTarea(tarea.id, { completada: !tarea.completada });
      setTareas((prev) => prev.map((t) => (t.id === tarea.id ? actualizada : t)));
    } catch (err) {
      if (err instanceof ServiceUnavailableError) {
        setDown(true);
        setDownMessage(err.message);
      } else {
        setGenericError(err.message);
      }
    }
  }

  async function handleDelete(tarea) {
    try {
      await api.deleteTarea(tarea.id);
      setTareas((prev) => prev.filter((t) => t.id !== tarea.id));
    } catch (err) {
      if (err instanceof ServiceUnavailableError) {
        setDown(true);
        setDownMessage(err.message);
      } else {
        setGenericError(err.message);
      }
    }
  }

  async function handleManualRetry() {
    setRetrying(true);
    await loadTareas({ silent: true });
    setRetrying(false);
  }

  return (
    <div className="app">
      <header className="app__header">
        <h1>Gestor de Tareas</h1>
        <p className="app__subtitle">
          TP Docker: Node.js + Express &middot; React (Vite) &middot; PostgreSQL &middot; Nginx (reverse proxy)
        </p>
      </header>

      <StatusBanner
        visible={down}
        message={downMessage}
        onRetry={handleManualRetry}
        retrying={retrying}
      />

      {genericError && !down && (
        <div className="generic-error" role="alert">
          {genericError}
        </div>
      )}

      <main className="app__main">
        <TaskForm onSubmit={handleCreate} disabled={down} />

        {loading ? (
          <p className="loading-state">Cargando tareas...</p>
        ) : (
          <TaskList tareas={tareas} onToggle={handleToggle} onDelete={handleDelete} disabled={down} />
        )}
      </main>

      <footer className="app__footer">
        <small>
          Estado del backend/DB se revisa automaticamente. Si detiene el contenedor de la base de
          datos vera este banner sin que la aplicacion deje de responder.
        </small>
      </footer>
    </div>
  );
}
