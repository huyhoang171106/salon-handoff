#!/bin/sh
# Sao lưu CSDL salon (NFR-09). Dùng biến PGHOST/PGUSER/PGPASSWORD/PGDATABASE.
#   Chạy tay từ máy dev:  docker compose run --rm backup sh /backup.sh /backups
set -eu
dir="${1:-./backups}"
mkdir -p "$dir"
file="$dir/salon-$(date +%Y%m%d-%H%M%S).dump"
pg_dump --format=custom --file="$file.part"
mv "$file.part" "$file"
echo "Đã sao lưu: $file"
find "$dir" -name 'salon-*.dump' -mtime +"${BACKUP_KEEP_DAYS:-14}" -delete
