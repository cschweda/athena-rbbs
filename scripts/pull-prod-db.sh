#!/bin/bash
# ─── Pull Production Database ────────────────────────────────────────────────
# Copies the live SQLite database from your production VPS to local dev.
# Run this on-demand when you want to develop against real data.
#
# Usage:
#   ./scripts/pull-prod-db.sh
#
# Prerequisites:
#   - SSH access to your VPS (key-based auth recommended)
#   - Set VPS_HOST and VPS_PATH below (or via environment variables)
# ─────────────────────────────────────────────────────────────────────────────

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# ─── Config ──────────────────────────────────────────────────────────────────
# Override these with environment variables or edit directly:
VPS_HOST="${VPS_HOST:-user@your-vps-ip}"
VPS_PATH="${VPS_PATH:-/opt/athena-rbbs}"
BOARD="${BOARD:-golfsucks}"

LOCAL_DB="$ROOT_DIR/boards/$BOARD/data/board.db"
REMOTE_DB="$VPS_PATH/boards/$BOARD/data/board.db"

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

# ─── Preflight ───────────────────────────────────────────────────────────────
if [ "$VPS_HOST" = "user@your-vps-ip" ]; then
  echo -e "${RED}Error:${NC} Set VPS_HOST before running."
  echo "  export VPS_HOST=root@123.45.67.89"
  echo "  ./scripts/pull-prod-db.sh"
  exit 1
fi

# ─── Backup existing local database ─────────────────────────────────────────
if [ -f "$LOCAL_DB" ]; then
  BACKUP="$LOCAL_DB.bak.$(date +%Y%m%d-%H%M%S)"
  echo -e "${YELLOW}Backing up local database → ${BACKUP##*/}${NC}"
  cp "$LOCAL_DB" "$BACKUP"
fi

# ─── Pull from production ───────────────────────────────────────────────────
echo -e "Pulling ${YELLOW}$BOARD${NC} database from ${YELLOW}$VPS_HOST${NC}..."
mkdir -p "$(dirname "$LOCAL_DB")"
scp "$VPS_HOST:$REMOTE_DB" "$LOCAL_DB"

echo -e "${GREEN}Done.${NC} Production database copied to boards/$BOARD/data/board.db"
echo -e "Start dev server with: ${YELLOW}pnpm dev${NC}"
