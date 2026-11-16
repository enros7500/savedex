param([Parameter(Mandatory=$true)][string]$Spec, [Parameter(Mandatory=$true)][int]$OwnerPid)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
    $ownerProcess = [System.Diagnostics.Process]::GetProcessById($OwnerPid)
    $ownerHandle = $ownerProcess.Handle
    $configuration = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Spec)) | ConvertFrom-Json
    Add-Type -Path (Join-Path $PSScriptRoot 'windows-job.cs') -ErrorAction Stop
    $resultCode = [Savedex.NativeJob]::Run([string]$configuration.executable, [string[]]$configuration.arguments, $ownerHandle, [int]$configuration.deadlineMs)
    exit $resultCode
} catch {
    [Console]::Error.WriteLine('Savedex supervisor: ' + $_.Exception.ToString())
    if ($_.Exception.ToString().Contains('CLEANUP_FAILED')) { exit 125 }
    exit 126
} finally {
    if ($ownerProcess) { $ownerProcess.Dispose() }
}
