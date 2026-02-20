# Runbook Ops Read Parity Gate (Batch G)

Tanggal: 2026-02-20  
Scope: validasi gate `BG-01` untuk cutover read ops (`bstadmin` -> `core-api`).

## 1. Tujuan

1. Memastikan parity data read model booking (`list` + `detail`) terhadap legacy.
2. Menjadi evidence Go/No-Go sebelum rollout `OPS_READ_NEW_MODEL_ENABLED`.

## 2. Prasyarat

1. `bstadmin` dapat membaca legacy DB (`SYNC_DATABASE_URL` atau `DATABASE_URL`).
2. `core-api` endpoint ops booking dapat diakses (`CORE_API_BASE_URL`).
3. Token admin core-api tersedia (`CORE_API_ADMIN_TOKEN`).
4. Data bridge booking (`booking_core`) sudah terisi untuk window evaluasi.

## 3. Perintah Eksekusi

### 3.1 Baseline Local (opsional, tanpa coverage minimum)

```powershell
$env:OPS_READ_PARITY_MIN_MATCHED_ROWS='0'
pnpm --filter bst-admin gate:ops-read-parity
Remove-Item Env:OPS_READ_PARITY_MIN_MATCHED_ROWS
```

Default script:

1. `OPS_READ_PARITY_SAMPLE_LIMIT=200`
2. `OPS_READ_DETAIL_SAMPLE_SIZE=50`
3. `OPS_READ_PARITY_MAX_MISMATCH_RATIO=0.01`
4. `OPS_READ_PARITY_MIN_MATCHED_ROWS=50`

### 3.2 Gate Staging/Production (coverage wajib)

```powershell
$env:OPS_READ_PARITY_MIN_MATCHED_ROWS='50'
pnpm --filter bst-admin gate:ops-read-parity
Remove-Item Env:OPS_READ_PARITY_MIN_MATCHED_ROWS
```

Catatan:

1. Gunakan `OPS_READ_PARITY_MIN_MATCHED_ROWS>=50` (atau sesuai volume operasional).
2. Jika `matchedRows` rendah, lakukan backfill/sinkronisasi `booking_core` dulu.
3. Prioritas URL DB gate: `OPS_READ_PARITY_DATABASE_URL` -> `SYNC_DATABASE_URL` -> `DATABASE_URL`.

### 3.3 Drill Assignment Sync (T-008-03)

```powershell
pnpm --filter bst-admin drill:ops-assignment-sync
```

Opsional:

1. `OPS_ASSIGNMENT_DRILL_DRIVER_ID` untuk override driver id dummy pada drill.

## 4. Workflow GitHub

Manual run:

1. `.github/workflows/ops-read-parity-gate.yml`

Required secrets:

1. `BSTADMIN_DATABASE_URL`
2. `CORE_API_BASE_URL`
3. `CORE_API_ADMIN_TOKEN`

## 5. Evidence Output

1. `reports/gates/ops-read-parity/{timestamp}.json`
2. `reports/gates/ops-read-parity/{timestamp}.md`

## 6. Interpretasi Hasil

Gate dinyatakan `PASS` jika:

1. `BG-01_list_parity_ratio` lulus,
2. `BG-01_min_matched_rows` lulus,
3. `BG-01_detail_parity_ratio` lulus,
4. `BG-01_detail_critical_fields` lulus,
5. `BG-01_detail_fetch_errors` lulus.

Jika `matchedRows=0` pada run strict:

1. anggap batch G `HOLD`,
2. isi data bridge lebih dulu,
3. jalankan ulang gate sampai `PASS`.

## 7. Evidence Snapshot Terbaru (2026-02-20)

1. Runtime staging aktif:
   1. release: `/home/bonk/stagging-bst/releases/20260220T051228Z`
   2. health: `http://127.0.0.1:4100/health` (`status=ok`)
2. Backfill booking bridge staging (`PASS`):
   1. `/home/bonk/stagging-bst/releases/20260220T051228Z/reports/recon/D/2026-02-20T05-18-50-512Z-booking-bridge-backfill.json`
3. Gate `BG-01` strict staging (`PASS`, `matchedRows=96`):
   1. `/home/bonk/stagging-bst/releases/20260220T051228Z/reports/gates/ops-read-parity/2026-02-20T06-00-10-640Z.json`
4. Drill assignment sync `T-008-03` staging (`PASS`):
   1. `/home/bonk/stagging-bst/releases/20260220T051228Z/reports/gates/ops-assignment-sync/2026-02-20T06-00-11-725Z.json`
