#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="onchain-alert"
REPO_URL="https://github.com/21Hzzzz/onchain-alert.git"
APP_DIR="/root/onchain-alert"
SERVICE_FILE="/etc/systemd/system/${APP_NAME}.service"
BUN_BIN="/root/.bun/bin/bun"
CONFIG_FILES=(".env" "addresses.txt" "config.json")
ENV_KEYS=(
  "ETH_RPC_HTTP_URL"
  "ETHERSCAN_API_KEY"
  "TELEGRAM_BOT_TOKEN"
  "TELEGRAM_CHAT_ID"
)

log() {
  printf '[%s] %s\n' "$APP_NAME" "$*"
}

die() {
  printf '[%s] ERROR: %s\n' "$APP_NAME" "$*" >&2
  exit 1
}

require_root() {
  if [[ "$(id -u)" != "0" ]]; then
    die "This script must be run as root."
  fi
}

install_system_dependencies() {
  if ! command -v apt-get >/dev/null 2>&1; then
    die "apt-get was not found. This deployment script targets Ubuntu."
  fi

  log "Installing system dependencies..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y curl git unzip ca-certificates
}

install_bun() {
  if [[ -x "$BUN_BIN" ]]; then
    log "Bun already installed: $("$BUN_BIN" --version)"
    return
  fi

  log "Installing Bun..."
  curl -fsSL https://bun.com/install | bash

  if [[ ! -x "$BUN_BIN" ]]; then
    die "Bun installation finished, but $BUN_BIN was not found."
  fi

  log "Bun installed: $("$BUN_BIN" --version)"
}

clone_or_update_repository() {
  if [[ ! -d "$APP_DIR/.git" ]]; then
    if [[ -e "$APP_DIR" ]]; then
      die "$APP_DIR exists but is not a git repository. Move it away and rerun this script."
    fi

    log "Cloning repository into $APP_DIR..."
    git clone "$REPO_URL" "$APP_DIR"
    return
  fi

  log "Updating existing repository..."
  local backup_dir
  backup_dir="$(mktemp -d)"

  for file in "${CONFIG_FILES[@]}"; do
    if [[ -f "$APP_DIR/$file" ]]; then
      cp -a "$APP_DIR/$file" "$backup_dir/$file"
    fi
  done

  for file in "addresses.txt" "config.json"; do
    if git -C "$APP_DIR" ls-files --error-unmatch "$file" >/dev/null 2>&1; then
      git -C "$APP_DIR" checkout -- "$file"
    fi
  done

  git -C "$APP_DIR" fetch origin
  git -C "$APP_DIR" checkout main
  git -C "$APP_DIR" pull --ff-only origin main

  for file in "${CONFIG_FILES[@]}"; do
    if [[ -f "$backup_dir/$file" ]]; then
      cp -a "$backup_dir/$file" "$APP_DIR/$file"
    fi
  done

  rm -rf "$backup_dir"
}

ensure_env_file() {
  if [[ ! -f "$APP_DIR/.env" ]]; then
    log "Creating .env from .env.example..."
    cp "$APP_DIR/.env.example" "$APP_DIR/.env"
    chmod 600 "$APP_DIR/.env"
  fi

  for key in "${ENV_KEYS[@]}"; do
    ensure_env_value "$key"
  done
}

ensure_env_value() {
  local key="$1"
  local current
  current="$(read_env_value "$key")"

  if [[ -n "$current" && "$current" != *your-* && "$current" != "https://your-ethereum-rpc.example" ]]; then
    return
  fi

  local prompt_value=""
  while [[ -z "$prompt_value" ]]; do
    if [[ ! -r /dev/tty ]]; then
      die "Interactive configuration requires a TTY. Run this script from an interactive root shell."
    fi

    if [[ "$key" == *"TOKEN"* || "$key" == *"KEY"* ]]; then
      read -r -s -p "Enter $key: " prompt_value < /dev/tty
      printf '\n' > /dev/tty
    else
      read -r -p "Enter $key: " prompt_value < /dev/tty
    fi
    prompt_value="${prompt_value#"${prompt_value%%[![:space:]]*}"}"
    prompt_value="${prompt_value%"${prompt_value##*[![:space:]]}"}"
  done

  upsert_env_value "$key" "$prompt_value"
}

read_env_value() {
  local key="$1"
  local line
  line="$(grep -E "^${key}=" "$APP_DIR/.env" | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    printf ''
    return
  fi

  printf '%s' "${line#*=}"
}

upsert_env_value() {
  local key="$1"
  local value="$2"
  local escaped_value
  escaped_value="$(printf '%s' "$value" | sed 's/[\/&]/\\&/g')"

  if grep -qE "^${key}=" "$APP_DIR/.env"; then
    sed -i "s/^${key}=.*/${key}=${escaped_value}/" "$APP_DIR/.env"
  else
    printf '%s=%s\n' "$key" "$value" >> "$APP_DIR/.env"
  fi
}

install_project_dependencies() {
  log "Installing project dependencies..."
  cd "$APP_DIR"
  "$BUN_BIN" install --frozen-lockfile
}

write_systemd_service() {
  log "Writing systemd service..."
  cat > "$SERVICE_FILE" <<SERVICE
[Unit]
Description=Onchain Alert Ethereum monitor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
ExecStart=$BUN_BIN run start
Restart=always
RestartSec=10
Environment=PATH=/root/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

[Install]
WantedBy=multi-user.target
SERVICE
}

start_service() {
  log "Enabling and starting systemd service..."
  systemctl daemon-reload
  systemctl enable --now "$APP_NAME"
  systemctl restart "$APP_NAME"
}

main() {
  require_root
  install_system_dependencies
  install_bun
  clone_or_update_repository
  ensure_env_file
  install_project_dependencies
  write_systemd_service
  start_service

  log "Deployment completed."
  log "Check status: systemctl status $APP_NAME"
  log "Follow logs: journalctl -u $APP_NAME -f"
}

main "$@"
