$ErrorActionPreference = "Stop"

$opsLine = Get-Content -Path "balisnap/.env" | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if (-not $opsLine) {
  throw "DATABASE_URL not found in balisnap/.env"
}

$opsUrl = $opsLine.Substring("DATABASE_URL=".Length).Trim()
if (($opsUrl.StartsWith('"') -and $opsUrl.EndsWith('"')) -or ($opsUrl.StartsWith("'") -and $opsUrl.EndsWith("'"))) {
  $opsUrl = $opsUrl.Substring(1, $opsUrl.Length - 2).Trim()
}

$env:OPS_DB_URL = $opsUrl
$env:CHANNEL_DB_URL = $opsUrl
$env:CORE_API_BASE_URL = "http://localhost:4100"
$env:CORE_API_ADMIN_TOKEN = "dev-admin-token"
$env:CORE_API_ADMIN_ROLE = "ADMIN"
$env:PORT = "4100"
$env:ADMIN_AUTH_ENABLED = "true"

$env:OPS_READ_PARITY_MIN_MATCHED_ROWS = "50"
$env:OPS_READ_DETAIL_SAMPLE_SIZE = "50"
$env:OPS_READ_PARITY_SAMPLE_LIMIT = "200"
$env:OPS_READ_PARITY_MAX_MISMATCH_RATIO = "0.01"

$server = Start-Process -FilePath "node" -ArgumentList "apps/core-api/dist/main.js" -PassThru

try {
  Start-Sleep -Seconds 6
  node -e "fetch('http://localhost:4100/health').then(r=>{console.log('HEALTH4100='+r.status); process.exit(r.ok?0:1)}).catch(e=>{console.error(e.message); process.exit(1)})"
  $headers = @{ Authorization = "Bearer dev-admin-token"; "x-admin-role" = "ADMIN" }
  $opsList = Invoke-RestMethod -Uri "http://localhost:4100/v1/ops/bookings" -Headers $headers -Method Get -TimeoutSec 15
  if ($opsList -and $opsList.data) {
    Write-Host ("CORE4100_BOOKING_COUNT=" + $opsList.data.Count)
  } else {
    Write-Host "CORE4100_BOOKING_COUNT=0"
  }

  pnpm --filter bst-admin gate:ops-read-parity
  pnpm --filter bst-admin drill:ops-assignment-sync
}
finally {
  if ($server -and -not $server.HasExited) {
    Stop-Process -Id $server.Id -Force
  }
}
