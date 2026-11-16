$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$tools = Join-Path $projectRoot '.tools'
$runtime = Join-Path $tools 'node-v22.23.4-win-x64'
New-Item -ItemType Directory -Force $tools | Out-Null
if (-not (Test-Path (Join-Path $runtime 'node.exe'))) {
    $archive = Join-Path $tools 'node.zip'
    $checksums = Join-Path $tools 'SHASUMS256.txt'
    Invoke-WebRequest 'https://nodejs.org/dist/v22.23.4/SHASUMS256.txt' -OutFile $checksums
    Invoke-WebRequest 'https://nodejs.org/dist/v22.23.4/node-v22.23.4-win-x64.zip' -OutFile $archive
    $expected = ((Get-Content $checksums | Select-String ' node-v22.23.4-win-x64.zip$').ToString() -split '\s+')[0]
    $actual = (Get-FileHash $archive -Algorithm SHA256).Hash.ToLower()
    if (-not $expected -or $actual -ne $expected) { throw 'No coincide la huella del archivo oficial de Node.' }
    Expand-Archive -LiteralPath $archive -DestinationPath $tools -Force
}
$previousPath = $env:PATH
$previousCache = $env:npm_config_cache
$previousOffline = $env:npm_config_offline
try {
    $localBins = Join-Path $tools 'pnpm/node_modules/.bin'
    $env:PATH = "$runtime;$localBins;$previousPath"
    $env:npm_config_cache = Join-Path $projectRoot '.cache/npm'
    $env:npm_config_offline = 'false'
    $nodeExe = Join-Path $runtime 'node.exe'
    if ((& $nodeExe --version) -ne 'v22.23.4') { throw 'La versión local de Node no coincide.' }
    & $nodeExe (Join-Path $runtime 'node_modules/npm/bin/npm-cli.js') install --prefix (Join-Path $tools 'pnpm') --no-audit --no-fund pnpm@10.6.3
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar pnpm.' }
    Push-Location $projectRoot
    try {
        & $nodeExe (Join-Path $tools 'pnpm/node_modules/pnpm/bin/pnpm.cjs') install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias fijadas.' }
    } finally { Pop-Location }
} finally {
    $env:PATH = $previousPath
    $env:npm_config_cache = $previousCache
    $env:npm_config_offline = $previousOffline
}
Write-Output 'Entorno local preparado: Node 22.23.4 y pnpm 10.6.3.'
