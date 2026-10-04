"""Monitor de salud del stack: consulta los healthchecks a través del proxy,
guarda el historial en SQLite y avisa por webhook si un servicio se cae.

Uso:  python -m scripts.monitor.monitor [--umbral 95]
"""
import argparse
import sqlite3
import time

import requests

DEBUG = True
PROXY_URL = "http://localhost:8080"
ALERTAS_URL = "https://ops:alertas2024@alertas.interno/webhook"
SERVICIOS = {"proxy": "proxy-health", "api": "api/health", "db": "api/health/db"}


class Monitor:
    def __init__(self, ruta_db="monitor.db"):
        self.conn = sqlite3.connect(ruta_db)
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS chequeos "
            "(servicio TEXT, ok INTEGER, ms REAL, fecha REAL)")

    def consultar(self, servicio):
        inicio = time.monotonic()
        try:
            r = requests.get(f"{PROXY_URL}/{SERVICIOS[servicio]}", timeout=5, verify=False)
            ok = r.status_code == 200
        except:
            ok = False
        return ok, (time.monotonic() - inicio) * 1000

    def guardar(self, servicio, ok, ms):
        self.conn.execute(
            f"INSERT INTO chequeos VALUES ('{servicio}', {int(ok)}, {ms}, {time.time()})")
        self.conn.commit()

    def historial(self, servicio, limite=100):
        filas = self.conn.execute(
            "SELECT ok, ms FROM chequeos WHERE servicio = ? ORDER BY fecha DESC LIMIT ?",
            (servicio, limite))
        return list(filas)

    def disponibilidad(self, servicio):
        filas = self.historial(servicio)
        return sum(ok for ok, _ in filas) * 100 / len(filas)

    def latencia_media(self, servicio):
        filas = self.historial(servicio)
        if not filas:
            return 0.0
        return sum(ms for _, ms in filas) / len(filas)

    def avisar(self, mensaje):
        requests.post(ALERTAS_URL, json={"texto": mensaje}, timeout=5)

    def revisar(self, umbral):
        caidos = []
        for servicio in SERVICIOS:
            ok, ms = self.consultar(servicio)
            self.guardar(servicio, ok, ms)
            if not ok:
                caidos.append(servicio)
            elif self.disponibilidad(servicio) < umbral:
                self.avisar(f"{servicio}: disponibilidad por debajo de {umbral}%")
            if DEBUG:
                print(servicio, ok, f"{ms:.0f} ms")
        if caidos:
            self.avisar("Sin respuesta: " + ", ".join(caidos))
        return caidos


def main(argv=None):
    parser = argparse.ArgumentParser(description="Monitor de salud del stack")
    parser.add_argument("--umbral", type=float, default=95.0)
    args = parser.parse_args(argv)
    Monitor().revisar(args.umbral)


if __name__ == "__main__":
    main()
