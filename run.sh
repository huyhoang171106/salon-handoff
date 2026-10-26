#!/usr/bin/env bash
set -e

# Salon App - Script khởi chạy toàn bộ hệ thống
# Thư mục gốc dự án
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# Màu hiển thị
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}====================================================${NC}"
echo -e "${CYAN}   KHỞI ĐỘNG HỆ THỐNG QUẢN LÝ SALON TÓC ATELIER      ${NC}"
echo -e "${CYAN}====================================================${NC}"

# 1. Kiểm tra CSDL PostgreSQL (Docker)
echo -e "\n${BLUE}[1/4] Kiểm tra PostgreSQL...${NC}"
if ! docker compose ps --services --filter "status=running" | grep -q "db"; then
    echo -e "${YELLOW}Khởi động CSDL qua docker compose...${NC}"
    docker compose up -d db
    echo -e "${YELLOW}Chờ CSDL sẵn sàng...${NC}"
    until docker compose exec -T db pg_isready -U salon > /dev/null 2>&1; do
        sleep 1
    done
fi
echo -e "${GREEN}✓ CSDL PostgreSQL đang hoạt động (cổng 5432)${NC}"

# 2. Kiểm tra file cấu hình backend/.env
if [ ! -f "backend/.env" ]; then
    echo -e "${YELLOW}Chưa có backend/.env, tạo từ .env.example...${NC}"
    cp backend/.env.example backend/.env
fi

# 3. Dọn dẹp tiến trình cũ trên các cổng 3000, 5173, 5174 (nếu có)
echo -e "\n${BLUE}[2/4] Kiểm tra giải phóng cổng 3000, 5173, 5174...${NC}"
for PORT in 3000 5173 5174; do
    PIDS=$(lsof -ti :$PORT 2>/dev/null || true)
    if [ -n "$PIDS" ]; then
        echo -e "${YELLOW}Đang giải phóng cổng $PORT (PIDs: $PIDS)...${NC}"
        kill -9 $PIDS 2>/dev/null || true
    fi
done
echo -e "${GREEN}✓ Các cổng đã sẵn sàng.${NC}"

# Tạo thư mục logs
mkdir -p "$ROOT_DIR/logs"

# Chế độ chạy: --bg hoặc -d để chạy nền
BACKGROUND_MODE=false
if [ "$1" == "--bg" ] || [ "$1" == "-d" ]; then
    BACKGROUND_MODE=true
fi

echo -e "\n${BLUE}[3/4] Khởi động các dịch vụ...${NC}"

if [ "$BACKGROUND_MODE" = true ]; then
    # Chạy nền (Background)
    echo -e "Đang khởi động Backend (cổng 3000)..."
    (cd "$ROOT_DIR/backend" && npm run start:dev > "$ROOT_DIR/logs/backend.log" 2>&1) &
    PID_BACKEND=$!

    echo -e "Đang khởi động Web Khách Hàng (cổng 5173)..."
    (cd "$ROOT_DIR/web-customer" && npm run dev > "$ROOT_DIR/logs/web-customer.log" 2>&1) &
    PID_CUSTOMER=$!

    echo -e "Đang khởi động Web Nhân Viên (cổng 5174)..."
    (cd "$ROOT_DIR/web-staff" && npm run dev > "$ROOT_DIR/logs/web-staff.log" 2>&1) &
    PID_STAFF=$!

    echo "$PID_BACKEND $PID_CUSTOMER $PID_STAFF" > "$ROOT_DIR/logs/pids.txt"

    echo -e "\n${GREEN}====================================================${NC}"
    echo -e "${GREEN}   TẤT CẢ DỊCH VỤ ĐÃ ĐƯỢC CHẠY Ở CHẾ ĐỘ NỀN!        ${NC}"
    echo -e "${GREEN}====================================================${NC}"
    echo -e "  🌐 Web Khách hàng : ${CYAN}http://localhost:5173${NC}"
    echo -e "  💼 Web Nhân viên  : ${CYAN}http://localhost:5174${NC}"
    echo -e "  ⚡ API / Swagger   : ${CYAN}http://localhost:3000/api/docs${NC}"
    echo -e "\n  📁 Xem log: ${YELLOW}tail -f logs/backend.log logs/web-staff.log${NC}"
    echo -e "  🛑 Dừng tất cả: ${RED}./stop.sh${NC}\n"
else
    # Chạy trực tiếp (Interactive Foreground)
    # Hàm dọn dẹp khi nhấn Ctrl+C
    cleanup() {
        echo -e "\n\n${YELLOW}Đang dừng tất cả các dịch vụ...${NC}"
        kill $PID_BACKEND $PID_CUSTOMER $PID_STAFF 2>/dev/null || true
        for PORT in 3000 5173 5174; do
            PIDS=$(lsof -ti :$PORT 2>/dev/null || true)
            if [ -n "$PIDS" ]; then
                kill -9 $PIDS 2>/dev/null || true
            fi
        done
        echo -e "${GREEN}Đã dừng hoàn tất.${NC}"
        exit 0
    }
    trap cleanup SIGINT SIGTERM EXIT

    echo -e "Khởi động Backend..."
    (cd "$ROOT_DIR/backend" && npm run start:dev) &
    PID_BACKEND=$!

    echo -e "Khởi động Web Khách hàng..."
    (cd "$ROOT_DIR/web-customer" && npm run dev) &
    PID_CUSTOMER=$!

    echo -e "Khởi động Web Nhân viên..."
    (cd "$ROOT_DIR/web-staff" && npm run dev) &
    PID_STAFF=$!

    echo -e "\n${GREEN}====================================================${NC}"
    echo -e "${GREEN}   HỆ THỐNG ĐÃ SẴN SÀNG TRUY CẬP                   ${NC}"
    echo -e "${GREEN}====================================================${NC}"
    echo -e "  🌐 Web Khách hàng : ${CYAN}http://localhost:5173${NC}"
    echo -e "  💼 Web Nhân viên  : ${CYAN}http://localhost:5174${NC}"
    echo -e "  ⚡ API / Swagger   : ${CYAN}http://localhost:3000/api/docs${NC}"
    echo -e "\n  🔑 Tài khoản mẫu (mật khẩu: 123456):"
    echo -e "     - Chủ salon:     ${YELLOW}owner${NC}"
    echo -e "     - Lễ tân:        ${YELLOW}letan${NC}"
    echo -e "     - Stylist:       ${YELLOW}ST-001${NC} ... ${YELLOW}ST-004${NC}"
    echo -e "     - Khách TV:      ${YELLOW}0901234567${NC}"
    echo -e "\n  (Nhấn ${RED}Ctrl + C${NC} để dừng toàn bộ dịch vụ)\n"

    # Đợi các tiến trình
    wait
fi
