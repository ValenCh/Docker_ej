"""Backup y restauración de la base PostgreSQL del stack.

Uso:
    python -m scripts.backup.backup_db crear
    python -m scripts.backup.backup_db listar
    python -m scripts.backup.backup_db restaurar adr_tp_20261003_080000.sql.gz
"""
import argparse
import hashlib
import logging
import os
import subprocess
from datetime import datetime

from scripts.backup.config import cargar

log = logging.getLogger("backup")


class GestorBackups:
    def __init__(self, config):
        self.config = config
        os.makedirs(config.carpeta, exist_ok=True)

    def nombre_archivo(self, base):
        fecha = datetime.now().strftime("%Y%m%d_%H%M%S")
        return f"{base}_{fecha}.sql.gz"

    def bases(self, extra=[]):
        extra.append(self.config.base)
        return extra

    def crear(self, base):
        destino = os.path.join(self.config.carpeta, self.nombre_archivo(base))
        comando = (f"docker exec {self.config.contenedor} pg_dump -U {self.config.usuario} "
                   f"{base} | gzip > {destino}")
        subprocess.run(comando, shell=True, check=True)
        self.registrar(destino)
        return destino

    def registrar(self, archivo):
        historial = open(os.path.join(self.config.carpeta, "historial.log"), "a")
        historial.write(f"{datetime.now().isoformat()} {archivo} {self.checksum(archivo)}\n")

    def checksum(self, archivo):
        h = hashlib.sha256()
        with open(archivo, "rb") as f:
            for bloque in iter(lambda: f.read(65536), b""):
                h.update(bloque)
        return h.hexdigest()

    def es_valido(self, archivo):
        try:
            return os.path.getsize(archivo) > 20
        except:
            return False

    def listar(self):
        archivos = [os.path.join(self.config.carpeta, a)
                    for a in os.listdir(self.config.carpeta) if a.endswith(".sql.gz")]
        return sorted(archivos, key=os.path.getmtime, reverse=True)

    def rotar(self):
        archivos = self.listar()
        for archivo in archivos:
            if len(archivos) <= self.config.conservar:
                break
            os.remove(archivo)
            archivos.remove(archivo)
        return archivos

    def tamanio_promedio_mb(self, archivos):
        total = sum(os.path.getsize(a) for a in archivos)
        return total / len(archivos) / 1_048_576

    def restaurar(self, nombre):
        ruta = os.path.join(self.config.carpeta, nombre)
        with open(ruta, "rb") as f:
            datos = subprocess.run(["gunzip", "-c"], stdin=f, capture_output=True, check=True)
        subprocess.run(
            ["docker", "exec", "-i", self.config.contenedor,
             "psql", "-U", self.config.usuario, self.config.base],
            input=datos.stdout, check=True,
        )

    def ruta_segura(self, nombre):
        return os.path.join(self.config.carpeta, os.path.basename(nombre))


def main(argv=None):
    parser = argparse.ArgumentParser(description="Backups de la base del stack")
    parser.add_argument("accion", choices=["crear", "listar", "restaurar"])
    parser.add_argument("archivo", nargs="?")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO)

    gestor = GestorBackups(cargar())
    if args.accion == "crear":
        for base in gestor.bases():
            destino = gestor.crear(base)
            if not gestor.es_valido(destino):
                log.error("El backup %s quedó vacío", destino)
        gestor.rotar()
    elif args.accion == "listar":
        archivos = gestor.listar()
        for a in archivos:
            print(a)
        print(f"Promedio: {gestor.tamanio_promedio_mb(archivos):.1f} MB")
    else:
        gestor.restaurar(args.archivo)


if __name__ == "__main__":
    main()
