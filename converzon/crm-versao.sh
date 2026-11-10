#!/usr/bin/env bash
# Troca a imagem do APP do CRM entre a oficial (upstream) e a do fork Converzon.
# Só o contêiner `app` é recriado (menos de 1 minuto fora do ar). Worker,
# scheduler, banco e WAHA não são tocados.
#
#   crm-versao.sh status
#   crm-versao.sh fork ghcr.io/obrunodomingues/deskcommcrm@sha256:<digest>
#   crm-versao.sh oficial          # a imagem oficial da MESMA versão do worker
#
# Segurança:
#   - baixa a imagem ANTES de mexer em qualquer coisa (falhou o download, nada muda);
#   - backup do .env em /root/converzon/backups/ (600);
#   - recria o app com os MESMOS arquivos de compose do contêiner que está no ar
#     (lidos do rótulo do próprio contêiner), então só a imagem muda;
#   - se em 3 minutos o app não ficar saudável com / = 200 e /app = 307, volta
#     sozinho para a imagem anterior.
set -euo pipefail

REPO=/root/DeskcommCRM
CONTEINER=deskcommcrm-app-1
BACKUPS=/root/converzon/backups
cd "$REPO"
# Endereço público do CRM: o mesmo que a instalação usa (NEXT_PUBLIC_APP_URL do .env).
DOMINIO="$(grep -E '^NEXT_PUBLIC_APP_URL=' .env | head -1 | cut -d= -f2- | tr -d '"' | sed 's:/*$::')"
[ -n "$DOMINIO" ] || { echo "NEXT_PUBLIC_APP_URL ausente no .env" >&2; exit 1; }

imagem_no_env() { grep -E '^APP_IMAGE=' .env | head -1 | cut -d= -f2- | tr -d '"'; }
versao_oficial() { grep -E '^WORKER_IMAGE=' .env | head -1 | cut -d= -f2- | tr -d '"' | sed 's/.*://'; }
codigo() { curl -s -o /dev/null -w '%{http_code}' -m 20 "$1" || echo 000; }

compose_app() {
  local -a arquivos args=()
  mapfile -t arquivos < <(docker inspect "$CONTEINER" \
    --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' | tr ',' '\n')
  for f in "${arquivos[@]}"; do [ -n "$f" ] && args+=(-f "$f"); done
  [ "${#args[@]}" -gt 0 ] || { echo "não achei os arquivos de compose do $CONTEINER" >&2; exit 1; }
  docker compose "${args[@]}" --env-file .env "$@"
}

saudavel() {
  local i estado
  for i in $(seq 1 36); do
    estado=$(docker inspect "$CONTEINER" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || echo ausente)
    if [ "$estado" = "healthy" ] && [ "$(codigo "$DOMINIO/")" = 200 ] && [ "$(codigo "$DOMINIO/app")" = 307 ]; then
      return 0
    fi
    sleep 5
  done
  return 1
}

status() {
  echo "APP_IMAGE no .env : $(imagem_no_env)"
  echo "imagem no ar      : $(docker inspect "$CONTEINER" --format '{{.Config.Image}}' 2>/dev/null || echo '-')"
  echo "saúde             : $(docker inspect "$CONTEINER" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || echo '-')"
  echo "/ e /app          : $(codigo "$DOMINIO/") e $(codigo "$DOMINIO/app")"
}

trocar() {
  local alvo="$1" anterior backup
  anterior=$(imagem_no_env)
  if [ "$alvo" = "$anterior" ]; then echo "Já está em $alvo."; status; return 0; fi

  echo "1/4 baixando $alvo"
  docker pull "$alvo" >/dev/null

  mkdir -p "$BACKUPS"
  backup="$BACKUPS/env-$(date +%Y%m%d-%H%M%S)"
  cp -p .env "$backup"; chmod 600 "$backup"
  echo "2/4 backup do .env em $backup"

  sed -i "s|^APP_IMAGE=.*|APP_IMAGE=\"$alvo\"|" .env
  echo "3/4 recriando só o app"
  compose_app up -d --no-deps app

  echo "4/4 conferindo (até 3 min)"
  if saudavel; then
    echo "OK — no ar com $alvo"; status; return 0
  fi

  echo "FALHOU — voltando para $anterior" >&2
  sed -i "s|^APP_IMAGE=.*|APP_IMAGE=\"$anterior\"|" .env
  compose_app up -d --no-deps app
  if saudavel; then echo "Voltou para $anterior e está no ar." >&2; else echo "ATENÇÃO: nem a anterior respondeu. Ver: docker logs $CONTEINER" >&2; fi
  status
  return 1
}

case "${1:-status}" in
  status)  status ;;
  fork)    [ -n "${2:-}" ] || { echo "uso: $0 fork <imagem@sha256:...>" >&2; exit 2; }; trocar "$2" ;;
  oficial) trocar "ghcr.io/melgarafael/deskcommcrm:$(versao_oficial)" ;;
  *)       echo "uso: $0 status | fork <imagem> | oficial" >&2; exit 2 ;;
esac
