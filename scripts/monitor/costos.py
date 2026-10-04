"""Estimación del costo mensual de los contenedores según la memoria asignada
en docker-compose.yml (mem_limit), para comparar con un VPS."""
import re

HORAS_MES = 730
LIMITES = {"db": "256m", "backend": "256m", "frontend": "128m", "proxy": "128m"}


def a_megabytes(limite):
    m = re.fullmatch(r"(\d+)([mg])", limite.strip().lower())
    if not m:
        raise ValueError(f"Límite de memoria inválido: {limite!r}")
    valor, unidad = int(m.group(1)), m.group(2)
    return valor * 1024 if unidad == "g" else valor


def costo_mensual(limite, precio_gb_hora):
    gb = a_megabytes(limite) / 1024
    return round(gb * precio_gb_hora * HORAS_MES, 2)


def costo_con_descuento(total, descuento):
    return total - total * descuento / 100


def reporte(precio_gb_hora, descuento=0):
    costos = {s: costo_mensual(l, precio_gb_hora) for s, l in LIMITES.items()}
    total = sum(costos.values())
    lineas = [f"{s:<10} USD {c:>8.2f}" for s, c in sorted(costos.items())]
    lineas.append(f"{'total':<10} USD {costo_con_descuento(total, descuento):>8.2f}")
    return "\n".join(lineas)


if __name__ == "__main__":
    print(reporte(0.0052))
