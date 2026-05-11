#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOCAL_CONFIG="${SCRIPT_DIR}/db-migrate.local.env"

if [[ -f "${LOCAL_CONFIG}" ]]; then
    set -a
    # shellcheck disable=SC1090
    . "${LOCAL_CONFIG}"
    set +a
fi

DB_HOST="${OPENVIKING_DB_HOST:-}"
DB_PORT="${OPENVIKING_DB_PORT:-5432}"
DB_USER="${OPENVIKING_DB_USER:-}"
DB_PASS="${OPENVIKING_DB_PASS:-}"
DB_NAME="${OPENVIKING_DB_NAME:-openviking_admin}"
MAINTENANCE_DB="${OPENVIKING_DB_MAINTENANCE_DB:-postgres}"

POSTGRES_CLIENT_IMAGE="${OPENVIKING_POSTGRES_CLIENT_IMAGE:-postgres:16-alpine}"
SERVER_IMAGE_NAME="${OPENVIKING_SERVER_IMAGE_NAME:-openviking-admin-server:migration}"
SHOW_MIGRATION_STATUS="${OPENVIKING_SHOW_MIGRATION_STATUS:-true}"

MIGRATION_RUNNER="${OPENVIKING_MIGRATION_RUNNER:-local}"
BUILD_SERVER_IMAGE="${OPENVIKING_BUILD_SERVER_IMAGE:-false}"

ENSURE_PLATFORM_ADMIN="${OPENVIKING_ENSURE_PLATFORM_ADMIN:-true}"
PLATFORM_ADMIN_USERNAME="${OPENVIKING_PLATFORM_ADMIN_USERNAME:-admin}"
if [[ -n "${OPENVIKING_PLATFORM_ADMIN_PASSWORD_HASH:-}" ]]; then
    PLATFORM_ADMIN_PASSWORD_HASH="${OPENVIKING_PLATFORM_ADMIN_PASSWORD_HASH}"
else
    PLATFORM_ADMIN_PASSWORD_HASH='$2b$10$MPKX/woij0we1gqVnbEX0.VsfiV8OGXoU6L1/ghVkuqsmZepx5OIK'
fi

require_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        printf '缺少命令：%s\n' "$1" >&2
        exit 1
    fi
}

require_config() {
    local name="$1"
    local value="$2"
    if [[ -z "${value}" ]]; then
        printf '请先配置 %s。\n' "${name}" >&2
        exit 1
    fi
}

write_step() {
    printf '\n==> %s\n' "$1"
}

pg_identifier() {
    local value="$1"
    if [[ ! "${value}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
        printf '非法 PostgreSQL 标识符：%s\n' "${value}" >&2
        exit 1
    fi
    printf '"%s"' "${value//\"/\"\"}"
}

sql_literal() {
    local value="$1"
    printf "'%s'" "${value//\'/\'\'}"
}

psql_args() {
    local database="$1"
    shift

    docker run --rm \
        -e "PGPASSWORD=${DB_PASS}" \
        "${POSTGRES_CLIENT_IMAGE}" \
        psql \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d "${database}" \
        -v ON_ERROR_STOP=1 \
        "$@"
}

psql_exec() {
    local database="$1"
    local sql="$2"
    psql_args "${database}" -c "${sql}"
}

psql_scalar() {
    local database="$1"
    local sql="$2"
    psql_args "${database}" -tAc "${sql}" | awk 'NF { line=$0 } END { print line }'
}

run_local_server_script() {
    local script_name="$1"
    (
        cd "${REPO_ROOT}"
        DB_HOST="${DB_HOST}" \
        DB_PORT="${DB_PORT}" \
        DB_USER="${DB_USER}" \
        DB_PASS="${DB_PASS}" \
        DB_NAME="${DB_NAME}" \
        DB_SYNCHRONIZE=false \
        NODE_ENV=production \
        pnpm --filter server run "${script_name}"
    )
}

run_docker_image_server_script() {
    local script_name="$1"
    docker run --rm \
        -e "DB_HOST=${DB_HOST}" \
        -e "DB_PORT=${DB_PORT}" \
        -e "DB_USER=${DB_USER}" \
        -e "DB_PASS=${DB_PASS}" \
        -e "DB_NAME=${DB_NAME}" \
        -e DB_SYNCHRONIZE=false \
        -e NODE_ENV=production \
        "${SERVER_IMAGE_NAME}" \
        pnpm --filter server run "${script_name}"
}

run_server_script() {
    local script_name="$1"
    case "${MIGRATION_RUNNER}" in
        local)
            run_local_server_script "${script_name}"
            ;;
        docker-image)
            run_docker_image_server_script "${script_name}"
            ;;
        *)
            printf '非法迁移执行器：%s\n' "${MIGRATION_RUNNER}" >&2
            exit 1
            ;;
    esac
}

require_command docker
require_config OPENVIKING_DB_HOST "${DB_HOST}"
require_config OPENVIKING_DB_USER "${DB_USER}"
require_config OPENVIKING_DB_PASS "${DB_PASS}"
require_config OPENVIKING_DB_NAME "${DB_NAME}"

if [[ "${MIGRATION_RUNNER}" == "local" ]]; then
    require_command pnpm
    if [[ ! -d "${REPO_ROOT}/node_modules" ]]; then
        printf '未找到 node_modules，请先执行 pnpm install，或设置 OPENVIKING_MIGRATION_RUNNER=docker-image。\n' >&2
        exit 1
    fi
fi

write_step "拉取 PostgreSQL 客户端镜像 ${POSTGRES_CLIENT_IMAGE}"
docker pull "${POSTGRES_CLIENT_IMAGE}"

write_step "检查数据库 ${DB_NAME}"
db_exists="$(psql_scalar "${MAINTENANCE_DB}" "SELECT 1 FROM pg_database WHERE datname = $(sql_literal "${DB_NAME}");")"
if [[ "${db_exists}" == "1" ]]; then
    printf '数据库 %s 已存在，跳过创建。\n' "${DB_NAME}"
else
    write_step "创建数据库 ${DB_NAME}"
    psql_exec "${MAINTENANCE_DB}" "CREATE DATABASE $(pg_identifier "${DB_NAME}");"
fi

write_step '确保 uuid-ossp 扩展已启用'
psql_exec "${DB_NAME}" 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'

if [[ "${MIGRATION_RUNNER}" == "docker-image" && "${BUILD_SERVER_IMAGE}" == "true" ]]; then
    write_step "构建后端迁移镜像 ${SERVER_IMAGE_NAME}"
    docker build -f "${REPO_ROOT}/Dockerfile.server" -t "${SERVER_IMAGE_NAME}" "${REPO_ROOT}"
fi

write_step '执行 TypeORM 增量迁移'
run_server_script migration:run

if [[ "${ENSURE_PLATFORM_ADMIN}" != "false" ]]; then
    write_step '确保平台超管账号存在'
    psql_exec "${DB_NAME}" "
INSERT INTO \"users\" (\"username\", \"password_hash\", \"role\", \"tenant_id\", \"active\")
SELECT $(sql_literal "${PLATFORM_ADMIN_USERNAME}"), $(sql_literal "${PLATFORM_ADMIN_PASSWORD_HASH}"), 'super_admin', NULL, true
WHERE NOT EXISTS (
  SELECT 1
  FROM \"users\"
  WHERE \"username\" = $(sql_literal "${PLATFORM_ADMIN_USERNAME}")
    AND \"tenant_id\" IS NULL
);
"
fi

if [[ "${SHOW_MIGRATION_STATUS}" != "false" ]]; then
    write_step '查看迁移状态'
    run_server_script migration:show
fi

printf '\n数据库迁移与初始化完成。\n'
printf '数据库：%s:%s/%s\n' "${DB_HOST}" "${DB_PORT}" "${DB_NAME}"
