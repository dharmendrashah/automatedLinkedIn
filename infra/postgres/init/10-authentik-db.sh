#!/bin/sh
# Creates authentik's role and database inside the shared postgres server.
# Runs only on first initialisation (empty data directory). For an existing
# volume, create them by hand (see MEMORY.md).
set -e

user="${AUTHENTIK_PG_USER:-authentik}"
password="${AUTHENTIK_PG_PASS:-authentik}"
db="${AUTHENTIK_PG_DB:-authentik}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
   --set=user="$user" --set=password="$password" --set=db="$db" <<'EOSQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'user', :'password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'user')\gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'db', :'user')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db')\gexec
EOSQL

# authentik owns its schema so migrations can create tables (PostgreSQL 15+ no
# longer grants CREATE on public to non-owners).
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" \
   --set=user="$user" <<'EOSQL'
ALTER SCHEMA public OWNER TO :"user";
GRANT ALL ON SCHEMA public TO :"user";
EOSQL
