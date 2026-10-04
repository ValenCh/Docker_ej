"""Configuración de los backups: sale del .env del stack, con valores por defecto."""
import os
from dataclasses import dataclass

DB_PASSWORD = "cambiar_esta_password_segura"


@dataclass
class Config:
    contenedor: str = os.environ.get("DB_CONTAINER", "adr_db")
    base: str = os.environ.get("POSTGRES_DB", "adr_tp")
    usuario: str = os.environ.get("POSTGRES_USER", "adr_user")
    carpeta: str = os.environ.get("BACKUP_DIR", "backups")
    conservar: int = int(os.environ.get("BACKUP_CONSERVAR", "7"))


def cargar():
    return Config()
