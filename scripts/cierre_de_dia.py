"""Script de automatización de Cierre del Día para ChatAliado.

Acciones que ejecuta:
1. Re-extrae el grafo de conocimiento de Graphify de forma estática (sin gastar tokens).
2. Re-genera los clusters y archivos graphify-out/GRAPH_REPORT.md y graphify-out/graph.html.
"""

import sys
import subprocess
from pathlib import Path

# Configurar salida segura UTF-8 para consola Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")


def update_graph():
    print("🔄 [1/2] Actualizando grafo de conocimiento con Graphify...")
    res1 = subprocess.run(
        [sys.executable, "-m", "graphify", "extract", ".", "--code-only"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if res1.returncode != 0:
        print(f"⚠️ Error al extraer grafo: {res1.stderr}")
        return False

    print("📊 [2/2] Generando GRAPH_REPORT.md y mapa visual graph.html...")
    res2 = subprocess.run(
        [sys.executable, "-m", "graphify", "cluster-only", "."],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if res2.returncode != 0:
        print(f"⚠️ Error al clusterizar grafo: {res2.stderr}")
        return False

    print("✅ Grafo de conocimiento actualizado exitosamente en `graphify-out/`.")
    return True


if __name__ == "__main__":
    success = update_graph()
    if not success:
        sys.exit(1)
