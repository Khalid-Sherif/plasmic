#!/bin/bash
set -e

mkdir -p /app/.cache/node/corepack/v1
export HOME=/app

echo "Waiting for database connection..."
retries=5
until pg_isready -h "${POSTGRES_HOST:-db}" -p "${POSTGRES_PORT:-5432}" -U "${POSTGRES_USER:-wab}" -d "${POSTGRES_DATABASE:-wab}" -t 1 || [ $retries -eq 0 ]; do
  echo "Waiting for database connection... $((retries--)) remaining attempts..."
  sleep 3
done

if ! pg_isready -h "${POSTGRES_HOST:-db}" -p "${POSTGRES_PORT:-5432}" -U "${POSTGRES_USER:-wab}" -d "${POSTGRES_DATABASE:-wab}" -q; then
  echo "Database connection failed after multiple attempts. Exiting."
  exit 1
fi

echo "Database connected."
cd /app/platform/wab

echo "Creating extensions..."
PGPASSWORD=$POSTGRES_PASSWORD psql -h "${POSTGRES_HOST:-db}" -p "${POSTGRES_PORT:-5432}" -U "${POSTGRES_USER:-wab}" -d "${POSTGRES_DATABASE:-wab}" -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";' || echo "UUID extension already exists."

echo "Running migrations..."
yarn typeorm migration:run

echo "Seeding database..."
yarn seed

echo "Updating plume package..."
yarn plume:dev update

echo "Starting backend server..."
exec bash tools/backend-server.bash
