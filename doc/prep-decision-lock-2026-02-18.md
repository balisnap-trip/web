# Decision Lock (Detailed ADR Set)

Tanggal lock: 2026-02-18  
Status: aktif dan mengikat untuk implementasi.

Dokumen ini berfungsi sebagai kumpulan ADR (Architecture Decision Record) level proyek.

## ADR-001: Delivery Strategy

1. Keputusan:
   1. `Dual-Run` bertahap.
2. Alasan:
   1. dua aplikasi sekarang hidup terpisah dan production-like,
   2. risiko regressions tinggi jika big-bang.
3. Alternatif ditolak:
   1. big-bang rewrite + one-shot cutover.
4. Dampak:
   1. perlu compatibility adapters sementara,
   2. perlu observability dan feature flags.

## ADR-002: Core Backend Framework

1. Keputusan:
   1. backend inti menggunakan `NestJS`.
2. Alasan:
   1. governance kuat untuk tim IT yang akan membesar,
   2. pola module/DI/guard cocok untuk domain kompleks.
3. Alternatif ditolak:
   1. mempertahankan domain tersebar di dua Next app.
4. Dampak:
   1. dibutuhkan `apps/core-api`,
   2. perlu kontrak lintas app yang formal.

## ADR-003: Architecture Evolution Pattern

1. Keputusan:
   1. `Hybrid Modulith -> Micro`.
2. Alasan:
   1. menjaga kontrol kompleksitas sekarang,
   2. tetap siap scale tanpa rewrite total.
3. Dampak:
   1. boundaries module wajib ketat dari hari pertama,
   2. event contracts harus versioned.

## ADR-004: API Contract Style

1. Keputusan:
   1. `REST + OpenAPI`.
2. Alasan:
   1. paling mudah distandardisasi lintas web/admin/content manager,
   2. mudah untuk audit dan contract testing.
3. Dampak:
   1. semua endpoint baru wajib terdokumentasi OpenAPI,
   2. breaking changes wajib version bump.

## ADR-005: Domain Separation

1. Keputusan:
   1. `admin operasional` dan `content manager` dipisah domain.
2. Alasan:
   1. peran bisnis berbeda,
   2. lifecycle data berbeda.
3. Dampak:
   1. tidak ada direct write antar DB aplikasi,
   2. integrasi dilakukan via contracts.

## ADR-006: Data Topology

1. Keputusan:
   1. `dual DB` dipertahankan pada fase transisi.
2. Aturan:
   1. dilarang cross-db join di runtime business logic,
   2. dilarang menjadikan sync DB dua arah sebagai contract bisnis utama.
3. Dampak:
   1. perlu event/API bridge yang jelas,
   2. perlu reconciliation pipelines.

## ADR-007: Ingestion Model

1. Keputusan:
   1. non-email channels masuk melalui `Webhook + Queue`.
2. Alasan:
   1. tahan lonjakan traffic,
   2. retry-safe dan lebih mudah diaudit.
3. Dampak:
   1. idempotency key wajib,
   2. DLQ + replay endpoint wajib.

## ADR-008: Legacy Compatibility

1. Keputusan:
   1. endpoint existing tetap hidup selama dual-run.
2. Aturan:
   1. response aliases legacy dipertahankan sementara,
   2. payment safety checks existing tidak boleh diturunkan,
   3. enum source `bstadmin` tetap non-breaking di fase awal.

## ADR-009: Status Domain Model

1. Keputusan:
   1. tidak melakukan forced merge satu enum global untuk semua status.
2. Model:
   1. `customer_payment_status`
   2. `ops_fulfillment_status`
3. Dampak:
   1. mapping status dilakukan di service layer,
   2. transisi data lebih aman terhadap flow existing.

## ADR-010: Ownership Write Path

1. Keputusan:
   1. `core-api` menjadi single-writer target domain baru secara bertahap.
2. Aturan transisi:
   1. dual-write hanya jika ada reconciliation report,
   2. penutupan write path legacy dilakukan per modul.

## ADR-011: Frontend UI/UX Continuity and Standardization

1. Keputusan:
   1. mempertahankan UI/UX existing sebagai baseline utama,
   2. menstandarkan area/component yang belum konsisten mulai fase sekarang,
   3. `content manager` wajib menggunakan basis UI framework/modul yang sama dengan `admin-ops`,
   4. `public web` tetap menggunakan gaya UI/UX asli (tanpa redesign total).
2. Alasan:
   1. menjaga familiarity user operasional dan customer,
   2. menghindari biaya redesign besar saat fokus utama adalah stabilitas domain core,
   3. mempercepat delivery content manager dengan reuse pattern admin yang sudah matang.
3. Aturan:
   1. dilarang full visual redesign untuk `public web` pada fase migrasi inti,
   2. perbaikan UI/UX hanya pada konsistensi, aksesibilitas, dan usability bug,
   3. design token/component admin dijadikan sumber tunggal untuk `admin-ops` dan `content manager`,
   4. pattern baru di `content manager` harus di-backport ke shared UI package admin jika reusable.
4. Dampak:
   1. perlu inventory komponen admin existing,
   2. perlu shared UI package untuk admin + content manager,
   3. perlu visual regression checks agar perubahan tidak merusak baseline web publik.
5. Dokumen turunan wajib:
   1. `doc/prep-ui-ux-standardization-spec-2026-02-18.md`.

## ADR-012: Naming Canonical and Domain Lexicon Lock

Tanggal update: 2026-02-19.

1. Keputusan:
   1. canonical catalog term: `Product + Variant`,
   2. `Package` dipertahankan sebagai istilah legacy compatibility,
   3. istilah `category` dipisah domain:
      1. `financeCategory`,
      2. `productCategory`.
2. Keputusan compatibility:
   1. `package_id` tetap polymorphic sementara pada layer compatibility.
3. Alasan:
   1. mengurangi ambiguity naming lintas domain,
   2. tetap menjaga backward compatibility data existing.
4. Dampak:
   1. mapper/adapter wajib memberi label eksplisit untuk field polymorphic,
   2. glossary domain wajib dijadikan referensi tunggal penamaan.

## ADR-013: Language Policy for Naming and UI

Tanggal update: 2026-02-19.

1. Keputusan:
   1. identifier kode, schema alias, dan route internal wajib English,
   2. primary language UI/UX adalah English.
2. Aturan:
   1. tidak menambah identifier baru berbahasa non-English pada codebase,
   2. jika ada kebutuhan bilingual copy, English tetap menjadi baseline.
3. Dampak:
   1. perlu refactor bertahap pada label menu/tab/copy yang belum English-first,
   2. perlu naming lint rule untuk endpoint/module baru.

## ADR-014: Route Alias Cutover Policy

Tanggal update: 2026-02-19.

1. Keputusan:
   1. route alias naming internal/private tidak diberi deprecation window,
   2. route canonical langsung hard cut pada release yang sama.
2. Aturan:
   1. sebelum cut, semua consumer internal harus dipindah di branch release yang sama,
   2. rollback dilakukan via deploy rollback, bukan mempertahankan alias route lama.
3. Dampak:
   1. testing integrasi route wajib lengkap sebelum merge,
   2. dokumentasi kontrak harus diperbarui sebelum release.
4. Supersession:
   1. untuk konteks route naming alias, ADR ini menggantikan ketentuan compatibility route sementara di ADR-008.

## ADR-015: Core Schema Baseline Source

Tanggal update: 2026-02-19.

1. Keputusan:
   1. schema target phase-2 wajib merujuk `doc/prep-core-schema-target-v1-2026-02-19.md`,
   2. dokumen arsip tidak boleh dijadikan source final untuk DDL baru.
2. Dampak:
   1. migration batch A-B harus konsisten 1:1 dengan dokumen schema target aktif,
   2. nama tabel ops resmi: `ops_booking_state`, `ops_assignment`, `ops_finance_bridge`.

## ADR-016: Ingestion Security Handshake Lock

Tanggal update: 2026-02-19.

1. Keputusan:
   1. signature algorithm: `HMAC-SHA256`,
   2. drift window timestamp: maksimal `5 menit`,
   3. nonce TTL replay protection: `10 menit`,
   4. idempotency key TTL: `35 hari`.
2. Dampak:
   1. endpoint ingest wajib menolak nonce reuse, signature mismatch, dan request di luar drift window,
   2. canonical string signature wajib terdokumentasi di `prep-api-contract-v1`.

## ADR-017: Queue Runtime and DLQ Policy Lock

Tanggal update: 2026-02-19.

1. Keputusan:
   1. broker antrean ingest: `Redis + BullMQ`,
   2. retry schedule: `30s`, `2m`, `10m`, `30m`, `2h` (maks 5 attempt),
   3. retention:
      1. success jobs: 14 hari,
      2. failed jobs: 30 hari,
      3. DLQ: 30 hari.
2. Poison-message policy:
   1. non-retryable error langsung DLQ,
   2. replay hanya via endpoint replay ter-audit.

## ADR-018: Id Generation Determinism

Tanggal update: 2026-02-19.

1. Keputusan:
   1. new core write menggunakan UUIDv7,
   2. backfill legacy menggunakan UUIDv5 deterministik (`{source_system}:{source_table}:{source_pk}`).
2. Dampak:
   1. migration rerun menghasilkan ID canonical yang sama,
   2. dedup dan reconciliation menjadi repeatable.

## ADR-019: Dual-Write Conflict Playbook

Tanggal update: 2026-02-19.

1. Keputusan:
   1. dual-write hanya boleh jalan jika conflict playbook aktif per modul,
   2. konflik field kritis wajib menandai `REVIEW_REQUIRED` dan menghentikan rollout modul terkait.
2. SLA resolusi konflik:
   1. severity tinggi: <= 30 menit,
   2. severity menengah: <= 4 jam.

## ADR-020: Versioning vs Hard-Cut Scope

Tanggal update: 2026-02-19.

1. Keputusan:
   1. hard cut route alias hanya untuk endpoint internal/private non-versioned,
   2. endpoint publik/eksternal versioned tetap mengikuti deprecation window (`v1` -> `v2`).
2. Dampak:
   1. tidak ada ambiguitas antara policy versioning dan route alias cutover.

## ADR-021: package_id Compatibility Discriminator and Sunset

Tanggal update: 2026-02-19.

1. Keputusan:
   1. compatibility `package_id` wajib ditemani discriminator `packageRefType`,
   2. canonical reference `packageRefKey` wajib dikirim bila mapping tersedia.
2. Sunset:
   1. target `LEGACY_PACKAGE` tanpa `packageRefKey` = 0 pada `2026-09-30`.
3. Dampak:
   1. risiko ambiguity polymorphic id turun,
   2. jalur hapus alias menjadi terukur.

## ADR-022: Monorepo Tooling Lock

Tanggal update: 2026-02-19.

1. Keputusan:
   1. package manager: `pnpm`,
   2. task orchestration: `Turborepo`,
   3. release versioning package contracts: `Changesets`.
2. Dampak:
   1. EP-001 tidak lagi ambigu tooling,
   2. setup dev/CI lintas app konsisten.

## ADR-023: Deployment Topology Path Lock

Tanggal update: 2026-02-20.

1. Keputusan:
   1. path staging resmi: `/home/bonk/stagging-bst`,
   2. path production core-api resmi: `/home/bonk/backend/core-api-prod`,
   3. alias path staging lama tidak dipakai lagi sebagai alias/symlink.
2. Aturan:
   1. release layout wajib `releases + current + shared + logs`,
   2. `.env` core-api production wajib di `/home/bonk/backend/core-api-prod/shared/.env`,
   3. semua runbook/gate deploy harus merujuk path resmi ini.
3. Dampak:
   1. mengurangi ambiguity target deploy staging/prod,
   2. evidence deploy/rollback lebih konsisten lintas tim.

## Gate Conditions

## Go Criteria

1. contract tests hijau,
2. migration reconciliation mismatch global `<= 1%` dengan exception list,
3. rollback path tervalidasi (`RTO <= 5 menit` untuk toggle read/write flag),
4. observability dashboard siap,
5. UI consistency checks lulus untuk admin/content manager,
6. tidak ada regresi mayor pada UI/UX public web.

## Stop Criteria

1. mismatch data massal pasca backfill,
2. duplicate booking akibat replay/retry,
3. drift status finance vs booking signifikan,
4. regression kritis pada flow booking/payment public.
