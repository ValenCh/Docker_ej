import React, { useState } from "react";

export default function TaskForm({ onSubmit, disabled }) {
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!titulo.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({ titulo: titulo.trim(), descripcion: descripcion.trim() || null });
      setTitulo("");
      setDescripcion("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="task-form" onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Titulo de la tarea"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        disabled={disabled || submitting}
        maxLength={200}
        required
      />
      <input
        type="text"
        placeholder="Descripcion (opcional)"
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
        disabled={disabled || submitting}
      />
      <button type="submit" disabled={disabled || submitting}>
        {submitting ? "Guardando..." : "Agregar tarea"}
      </button>
    </form>
  );
}
