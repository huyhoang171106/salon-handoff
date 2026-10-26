#!/usr/bin/env bash

# Salon App - Script dừng toàn bộ hệ thống
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Đang dừng tất cả các dịch vụ salon...${NC}"

# Dừng theo PIDs lưu trữ
if [ -f "$ROOT_DIR/logs/pids.txt" ]; then
    PIDS=$(cat "$ROOT_DIR/logs/pids.txt")
    kill $PIDS 2>/dev/null || true
    rm -f "$ROOT_DIR/logs/pids.txt"
fi

# Dọn dẹp triệt để theo cổng 3000, 5173, 5174
for PORT in 3000 5173 5174; do
    PIDS=$(lsof -ti :$PORT 2>/dev/null || true)
    if [ -n "$PIDS" ]; then
        echo -e "Dừng tiến trình trên cổng $PORT (PIDs: $PIDS)..."
        kill -9 $PIDS 2>/dev/null || true
    fi
done

echo -e "${GREEN}✓ Đã dừng toàn bộ dịch vụ (Backend, Web Customer, Web Staff).${NC}"
