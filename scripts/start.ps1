$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$nodeExe = Join-Path $projectRoot '.tools/node-v22.23.4-win-x64/node.exe'
if (-not (Test-Path -LiteralPath $nodeExe)) { throw 'Falta el entorno local. Ejecuta scripts/setup.ps1 primero.' }
& $nodeExe (Join-Path $PSScriptRoot 'start.mjs')
exit $LASTEXITCODE
