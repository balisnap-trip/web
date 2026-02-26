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
$env:INGEST_SERVICE_TOKEN = "dev-service-token"
$env:INGEST_SERVICE_SECRET = "dev-service-secret"
$env:INGEST_WEBHOOK_ENABLED = "true"
$env:INGEST_QUEUE_ENABLED = "false"
$env:INGEST_REPLAY_ENABLED = "true"
$env:INGEST_SYNC_FALLBACK_ENABLED = "true"
$env:PORT = "4100"

$env:PHASE2_BATCH_CODE = "F"
$env:RUN_EVIDENCE_QUALITY_CHECK = "true"
$env:RUN_EVIDENCE_INGEST_GATES = "true"
$env:RUN_EVIDENCE_INGEST_DUPLICATE_GATE = "true"
$env:RUN_EVIDENCE_INGEST_RETENTION_GATE = "true"
$env:RUN_EVIDENCE_INGEST_REPLAY_DRILL = "true"
$env:RUN_EVIDENCE_CATALOG_GATE = "true"
$env:RUN_EVIDENCE_BOOKING_GATE = "true"
$env:RUN_EVIDENCE_PAYMENT_GATE = "true"

$env:GATE_PROCESSING_MIN_SUCCESS_RATE = "0"
$env:GATE_PROCESSING_MIN_RECEIVED = "0"
$env:GATE_PROCESSING_MIN_LATENCY_SAMPLE = "0"
$env:GATE_PROCESSING_MAX_MEDIAN_MS = "600000"
$env:GATE_PROCESSING_MAX_P95_MS = "600000"
$env:GATE_DLQ_WINDOW_MINUTES = "1"
$env:GATE_DLQ_SAMPLE_INTERVAL_SECONDS = "5"
$env:GATE_DLQ_MAX_GROWTH_PER_HOUR = "1000"
$env:GATE_DLQ_MAX_FETCH_ERRORS = "0"

$server = Start-Process -FilePath "node" -ArgumentList "apps/core-api/dist/main.js" -PassThru

try {
  Start-Sleep -Seconds 6
  node -e "fetch('http://localhost:4100/health').then(r=>{console.log('HEALTH4100='+r.status); process.exit(r.ok?0:1)}).catch(e=>{console.error(e.message); process.exit(1)})"
  pnpm --filter @bst/core-api release:evidence
}
finally {
  if ($server -and -not $server.HasExited) {
    Stop-Process -Id $server.Id -Force
  }
}
