#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL must be set}"
backup_dir="${BACKUP_DIR:-./backups}"
mkdir -p "$backup_dir"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_file="$backup_dir/shoe-shop-$timestamp.dump"

pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" --file "$backup_file"
printf 'Database backup written to %s\n' "$backup_file"