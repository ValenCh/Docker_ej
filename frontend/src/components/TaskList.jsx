import React from "react";

export default function TaskList({ tareas, onToggle, onDelete, disabled }) {
  if (tareas.length === 0) {
    return <p className="empty-state">No hay tareas todavia. Agrega la primera arriba.</p>;
  }

  return (
    <ul className="task-list">
      {tareas.map((tarea) => (
        <li key={tarea.id} className={`task-item ${tarea.completada ? "task-item--done" : ""}`}>
          <label>
            <input
              type="checkbox"
              checked={tarea.completada}
              disabled={disabled}
              onChange={() => onToggle(tarea)}
            />
            <div>
              <div className="task-item__title">{tarea.titulo}</div>
              {tarea.descripcion && <div className="task-item__desc">{tarea.descripcion}</div>}
            </div>
          </label>
          <button
            className="task-item__delete"
            disabled={disabled}
            onClick={() => onDelete(tarea)}
            aria-label={`Borrar tarea ${tarea.titulo}`}
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}
