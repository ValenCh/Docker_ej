-- Este script se ejecuta automaticamente la PRIMERA vez que se crea el
-- volumen de datos de Postgres (Docker monta todo lo que hay en
-- /docker-entrypoint-initdb.d/ y lo corre en orden alfabetico).
--
-- Es idempotente (IF NOT EXISTS) y ademas el backend vuelve a asegurar el
-- esquema al arrancar (ver backend/src/db/init.js) como capa extra de
-- resiliencia: si algun dia se cambia de motor de inicializacion, el
-- backend igual puede crear la tabla que necesita.

CREATE TABLE IF NOT EXISTS tareas (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(200) NOT NULL,
    descripcion TEXT,
    completada BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Datos de ejemplo para no arrancar con la app vacia.
INSERT INTO tareas (titulo, descripcion, completada)
VALUES
    ('Levantar el entorno con docker compose', 'Verificar que db, backend, frontend y proxy queden healthy', TRUE),
    ('Probar el CRUD desde el frontend', 'Crear, editar, marcar como completada y borrar una tarea', FALSE),
    ('Simular la caida de la base de datos', 'docker stop <contenedor_db> y verificar que la API responda 503', FALSE)
ON CONFLICT DO NOTHING;
