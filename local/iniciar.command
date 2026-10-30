#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Falta instalar Node.js. Descarga la versión LTS en https://nodejs.org y vuelve a abrir este archivo."
  read -n 1 -s -r -p "Presiona una tecla para cerrar"
  exit 1
fi
node --disable-warning=ExperimentalWarning server.js --abrir
