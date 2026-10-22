#!/bin/bash
# Reconstruye el sitio y lo publica en GitHub Pages (rama main, carpeta docs/).
# Lo ejecuta launchd cada hora (ver ~/Library/LaunchAgents).
# Registro: ~/.config/noticias-asl/registro.log
#
# Se apoya en la ruta del propio script, así funciona igual en el proyecto
# original y en la copia de trabajo (worker) fuera de ~/Documents: macOS no
# permite a launchd leer ~/Documents sin concederle acceso total al disco.

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

REPO="$(cd "$(dirname "$0")/.." && pwd)"
TOKEN_FILE="$HOME/.config/noticias-asl/token"
LOG="$HOME/.config/noticias-asl/registro.log"

cd "$REPO" || exit 1

{
  echo "──────── $(date '+%Y-%m-%d %H:%M:%S') · $REPO ────────"

  TOKEN=$(cat "$TOKEN_FILE" 2>/dev/null)
  if [ -z "$TOKEN" ]; then
    echo "ERROR: falta el token en $TOKEN_FILE"
    exit 1
  fi

  # Traer cambios de código hechos en el proyecto original
  git pull --rebase --autostash origin main >/dev/null 2>&1 \
    && echo "Código actualizado." \
    || echo "Aviso: no se pudo hacer pull (se continúa con la copia local)."

  # Si falla la construcción no se publica nada: nunca dejar la portada vacía.
  if ! node sitio/construir.js; then
    echo "ERROR: falló la construcción. No se publica."
    exit 1
  fi

  rm -rf docs && mkdir -p docs
  cp -R dist/. docs/ || { echo "ERROR: no se pudo copiar a docs/"; exit 1; }
  touch docs/.nojekyll

  git add docs
  if git diff --cached --quiet; then
    echo "Sin cambios en el contenido."
  else
    git -c user.name="jreveles444-lab" \
        -c user.email="346256680+jreveles444-lab@users.noreply.github.com" \
        commit -q -m "Actualizar sitio: $(date '+%Y-%m-%d %H:%M')"
    ASK=$(mktemp /tmp/.ghask.XXXXXX)
    printf '#!/bin/sh\nprintf %%s "$GIT_TOKEN"\n' > "$ASK"
    chmod 700 "$ASK"
    if GIT_TOKEN="$TOKEN" GIT_ASKPASS="$ASK" GIT_TERMINAL_PROMPT=0 git push origin main; then
      echo "Publicado correctamente."
    else
      echo "ERROR: falló el push."
    fi
    rm -f "$ASK"
  fi
} >> "$LOG" 2>&1
