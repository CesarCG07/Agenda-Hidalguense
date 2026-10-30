#!/bin/bash
cd "$(dirname "$0")"
node --disable-warning=ExperimentalWarning exportar-para-web.js "$@"
echo; read -n 1 -s -r -p "Presiona una tecla para cerrar..."
