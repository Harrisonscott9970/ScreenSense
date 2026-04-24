#!/usr/bin/env bash
# ScreenSense Launch Script — Mac / Linux
# Harrison Scott · 10805603 · University of Plymouth · COMP3000

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/screensense-app"
PORT=8000

# ── Colours ────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'

echo ""
echo -e "${CYAN}${BOLD} ====================================================${NC}"
echo -e "${CYAN}${BOLD}   ScreenSense — Digital Wellbeing App${NC}"
echo -e "${CYAN}   Harrison Scott · 10805603 · University of Plymouth${NC}"
echo -e "${CYAN}   COMP3000 Computing Project${NC}"
echo -e "${CYAN}${BOLD} ====================================================${NC}"
echo ""

# ── 1. Check prerequisites ──────────────────────────────────────────
echo -e "${BOLD}[1/4] Checking prerequisites...${NC}"

if [ ! -d "$BACKEND_DIR/venv" ]; then
    echo -e "${RED} ERROR: Python venv not found.${NC}"
    echo "  Run: cd backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi

if ! command -v node &>/dev/null; then
    echo -e "${RED} ERROR: Node.js not found. Install from https://nodejs.org${NC}"
    exit 1
fi

echo -e "${GREEN} OK — prerequisites found.${NC}"
echo ""

# ── 2. Detect local IP ────────────────────────────────────────────
echo -e "${BOLD}[2/4] Detecting local IP...${NC}"
if [[ "$OSTYPE" == "darwin"* ]]; then
    LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")
else
    LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
fi
echo -e " Backend → ${YELLOW}http://$LOCAL_IP:$PORT${NC}"
echo -e " ${CYAN}Set this IP in the app: Profile › Developer settings${NC}"
echo ""

# ── 3. Start backend ─────────────────────────────────────────────
echo -e "${BOLD}[3/4] Starting FastAPI backend (port $PORT)...${NC}"

# Activate venv and start uvicorn in background
(
    cd "$BACKEND_DIR"
    source venv/bin/activate
    echo -e "${GREEN} Backend running → http://localhost:$PORT/docs${NC}"
    python -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --reload
) &
BACKEND_PID=$!
echo " Backend PID: $BACKEND_PID"

# Give backend a moment to initialise
sleep 3

# ── 4. Start frontend ────────────────────────────────────────────
echo ""
echo -e "${BOLD}[4/4] Starting Expo frontend...${NC}"
echo ""
echo -e "${CYAN}${BOLD} ============================================================${NC}"
echo -e "${CYAN}  QUICK START GUIDE${NC}"
echo -e "${CYAN} ============================================================${NC}"
echo -e "  Web browser : press ${BOLD}W${NC} in the Expo prompt"
echo -e "  iOS device  : scan the QR code with the Camera app"
echo -e "  Android     : scan the QR code with the Expo Go app"
echo -e "  Mobile IP   : set ${YELLOW}$LOCAL_IP${NC} in Profile › Developer settings"
echo -e "${CYAN} ============================================================${NC}"
echo ""

(
    cd "$FRONTEND_DIR"
    npm install --silent 2>/dev/null || true
    npx expo start --clear
) &
FRONTEND_PID=$!

# ── Cleanup on exit ────────────────────────────────────────────────
cleanup() {
    echo ""
    echo -e "${YELLOW} Shutting down...${NC}"
    kill "$BACKEND_PID"  2>/dev/null || true
    kill "$FRONTEND_PID" 2>/dev/null || true
    echo -e "${GREEN} Done.${NC}"
}
trap cleanup EXIT INT TERM

# Wait for both processes
wait
