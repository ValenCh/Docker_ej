import React from "react";

/**
 * Banner que se muestra cuando el backend informa que la base de datos
 * no esta disponible (HTTP 503) o cuando directamente no se puede
 * contactar al backend. Esta es la evidencia visual de que la app
 * "no crashea": sigue funcionando, informa el problema de forma clara y
 * ofrece reintentar.
 */
export default function StatusBanner({ visible, message, onRetry, retrying }) {
  if (!visible) return null;

  return (
    <div role="alert" className="status-banner">
      <div className="status-banner__icon">⚠️</div>
      <div className="status-banner__text">
        <strong>Servicio no disponible.</strong>
        <span>{message}</span>
      </div>
      <button className="status-banner__retry" onClick={onRetry} disabled={retrying}>
        {retrying ? "Reintentando..." : "Reintentar"}
      </button>
    </div>
  );
}
