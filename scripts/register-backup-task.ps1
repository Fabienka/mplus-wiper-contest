<#
  Zaregistruje naplanovanou ulohu Windows, ktera spousti scripts/backup-db.ps1
  dvakrat denne (08:00 a 20:00). Bezi pod aktualnim uzivatelem, jen kdyz je
  prihlaseny (zadne ulozene heslo, zadna potreba admin prav).

  Spustit rucne jednou: powershell -ExecutionPolicy Bypass -File scripts/register-backup-task.ps1
  Pro zmenu casu upravte $Times nize a skript spustte znovu (uloha se prepise).
#>

param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
    [string[]]$Times = @("08:00", "20:00"),
    [string]$TaskName = "WowMplusApp-DbBackup"
)

$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $ProjectRoot "scripts\backup-db.ps1"
if (-not (Test-Path $scriptPath)) {
    throw "Nenalezen $scriptPath"
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`"" `
    -WorkingDirectory $ProjectRoot

$triggers = $Times | ForEach-Object { New-ScheduledTaskTrigger -Daily -At $_ }

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopOnIdleEnd `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Puvodni uloha '$TaskName' odstranena, registruji znovu."
}

Register-ScheduledTask -TaskName $TaskName `
    -Action $action `
    -Trigger $triggers `
    -Settings $settings `
    -Description "Zaloha PostgreSQL databaze wow-mplus-app (dvakrat denne, pg_dump)." | Out-Null

Write-Host "Uloha '$TaskName' zaregistrovana. Spousti se v: $($Times -join ', ')"
Write-Host "Bezi jen kdyz je uzivatel prihlaseny (bez ulozeneho hesla). Kontrola: Get-ScheduledTask -TaskName '$TaskName'"
