#requires -Version 5.1

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = (Resolve-Path (Join-Path $ScriptRoot '..')).Path

# =========================
# 数据库配置区
# =========================
# 所有敏感信息默认从环境变量读取，避免把真实连接信息提交到 Git。
# 可在 scripts/db-migrate.local.ps1 中覆盖这些变量，该文件已加入 .gitignore。
$DbHost = $env:OPENVIKING_DB_HOST
$DbPort = if ($env:OPENVIKING_DB_PORT) { [int]$env:OPENVIKING_DB_PORT } else { 5432 }
$DbUser = $env:OPENVIKING_DB_USER
$DbPassword = $env:OPENVIKING_DB_PASS
$DbName = if ($env:OPENVIKING_DB_NAME) { $env:OPENVIKING_DB_NAME } else { 'openviking_admin' }
$MaintenanceDb = if ($env:OPENVIKING_DB_MAINTENANCE_DB) { $env:OPENVIKING_DB_MAINTENANCE_DB } else { 'postgres' }

# =========================
# Docker 执行配置区
# =========================
$PostgresClientImage = if ($env:OPENVIKING_POSTGRES_CLIENT_IMAGE) { $env:OPENVIKING_POSTGRES_CLIENT_IMAGE } else { 'postgres:16-alpine' }
$ServerImageName = if ($env:OPENVIKING_SERVER_IMAGE_NAME) { $env:OPENVIKING_SERVER_IMAGE_NAME } else { 'openviking-admin-server:migration' }
$ShowMigrationStatus = $env:OPENVIKING_SHOW_MIGRATION_STATUS -ne 'false'

# =========================
# 迁移执行配置区
# =========================
# local：使用当前机器已安装的 pnpm 执行迁移，适合已经拉取仓库的 Docker 部署机。
# docker-image：构建并使用后端镜像执行迁移，适合没有 Node/pnpm 的纯容器环境。
$MigrationRunner = if ($env:OPENVIKING_MIGRATION_RUNNER) { $env:OPENVIKING_MIGRATION_RUNNER } else { 'local' }
$BuildServerImage = $env:OPENVIKING_BUILD_SERVER_IMAGE -eq 'true'

# =========================
# 初始化数据配置区
# =========================
# 与首个 migration 保持一致：默认超管账号 admin / Admin@2026。
# 重复执行时仅在平台 admin 不存在时插入，不覆盖已有账号。
$EnsurePlatformAdmin = $env:OPENVIKING_ENSURE_PLATFORM_ADMIN -ne 'false'
$PlatformAdminUsername = if ($env:OPENVIKING_PLATFORM_ADMIN_USERNAME) { $env:OPENVIKING_PLATFORM_ADMIN_USERNAME } else { 'admin' }
$PlatformAdminPasswordHash = if ($env:OPENVIKING_PLATFORM_ADMIN_PASSWORD_HASH) { $env:OPENVIKING_PLATFORM_ADMIN_PASSWORD_HASH } else { '$2b$10$MPKX/woij0we1gqVnbEX0.VsfiV8OGXoU6L1/ghVkuqsmZepx5OIK' }

$LocalConfigPath = Join-Path $ScriptRoot 'db-migrate.local.ps1'
if (Test-Path $LocalConfigPath) {
    . $LocalConfigPath
}

function Assert-CommandExists {
    param([Parameter(Mandatory = $true)][string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Command not found: $Name. Please install and start Docker first."
    }
}

function Assert-MigrationRunner {
    if ($MigrationRunner -notin @('local', 'docker-image')) {
        throw "Invalid migration runner: $MigrationRunner"
    }

    if ($MigrationRunner -eq 'local') {
        Assert-CommandExists -Name 'pnpm'

        if (-not (Test-Path (Join-Path $RepoRoot 'node_modules'))) {
            throw 'node_modules not found. Please run pnpm install first, or set $MigrationRunner = "docker-image".'
        }
    }
}

function Assert-Config {
    if ([string]::IsNullOrWhiteSpace($DbHost)) {
        throw 'Please configure OPENVIKING_DB_HOST or $DbHost first.'
    }

    if ([string]::IsNullOrWhiteSpace($DbUser)) {
        throw 'Please configure OPENVIKING_DB_USER or $DbUser first.'
    }

    if ([string]::IsNullOrWhiteSpace($DbPassword)) {
        throw 'Please set database password first. Recommended: $env:OPENVIKING_DB_PASS="your_password"'
    }

    if ([string]::IsNullOrWhiteSpace($DbName)) {
        throw 'Please configure $DbName first.'
    }
}

function Invoke-Docker {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)

    & docker @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Docker command failed with exit code: $LASTEXITCODE."
    }
}

function Invoke-DockerWithOutput {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)

    $output = & docker @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        $message = ($output | Out-String).Trim()
        if ([string]::IsNullOrWhiteSpace($message)) {
            $message = "Docker command failed with exit code: $LASTEXITCODE."
        }
        throw $message
    }

    return ($output | Out-String).Trim()
}

function Invoke-LocalServerScript {
    param([Parameter(Mandatory = $true)][string]$ScriptName)

    $envKeys = @(
        'DB_HOST',
        'DB_PORT',
        'DB_USER',
        'DB_PASS',
        'DB_NAME',
        'DB_SYNCHRONIZE',
        'NODE_ENV'
    )
    $previousValues = @{}

    foreach ($key in $envKeys) {
        $previousValues[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
    }

    try {
        $env:DB_HOST = $DbHost
        $env:DB_PORT = [string]$DbPort
        $env:DB_USER = $DbUser
        $env:DB_PASS = $DbPassword
        $env:DB_NAME = $DbName
        $env:DB_SYNCHRONIZE = 'false'
        $env:NODE_ENV = 'production'

        Push-Location $RepoRoot
        try {
            & pnpm --filter server run $ScriptName
            if ($LASTEXITCODE -ne 0) {
                throw "pnpm server script failed: $ScriptName, exit code: $LASTEXITCODE."
            }
        } finally {
            Pop-Location
        }
    } finally {
        foreach ($key in $envKeys) {
            $value = $previousValues[$key]
            if ($null -eq $value) {
                [Environment]::SetEnvironmentVariable($key, $null, 'Process')
            } else {
                [Environment]::SetEnvironmentVariable($key, $value, 'Process')
            }
        }
    }
}

function Invoke-DockerImageServerScript {
    param([Parameter(Mandatory = $true)][string]$ScriptName)

    Invoke-Docker @(
        'run',
        '--rm',
        '-e',
        "DB_HOST=$DbHost",
        '-e',
        "DB_PORT=$DbPort",
        '-e',
        "DB_USER=$DbUser",
        '-e',
        "DB_PASS=$DbPassword",
        '-e',
        "DB_NAME=$DbName",
        '-e',
        'DB_SYNCHRONIZE=false',
        '-e',
        'NODE_ENV=production',
        $ServerImageName,
        'pnpm',
        '--filter',
        'server',
        'run',
        $ScriptName
    )
}

function Invoke-ServerMigrationScript {
    param([Parameter(Mandatory = $true)][string]$ScriptName)

    if ($MigrationRunner -eq 'local') {
        Invoke-LocalServerScript -ScriptName $ScriptName
        return
    }

    Invoke-DockerImageServerScript -ScriptName $ScriptName
}

function New-PsqlArgs {
    param(
        [Parameter(Mandatory = $true)][string]$Database,
        [Parameter(Mandatory = $true)][string]$Sql,
        [string[]]$Variables = @(),
        [switch]$TuplesOnly
    )

    $args = @(
        'run',
        '--rm',
        '-e',
        "PGPASSWORD=$DbPassword",
        $PostgresClientImage,
        'psql',
        '-h',
        $DbHost,
        '-p',
        [string]$DbPort,
        '-U',
        $DbUser,
        '-d',
        $Database,
        '-v',
        'ON_ERROR_STOP=1'
    )

    foreach ($variable in $Variables) {
        $args += @('-v', $variable)
    }

    if ($TuplesOnly) {
        $args += '-tAc'
    } else {
        $args += '-c'
    }

    $args += $Sql
    return $args
}

function Invoke-Psql {
    param(
        [Parameter(Mandatory = $true)][string]$Database,
        [Parameter(Mandatory = $true)][string]$Sql,
        [string[]]$Variables = @()
    )

    Invoke-Docker (New-PsqlArgs -Database $Database -Sql $Sql -Variables $Variables)
}

function Invoke-PsqlScalar {
    param(
        [Parameter(Mandatory = $true)][string]$Database,
        [Parameter(Mandatory = $true)][string]$Sql,
        [string[]]$Variables = @()
    )

    $output = Invoke-DockerWithOutput (New-PsqlArgs -Database $Database -Sql $Sql -Variables $Variables -TuplesOnly)
    $lines = @($output -split '\r?\n' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($lines.Count -eq 0) {
        return ''
    }

    return $lines[-1].Trim()
}

function Write-Step {
    param([Parameter(Mandatory = $true)][string]$Message)

    Write-Host ''
    Write-Host "==> $Message"
}

function ConvertTo-PgIdentifier {
    param([Parameter(Mandatory = $true)][string]$Value)

    if ($Value -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
        throw "Invalid PostgreSQL identifier: $Value"
    }

    return '"' + $Value.Replace('"', '""') + '"'
}

function ConvertTo-SqlLiteral {
    param([Parameter(Mandatory = $true)][string]$Value)

    return "'" + $Value.Replace("'", "''") + "'"
}

Assert-CommandExists -Name 'docker'
Assert-Config
Assert-MigrationRunner

Write-Step "Pull PostgreSQL client image $PostgresClientImage"
Invoke-Docker @('pull', $PostgresClientImage)

Write-Step "Check database $DbName"
$dbExists = Invoke-PsqlScalar `
    -Database $MaintenanceDb `
    -Sql "SELECT 1 FROM pg_database WHERE datname = $(ConvertTo-SqlLiteral $DbName);"

if ($dbExists -eq '1') {
    Write-Host "Database $DbName already exists, skip creation."
} else {
    Write-Step "Create database $DbName"
    Invoke-Psql `
        -Database $MaintenanceDb `
        -Sql "CREATE DATABASE $(ConvertTo-PgIdentifier $DbName);"
}

Write-Step 'Ensure uuid-ossp extension'
Invoke-Psql `
    -Database $DbName `
    -Sql 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'

if ($MigrationRunner -eq 'docker-image' -and $BuildServerImage) {
    Write-Step "Build server migration image $ServerImageName"
    Invoke-Docker @(
        'build',
        '-f',
        (Join-Path $RepoRoot 'Dockerfile.server'),
        '-t',
        $ServerImageName,
        $RepoRoot
    )
}

Write-Step 'Run TypeORM incremental migrations'
Invoke-ServerMigrationScript -ScriptName 'migration:run'

if ($EnsurePlatformAdmin) {
    Write-Step 'Ensure platform admin exists'
    Invoke-Psql `
        -Database $DbName `
        -Sql @"
INSERT INTO "users" ("username", "password_hash", "role", "tenant_id", "active")
SELECT $(ConvertTo-SqlLiteral $PlatformAdminUsername), $(ConvertTo-SqlLiteral $PlatformAdminPasswordHash), 'super_admin', NULL, true
WHERE NOT EXISTS (
  SELECT 1
  FROM "users"
  WHERE "username" = $(ConvertTo-SqlLiteral $PlatformAdminUsername)
    AND "tenant_id" IS NULL
);
"@
}

if ($ShowMigrationStatus) {
    Write-Step 'Show migration status'
    Invoke-ServerMigrationScript -ScriptName 'migration:show'
}

Write-Host ''
Write-Host 'Database migration and initialization completed.'
Write-Host "Database: ${DbHost}:${DbPort}/$DbName"
