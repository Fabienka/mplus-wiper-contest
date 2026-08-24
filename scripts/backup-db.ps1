<#
  Zaloha lokalni PostgreSQL databaze (DATABASE_URL z .env) pomoci pg_dump.
  Spoustet primo (npm run backup:db) nebo automaticky pres naplanovanou ulohu
  (viz scripts/register-backup-task.ps1).
#>

param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
    [int]$RetentionDays = 30
)

$ErrorActionPreference = "Stop"

$envPath = Join-Path $ProjectRoot ".env"
if (-not (Test-Path $envPath)) {
    throw "Nenalezen .env v $envPath"
}

$databaseUrlLine = Get-Content $envPath | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
if (-not $databaseUrlLine) {
    throw "DATABASE_URL nenalezena v $envPath"
}

$databaseUrl = ($databaseUrlLine -split '=', 2)[1].Trim().Trim('"')

if ($databaseUrl -notmatch '^postgresql://(?<user>[^:@]+):(?<pass>[^@]*)@(?<host>[^:/]+):(?<port>\d+)/(?<db>[^?]+)') {
    throw "Nepodarilo se rozparsovat DATABASE_URL: $databaseUrl"
}

$dbUser = $Matches.user
$dbPass = [System.Uri]::UnescapeDataString($Matches.pass)
$dbHost = $Matches.host
$dbPort = $Matches.port
$dbName = $Matches.db

# pg_dump.exe casto neni v PATH (Windows instalace ho tam nepridava automaticky) -
# zkusi se PATH, pak typicka instalacni cesta PostgreSQL.
$pgDump = Get-Command pg_dump.exe -ErrorAction SilentlyContinue
if ($pgDump) {
    $pgDumpPath = $pgDump.Source
} else {
    $candidate = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\pg_dump.exe" -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending | Select-Object -First 1
    if (-not $candidate) {
        throw "pg_dump.exe nenalezen v PATH ani v 'C:\Program Files\PostgreSQL\*\bin'."
    }
    $pgDumpPath = $candidate.FullName
}

$backupDir = Join-Path $ProjectRoot "backups"
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = Join-Path $backupDir "$dbName`_$timestamp.sql"
$logFile = Join-Path $backupDir "backup.log"

function Write-Log($message) {
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $message
    Add-Content -Path $logFile -Value $line
}

$env:PGPASSWORD = $dbPass
try {
    & $pgDumpPath --host=$dbHost --port=$dbPort --username=$dbUser --format=plain --file=$backupFile $dbName
    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump skoncil s chybovym kodem $LASTEXITCODE"
    }
    $sizeKb = [math]::Round((Get-Item $backupFile).Length / 1KB, 1)
    Write-Log "OK - $backupFile ($sizeKb KB)"
}
catch {
    Write-Log "CHYBA - $($_.Exception.Message)"
    throw
}
finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}

# Uklid starych zaloh nad ramec retence.
$cutoff = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem $backupDir -Filter "$dbName`_*.sql" |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    ForEach-Object {
        Remove-Item $_.FullName -Force
        Write-Log "Smazana stara zaloha (nad $RetentionDays dni): $($_.Name)"
    }
