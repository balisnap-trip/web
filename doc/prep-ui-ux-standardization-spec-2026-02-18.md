# UI/UX Standardization Spec (Admin + Content Manager, Public Web Continuity)

Tanggal baseline: 2026-02-18  
Status: aktif (turunan langsung dari `ADR-011`)

## 1. Scope dan Tujuan

1. Menstandarkan UI/UX internal (`admin-ops` + `content-manager`) tanpa redesign total.
2. Menetapkan basis UI tunggal untuk admin dan content manager.
3. Menjaga `public web` tetap memakai UI/UX asli yang sudah berjalan.
4. Menurunkan aturan sampai level implementasi komponen, token, QA, dan review PR.

## 2. Source-Truth UI Saat Ini

### 2.1 Admin (`bstadmin`)

Referensi code:
1. `bstadmin/package.json`
2. `bstadmin/tailwind.config.ts`
3. `bstadmin/src/app/globals.css`
4. `bstadmin/src/components/ui/*`
5. `bstadmin/src/lib/utils.ts`

Fakta:
1. Stack UI utama: Tailwind + Radix + CVA (`class-variance-authority`) + `clsx/twMerge`.
2. Komponen foundation sudah ada:
3. `Button`, `Input`, `Select`, `Textarea`, `Dialog`, `Sheet`, `Card`, `Checkbox`, `Toast`, `Progress`, `Label`.
4. Token warna/radius sudah berbasis CSS variables (`--primary`, `--border`, `--radius`, dll).
5. Banyak halaman sudah memakai `@/components/ui/*`, tapi pattern badge/status/table/action masih berulang manual di banyak page.

### 2.2 Public Web (`balisnap`)

Referensi code:
1. `balisnap/package.json`
2. `balisnap/tailwind.config.js`
3. `balisnap/app/layout.tsx`
4. `balisnap/app/providers.tsx`
5. `balisnap/config/fonts.ts`
6. `balisnap/styles/globals.css`

Fakta:
1. Stack UI public: HeroUI + Tailwind + style custom existing.
2. Font public sudah ditetapkan (`Figtree`, `Fira Code`) dan sudah jadi identitas tampilan.
3. Layout public (`Navbar`, `Footer`, section composition) sudah berjalan dan tidak boleh dirombak total pada fase ini.

## 3. Keputusan Implementasi

1. `admin-ops` tetap menjadi baseline UI internal.
2. `content-manager` wajib memakai basis UI yang sama dengan admin:
3. token, primitive, pattern, dan behavior interaksi.
4. `public web` tetap pada stack dan tampilan asli saat ini.
5. Standardisasi saat ini fokus ke konsistensi komponen, bukan rebranding visual.

## 4. Target Arsitektur UI Internal

## 4.1 Struktur Modular (Target Monorepo)

1. `packages/ui-admin`
2. `packages/ui-admin-tokens`
3. `apps/admin-ops`
4. `apps/content-manager`

## 4.2 Struktur Pra-Monorepo (Transisi Sekarang)

1. `bstadmin/src/components/ui` menjadi sumber komponen acuan.
2. `content-manager` (saat mulai dibuat) harus copy-from-source dengan aturan:
3. prioritas reuse file komponen, bukan rewrite bebas.
4. setiap perubahan komponen shared dicatat untuk sinkronisasi balik (backport).

## 5. Design Token Standard (Internal)

## 5.1 Token Naming

1. Wajib pakai token semantic:
2. `--background`, `--foreground`, `--primary`, `--primary-foreground`
3. `--secondary`, `--muted`, `--accent`, `--destructive`
4. `--border`, `--input`, `--ring`, `--radius`

## 5.2 Token Rules

1. Dilarang hardcode warna utama langsung di komponen shared.
2. Variasi warna status bisnis harus melalui mapping class helper tunggal.
3. Semua radius komponen pakai turunan `--radius`.
4. Focus ring wajib konsisten (`focus-visible:ring-ring`).
5. Kontras teks terhadap background harus memenuhi standar aksesibilitas minimum.

## 5.3 Status Color Mapping (Single Source)

1. Buat helper tunggal `getBookingStatusMeta`/equivalent untuk:
2. label status,
3. class badge,
4. ikon status.

Aturan:
1. dilarang duplikasi mapping status di banyak halaman.
2. perubahan warna status harus melalui helper tunggal.

## 6. Standard Komponen Wajib

## 6.1 Komponen Foundation (Wajib Reuse)

1. `Button`
2. `Input`
3. `Select`
4. `Textarea`
5. `Checkbox`
6. `Label`
7. `Card`
8. `Dialog`
9. `Sheet`
10. `Toast`
11. `Progress`

Rule:
1. halaman internal dilarang membuat style tombol baru jika varian existing cukup.
2. jika perlu varian baru, tambahkan di komponen foundation, bukan inline per halaman.

## 6.2 Komponen yang Harus Distandarkan Sekarang (Gap)

1. `StatusBadge` (ops booking + finance state).
2. `DataTable` shell:
3. header, filter row, empty state, loading state, pagination.
4. `FormField` wrapper:
5. label, hint, error message, required marker.
6. `ConfirmDialog` pattern:
7. destructive vs non-destructive action yang konsisten.
8. `SectionHeader` pattern:
9. title + description + primary action slot.

## 6.3 Behavior Standard

1. Semua form wajib punya state:
2. default, focus, invalid, disabled, loading submit.
3. Semua action async wajib punya feedback:
4. loading indicator + toast success/error.
5. Dialog wajib keyboard-accessible dan close behavior konsisten.
6. Tabel list wajib punya empty-state yang jelas, bukan blank.

## 7. Public Web Continuity Rules

1. Tidak ada redesign total pada:
2. header/navbar global,
3. section hero/home utama,
4. booking flow customer,
5. footer dan navigasi utama.
6. Perubahan yang diperbolehkan:
7. bugfix UI,
8. konsistensi kecil spacing/typography lokal,
9. perbaikan aksesibilitas/form usability,
10. optimasi performa rendering tanpa ubah karakter visual.
11. Dilarang memindahkan public web ke basis UI admin.
12. Dilarang memaksa public web memakai token internal admin jika mengubah identitas visual yang berjalan.

## 8. Content Manager UI Rules

1. Layout IA boleh berbeda sesuai domain konten, tetapi visual language harus 1 keluarga dengan admin.
2. Komponen primitive wajib reuse dari basis admin.
3. Pattern form editor konten boleh menambah komponen baru, tetapi:
4. harus di-register sebagai candidate shared component.
5. Tidak boleh ada library UI kedua untuk kebutuhan yang sudah ter-cover komponen admin baseline.

## 9. Implementasi Bertahap

## Phase U1: Inventory dan Baseline Lock

1. inventaris komponen admin yang aktif.
2. tandai ketidakkonsistenan paling kritis:
3. status badge,
4. table action bar,
5. modal confirm.

Output:
1. daftar prioritas komponen standardisasi.

## Phase U2: Foundation Hardening

1. finalisasi varian foundation component.
2. buat helper status mapping tunggal.
3. buat wrapper `FormField` dan `ConfirmDialog`.

Output:
1. komponen shared yang siap dipakai lintas app.

## Phase U3: Admin Harmonization

1. refactor halaman admin prioritas tinggi:
2. booking list/detail,
3. finance validate/settlement,
4. settings critical screens.

Output:
1. pengurangan style inline dan duplikasi pattern.

## Phase U4: Content Manager Adoption

1. scaffold CM langsung dengan baseline UI admin.
2. seluruh halaman CM baru wajib patuh standard component.

Output:
1. CM dan admin konsisten sejak awal.

## Phase U5: Continuity Gate Public Web

1. jalankan visual check untuk halaman public kritis:
2. home, tour list, tour detail, booking, payment result.

Output:
1. bukti tidak ada regressi UX mayor.

## 10. QA dan Review Checklist

## 10.1 Checklist PR UI Internal

1. Apakah komponen foundation reuse sebelum membuat komponen baru?
2. Apakah warna/spacing pakai token semantic, bukan hardcode?
3. Apakah focus/hover/disabled states tersedia?
4. Apakah form error state konsisten?
5. Apakah action async punya feedback loading + toast?
6. Apakah a11y dasar terpenuhi (label, keyboard, aria penting)?
7. Apakah status badge memakai helper tunggal?
8. Apakah screenshot before/after disertakan untuk area yang berubah?

## 10.2 Checklist Release Public Web

1. Home page visual unchanged (kecuali bugfix terencana).
2. Tour list/detail visual unchanged.
3. Booking flow step-by-step masih familiar.
4. Payment success/failure states tetap konsisten.
5. Tidak ada perubahan copy/CTA kritis tanpa approval bisnis.

## 11. Visual Regression Gate

1. Minimal screenshot baseline untuk:
2. admin dashboard,
3. admin bookings list,
4. admin booking detail,
5. finance validate,
6. content manager dashboard (saat sudah ada),
7. public home,
8. public tour detail,
9. public booking page.
10. Setiap rilis, diff harus direview.
11. Regressi mayor menahan rilis sampai resolved atau disetujui eksplisit.

## 12. Definition of Done (UI/UX)

Sebuah item UI dianggap selesai jika:
1. sesuai standar komponen/token dokumen ini,
2. lulus checklist PR UI,
3. lulus visual regression gate terkait area perubahan,
4. tidak menurunkan UX flow public (untuk perubahan di `balisnap`),
5. terdokumentasi di changelog/release note internal.

## 13. Keterkaitan Dengan Dokumen Lain

1. Mengikat dari `doc/prep-decision-lock-2026-02-18.md` (`ADR-011`).
2. Eksekusi fase ada di `doc/cross-project-master-plan-2026-02-18.md`.
3. Guard operational ada di `doc/prep-phase2-migration-blueprint-2026-02-18.md`.
4. Inventory komponen aktual ada di `doc/prep-ui-component-inventory-2026-02-18.md`.
5. Breakdown task ada di `doc/prep-implementation-backlog-2026-02-18.md` (`EP-013`).
