#!/bin/sh

set -eu

usage() {
  cat <<'EOF'
Usage: scripts/setup-docker.sh [options]

Prepare trusted localhost certificates and start the Docker Compose stack.

Options:
  --no-start              Prepare and validate the stack without starting it
  --force-certs           Replace the existing localhost certificate and key
  --project-name NAME     Override the Compose project name for this run
  -h, --help              Show this help

Environment:
  COMPOSE_PROJECT_NAME    Compose project name (overridden by --project-name)
EOF
}

fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
cert_file="$project_dir/certs/localhost.pem"
key_file="$project_dir/certs/localhost-key.pem"
compose_file="$project_dir/docker-compose.yml"
start_stack=1
force_certs=0
project_name=${COMPOSE_PROJECT_NAME:-empty-opencode-web}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-start)
      start_stack=0
      ;;
    --force-certs)
      force_certs=1
      ;;
    --project-name)
      [ "$#" -ge 2 ] || fail "--project-name requires a value"
      project_name=$2
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown option: $1 (use --help for usage)"
      ;;
  esac
  shift
done

case "$project_name" in
  ''|*[!a-z0-9_-]*|[!a-z0-9]*)
    fail "project name must start with a lowercase letter or digit and contain only lowercase letters, digits, hyphens, or underscores"
    ;;
esac

command_exists docker || fail "Docker is not installed or is not on PATH"
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 ('docker compose') is required"
docker info >/dev/null 2>&1 || fail "the Docker daemon is not running; start Docker Desktop or Docker Engine and retry"
command_exists mkcert || fail "mkcert is required. Install it from https://github.com/FiloSottile/mkcert and retry"

printf '%s\n' 'Installing the mkcert local CA in this user account (an OS prompt may appear)...'
mkcert -install

mkdir -p "$project_dir/certs"
if [ "$force_certs" -eq 1 ] || [ ! -s "$cert_file" ] || [ ! -s "$key_file" ]; then
  printf '%s\n' 'Generating a localhost certificate...'
  mkcert -cert-file "$cert_file" -key-file "$key_file" localhost 127.0.0.1 ::1
  chmod 600 "$key_file" 2>/dev/null || true
else
  printf '%s\n' 'Reusing the existing certificate files (use --force-certs to replace them).'
fi

printf '%s\n' 'Validating the Docker Compose configuration...'
docker compose --file "$compose_file" --project-directory "$project_dir" --project-name "$project_name" config --quiet

if [ "$start_stack" -eq 0 ]; then
  printf '\nSetup complete. Start the stack with:\n  docker compose --file "%s" --project-directory "%s" --project-name "%s" up -d --build\n' "$compose_file" "$project_dir" "$project_name"
  exit 0
fi

printf '%s\n' 'Building and starting the Docker Compose stack...'
docker compose --file "$compose_file" --project-directory "$project_dir" --project-name "$project_name" up -d --build

printf '\nOpen https://localhost:4096\n\n'
docker compose --file "$compose_file" --project-directory "$project_dir" --project-name "$project_name" ps
