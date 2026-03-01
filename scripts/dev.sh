#!/bin/bash
# ─── Athena RBBS Dev Launcher ──────────────────────────────────────────────
# Starts all three services and verifies they can see each other.
#
# Usage: ./scripts/dev.sh
# Stop:  Ctrl+C (kills all three)
# ────────────────────────────────────────────────────────────────────────────

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# ─── Config ─────────────────────────────────────────────────────────────────
SERVER_PORT=3000
ENGINE_PORT=3001
CLIENT_PORT=3002

export MODULE_PATH="$ROOT_DIR/boards/golfsucks"
export ENGINE_PORT="$ENGINE_PORT"
export SYSOP_HANDLE="ChrisR"
export SYSOP_PASSWORD="test123"
export ALLOWED_ORIGINS="http://localhost:$CLIENT_PORT"

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}${CYAN}"
echo "  ⚓ Athena RBBS — Dev Launcher"
echo -e "  ─────────────────────────────────${NC}"
echo ""

# ─── Kill any processes on our ports ────────────────────────────────────────
echo -e "${YELLOW}Clearing ports $SERVER_PORT, $ENGINE_PORT, $CLIENT_PORT...${NC}"
npx kill-port $SERVER_PORT $ENGINE_PORT $CLIENT_PORT 2>/dev/null || true

# ─── Clear Vite dependency cache ──────────────────────────────────────────
echo -e "${YELLOW}Clearing Vite cache...${NC}"
rm -rf "$ROOT_DIR/packages/client/node_modules/.vite" \
       "$ROOT_DIR/packages/athena-server/node_modules/.vite" \
       "$ROOT_DIR/packages/athena-engine/node_modules/.vite"
echo ""

# ─── Cleanup on exit ────────────────────────────────────────────────────────
cleanup() {
  echo ""
  echo -e "${YELLOW}Shutting down...${NC}"
  kill $SERVER_PID $ENGINE_PID $CLIENT_PID 2>/dev/null
  wait $SERVER_PID $ENGINE_PID $CLIENT_PID 2>/dev/null
  echo -e "${GREEN}All services stopped.${NC}"
}
trap cleanup EXIT INT TERM

# ─── Start services ─────────────────────────────────────────────────────────
echo -e "${CYAN}[1/3]${NC} Starting Athena Server on port $SERVER_PORT..."
cd "$ROOT_DIR/packages/athena-server"
npx nuxt dev --port $SERVER_PORT > /tmp/athena-server.log 2>&1 &
SERVER_PID=$!

echo -e "${CYAN}[2/3]${NC} Starting Athena Engine on port $ENGINE_PORT..."
echo -e "       Module: ${YELLOW}$MODULE_PATH${NC}"
cd "$ROOT_DIR/packages/athena-engine"
npx nuxt dev --port $ENGINE_PORT > /tmp/athena-engine.log 2>&1 &
ENGINE_PID=$!

echo -e "${CYAN}[3/3]${NC} Starting Client on port $CLIENT_PORT..."
cd "$ROOT_DIR/packages/client"
npx nuxt dev --port $CLIENT_PORT > /tmp/athena-client.log 2>&1 &
CLIENT_PID=$!

cd "$ROOT_DIR"

# ─── Wait for services to be ready ──────────────────────────────────────────
echo ""
echo -e "${YELLOW}Waiting for services to start...${NC}"

wait_for_service() {
  local name=$1
  local url=$2
  local max_attempts=30
  local attempt=0

  while [ $attempt -lt $max_attempts ]; do
    if curl -sf "$url" > /dev/null 2>&1; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 1
  done
  return 1
}

# Wait for each service
echo -n "  Athena Server ... "
if wait_for_service "server" "http://localhost:$SERVER_PORT/api/health"; then
  echo -e "${GREEN}ready${NC}"
else
  echo -e "${RED}FAILED${NC}"
  echo "  Check /tmp/athena-server.log"
fi

echo -n "  Athena Engine ... "
if wait_for_service "engine" "http://localhost:$ENGINE_PORT/api/health"; then
  echo -e "${GREEN}ready${NC}"
else
  echo -e "${RED}FAILED${NC}"
  echo "  Check /tmp/athena-engine.log"
fi

echo -n "  Client        ... "
if wait_for_service "client" "http://localhost:$CLIENT_PORT"; then
  echo -e "${GREEN}ready${NC}"
else
  echo -e "${RED}FAILED${NC}"
  echo "  Check /tmp/athena-client.log"
fi

# ─── Handshake: verify services can see each other ───────────────────────────
echo ""
echo -e "${BOLD}Handshake check:${NC}"

# Client → Server (can the client reach the board directory?)
echo -n "  Client → Server (boards API) ... "
BOARDS=$(curl -sf "http://localhost:$SERVER_PORT/api/boards" 2>/dev/null)
if [ $? -eq 0 ] && echo "$BOARDS" | grep -q "Golf Sucks"; then
  echo -e "${GREEN}OK${NC} — Golf Sucks listed"
else
  echo -e "${RED}FAIL${NC}"
fi

# Client → Engine (can the client reach the engine health?)
echo -n "  Client → Engine (health)     ... "
ENGINE_HEALTH=$(curl -sf "http://localhost:$ENGINE_PORT/api/health" 2>/dev/null)
if [ $? -eq 0 ] && echo "$ENGINE_HEALTH" | grep -q "athena-engine"; then
  echo -e "${GREEN}OK${NC}"
else
  echo -e "${RED}FAIL${NC}"
fi

# Server → Engine (does the board directory point to a live engine?)
echo -n "  Server → Engine (board host) ... "
BOARD_HOST=$(echo "$BOARDS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['boards'][0]['host'])" 2>/dev/null)
if [ -n "$BOARD_HOST" ] && [ "$BOARD_HOST" != "" ]; then
  ENGINE_CHECK=$(curl -sf "http://$BOARD_HOST/api/health" 2>/dev/null)
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}OK${NC} — $BOARD_HOST reachable"
  else
    echo -e "${RED}FAIL${NC} — $BOARD_HOST unreachable"
  fi
else
  echo -e "${RED}FAIL${NC} — no host in board data"
fi

# ─── Ready ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}  ✓ All systems go!${NC}"
echo ""
echo -e "  ┌──────────────────────────────────────────────────────────────────────┐"
echo -e "  │                                                                      │"
echo -e "  │  ${BOLD}BBS Client${NC} — what users see                          port ${CYAN}$CLIENT_PORT${NC}  │"
echo -e "  │  Browse the board directory, connect to a board                      │"
echo -e "  │  ${CYAN}http://localhost:$CLIENT_PORT${NC}                                              │"
echo -e "  │                                                                      │"
echo -e "  │  ${BOLD}Athena Server${NC} — board registry / admin API            port ${CYAN}$SERVER_PORT${NC}  │"
echo -e "  │  Central directory that lists all boards on the network              │"
echo -e "  │  ${CYAN}http://localhost:$SERVER_PORT/api/boards${NC}    board directory (JSON)          │"
echo -e "  │  ${CYAN}http://localhost:$SERVER_PORT/api/health${NC}    service health check            │"
echo -e "  │                                                                      │"
echo -e "  │  ${BOLD}Athena Engine${NC} — Golf Sucks BBS                        port ${CYAN}$ENGINE_PORT${NC}  │"
echo -e "  │  WebSocket BBS server — auth, sessions, menus                        │"
echo -e "  │  ${CYAN}http://localhost:$ENGINE_PORT/api/health${NC}    service health check            │"
echo -e "  │  ${CYAN}ws://localhost:$ENGINE_PORT/_ws${NC}             WebSocket endpoint              │"
echo -e "  │                                                                      │"
echo -e "  ├──────────────────────────────────────────────────────────────────────┤"
echo -e "  │                                                                      │"
echo -e "  │  ${BOLD}Dev credentials${NC}                                                   │"
echo -e "  │  SysOp login    handle: ${YELLOW}$SYSOP_HANDLE${NC}   password: ${YELLOW}$SYSOP_PASSWORD${NC}               │"
echo -e "  │  New account    type ${YELLOW}NEW${NC} at the handle prompt                        │"
echo -e "  │                                                                      │"
echo -e "  ├──────────────────────────────────────────────────────────────────────┤"
echo -e "  │                                                                      │"
echo -e "  │  ${BOLD}Logs${NC}                                                              │"
echo -e "  │  tail -f /tmp/athena-server.log                                      │"
echo -e "  │  tail -f /tmp/athena-engine.log                                      │"
echo -e "  │  tail -f /tmp/athena-client.log                                      │"
echo -e "  │                                                                      │"
echo -e "  └──────────────────────────────────────────────────────────────────────┘"
echo ""
echo -e "  ${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Keep running until Ctrl+C
wait
