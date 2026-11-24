#!/bin/zsh
cd "$(dirname "$0")"
if [[ -z "$MUAERO_ADMIN_PIN" ]]; then
  printf '관리자 PIN (6자 이상, 빈칸이면 제보 검토 비활성): '
  read -rs MUAERO_ADMIN_PIN
  printf '\n'
  export MUAERO_ADMIN_PIN
fi
python3 server.py
