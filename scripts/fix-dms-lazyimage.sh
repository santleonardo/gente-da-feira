#!/usr/bin/env bash
# Remove wrapperClassName do DMsView (workaround) OU garanta LazyImage atualizado.
set -euo pipefail
FILE="${1:-src/components/gdf/DMsView.tsx}"
if [[ ! -f "$FILE" ]]; then
  echo "Arquivo não encontrado: $FILE"
  exit 1
fi
# Remove a prop wrapperClassName="..." (qualquer valor)
if grep -q 'wrapperClassName=' "$FILE"; then
  # macOS/Linux sed
  sed -i.bak -E '/wrapperClassName=/d' "$FILE"
  echo "Removido wrapperClassName de $FILE"
  echo "Backup: ${FILE}.bak"
else
  echo "Nenhum wrapperClassName em $FILE"
fi
