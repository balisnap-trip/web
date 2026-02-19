# Cross-Project Master Plan - 2026-02-18

## Executive Summary

Target arsitektur jangka panjang:

1. Satu core backend enterprise-grade (`NestJS`) dengan modular boundary ketat.
2. Frontend terpisah:
   1. `balisnap` (public channel)
   2. `bstadmin` (operasional)
   3. `content manager` (manajemen konten channel)
3. Domain data tetap terpisah (`dual DB`), terhubung oleh API/event contract.
4. Ingestion channel non-email menggunakan `Webhook + Queue`.
5. Delivery bertahap `Dual-Run`, tanpa big-bang rewrite.

## 1. Arsitektur Target

### 1.1 Monorepo Layout

1. `apps/web`
2. `apps/admin-ops`
3. `apps/content-manager`
4. `apps/core-api`
5. `packages/contracts`
6. `packages/config`
7. `packages/shared`

### 1.2 Backend Model

`apps/core-api` menggunakan NestJS pola `Hybrid Modulith -> Micro`:

1. `ingestion-module`
2. `ops-booking-module`
3. `catalog-channel-module`
4. `notification-module`
5. `identity-access-module`
6. `audit-module`

Prinsip:

1. Modulith dulu untuk governance ketat.
2. Siap extract ke microservice per modul ketika scale/team menuntut.
3. Tidak ada rewrite framework saat perusahaan berkembang.

### 1.3 Data Topology

1. `ops_db`: booking operasional, assignment, finance, audit.
2. `channel_db`: katalog/channel content, publish/read model channel.

Rule wajib:

1. Tidak ada cross-db join di runtime bisnis.
2. Tidak ada sinkronisasi DB dua arah sebagai transport utama.
3. Integrasi lintas domain hanya lewat kontrak API/event.

## 2. API & Contract Baseline

### 2.1 Standar API

1. `REST + OpenAPI` sebagai standar tunggal kontrak.
2. Versioning kontrak (`v1`, `v2`) untuk perubahan breaking.
3. Schema validation wajib di boundary (request dan response inti).

### 2.2 Kontrak Event Ingestion

Event booking wajib punya:

1. `source`
2. `external_booking_ref`
3. `event_type` (`CREATED`, `UPDATED`, `CANCELLED`)
4. `event_time`
5. `idempotency_key`
6. `payload_version`

Jaminan:

1. Event duplicate tidak membuat booking duplicate.
2. Event gagal diproses masuk retry policy.
3. Event yang tetap gagal masuk DLQ untuk reprocess.

## 3. Flow Bisnis Operasional Final

### 3.1 Channel Email OTA (existing)

1. IMAP sync -> `email_inbox`.
2. Classify booking email.
3. Parse -> booking create/update/cancel.
4. Status sync operasional (`NEW/READY/ATTENTION/COMPLETED/DONE` etc).

### 3.2 Channel Non-Email (`balisnap`, `content-manager`, adapter lain)

1. Channel kirim booking event ke endpoint ingest.
2. Core API menerima, verifikasi signature + idempotency.
3. Event diproses async via queue worker.
4. Hasil dipetakan ke model operasional yang sama dengan channel OTA.

Hasil:

1. Semua channel bertemu di mesin operasional yang konsisten.
2. Admin operasional tidak tergantung langsung ke DB content manager.

## 4. Phased Implementation Plan

## Fase 0 - Foundation

1. Bentuk monorepo `pnpm + turborepo`.
2. Pindahkan `balisnap` dan `bstadmin` ke `apps/*`.
3. Setup CI baseline:
   1. lint
   2. typecheck
   3. build

## Fase 1 - NestJS Core Skeleton

1. Buat `apps/core-api`.
2. Setup module boundaries + OpenAPI docs.
3. Setup koneksi `ops_db` dan `channel_db`.

## Fase 2 - Contract Lock

1. Buat `packages/contracts`.
2. Definisikan `BookingIngestEventV1` dan `CatalogPayloadV1`.
3. Aktifkan schema validator di ingress API.

## Fase 3 - Ingestion Engine

1. Port logic ingestion email existing ke `ingestion-module`.
2. Implement `Webhook + Queue` untuk non-email channels.
3. Tambahkan retry, dead-letter, replay endpoint.

## Fase 4 - Ops API Migration

1. Migrasi endpoint operasional utama ke `core-api`.
2. `apps/admin-ops` mengonsumsi endpoint baru.
3. Pertahankan behavior status existing.

## Fase 5 - Channel Integration

1. Integrasikan `apps/web` ke jalur ingest webhook untuk booking.
2. Pertahankan fallback lama selama dual-run.
3. Mulai integrasi `content-manager` sebagai channel terpisah.

## Fase 6 - Dual-Run & Cutover

1. Jalankan dual-run terukur.
2. Monitor error rate, latency, duplicate rate, backlog queue.
3. Cutover per channel setelah stabil.

## 5. Testing and Acceptance Criteria

## 5.1 Wajib Test

1. Contract tests OpenAPI.
2. Idempotency tests untuk ingestion event.
3. Queue recovery tests (worker restart/crash).
4. Status transition regression tests.
5. Source/channel mapping tests.
6. Security tests:
   1. signature verification
   2. replay protection
   3. RBAC endpoint ops

## 5.2 Acceptance Criteria

1. Tidak ada downtime besar selama migrasi.
2. Tidak ada duplicate booking dari retry/duplicate events.
3. Status booking operasional tetap konsisten dengan rule existing.
4. Error rate ingestion berada dalam batas SLA yang disepakati.
5. Arsitektur siap scale tanpa ganti framework atau redesign besar.

## 6. Risk Register

1. Risiko: kontrak event belum disiplin.
   1. Mitigasi: contract-first + review wajib sebelum merge.
2. Risiko: data drift antar domain.
   1. Mitigasi: larang sync DB dua arah untuk flow utama.
3. Risiko: backlog queue saat peak booking.
   1. Mitigasi: autoscaling worker + dead-letter + replay tool.

## 7. Default Decisions (Locked)

1. Backend utama: NestJS.
2. Arsitektur: Hybrid Modulith -> Micro.
3. API style: REST + OpenAPI.
4. DB model: Dual DB tetap, terhubung via contract/event.
5. Ingestion non-email: Webhook + Queue.
6. Delivery: Dual-Run bertahap.
