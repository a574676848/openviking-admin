$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "install-ova-cli.mjs"
node $scriptPath @args
