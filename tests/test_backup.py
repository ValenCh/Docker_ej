from scripts.backup.backup_db import GestorBackups
from scripts.backup.config import Config


def gestor(tmp_path):
    return GestorBackups(Config(carpeta=str(tmp_path)))


def test_nombre_incluye_la_base(tmp_path):
    nombre = gestor(tmp_path).nombre_archivo("adr_tp")
    assert nombre.startswith("adr_tp_") and nombre.endswith(".sql.gz")


def test_ruta_segura_descarta_directorios(tmp_path):
    ruta = gestor(tmp_path).ruta_segura("../../etc/passwd")
    assert ruta == str(tmp_path / "passwd")


def test_checksum(tmp_path):
    archivo = tmp_path / "a.sql.gz"
    archivo.write_bytes(b"hola")
    assert len(gestor(tmp_path).checksum(str(archivo))) == 64
