# Uses project-local tools without changing the global Node/pnpm installation.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$runtime = Join-Path $projectRoot '.tools/node-v22.23.4-win-x64'
$pnpmCli = Join-Path $projectRoot '.tools/pnpm/node_modules/pnpm/bin/pnpm.cjs'
if (-not (Test-Path (Join-Path $runtime 'node.exe')) -or -not (Test-Path $pnpmCli)) {
    throw 'Falta el entorno local. Ejecuta .\scripts\setup.ps1 primero.'
}
$previousPath = $env:PATH
try {
    $localBins = Join-Path $projectRoot '.tools/pnpm/node_modules/.bin'
    $env:PATH = "$runtime;$localBins;$previousPath"
    Push-Location $projectRoot
    try {
        & (Join-Path $runtime 'node.exe') $pnpmCli @args
        $commandExit = $LASTEXITCODE
    } finally { Pop-Location }
} finally { $env:PATH = $previousPath }
exit $commandExit
