# UI Component Inventory and Gap Matrix (Admin Baseline)

Tanggal baseline: 2026-02-18  
Status: aktif (input eksekusi `EP-013`)

## 1. Tujuan

1. Mendata komponen UI yang sudah ada di admin panel.
2. Mengidentifikasi gap konsistensi dari source code aktual.
3. Menetapkan prioritas standardisasi komponen untuk admin + content manager.

## 2. Referensi Source Code

1. `bstadmin/src/components/ui/button.tsx`
2. `bstadmin/src/components/ui/input.tsx`
3. `bstadmin/src/components/ui/select.tsx`
4. `bstadmin/src/components/ui/textarea.tsx`
5. `bstadmin/src/components/ui/dialog.tsx`
6. `bstadmin/src/components/ui/card.tsx`
7. `bstadmin/src/components/ui/checkbox.tsx`
8. `bstadmin/src/components/ui/sheet.tsx`
9. `bstadmin/src/components/ui/progress.tsx`
10. `bstadmin/src/components/ui/toast.tsx`
11. `bstadmin/src/lib/booking/status-label.ts`
12. `bstadmin/src/app/(dashboard)/bookings/page.tsx`
13. `bstadmin/src/app/(dashboard)/dashboard/page.tsx`
14. `bstadmin/src/app/(dashboard)/bookings/[id]/page.tsx`
15. `bstadmin/src/app/globals.css`

## 3. Inventory Komponen Foundation

| Komponen | Status | Reuse Saat Ini | Catatan |
|---|---|---|---|
| `Button` | tersedia | tinggi | varian cukup lengkap (`default`, `outline`, `secondary`, dll) |
| `Input` | tersedia | tinggi | state dasar sudah konsisten |
| `Select` | tersedia | tinggi | wrapper native select, belum ada pattern async/loading |
| `Textarea` | tersedia | menengah | dipakai di form detail/modals |
| `Checkbox` | tersedia | menengah | dipakai banyak modul finance/bookings |
| `Label` | tersedia | menengah | belum selalu dipasangkan konsisten dengan field error/hint |
| `Card` | tersedia | tinggi | dipakai hampir semua page dashboard |
| `Dialog` | tersedia | tinggi | banyak varian modal manual masih verbose di halaman |
| `Sheet` | tersedia | rendah-menengah | dipakai layout mobile drawer |
| `Progress` | tersedia | rendah-menengah | dipakai pada flow fetch/sync |
| `Toast` | tersedia | menengah | notifikasi via hook sudah ada |

## 4. Gap dan Inkonsistensi yang Ditemukan

## 4.1 Status Badge / Color Mapping Duplikat

Temuan:
1. Mapping status tersentral sudah ada di `bstadmin/src/lib/booking/status-label.ts`.
2. Namun halaman lain masih mendefinisikan mapping sendiri.

Contoh:
1. `bstadmin/src/app/(dashboard)/bookings/page.tsx`: `STATUS_COLORS` lokal.
2. `bstadmin/src/app/(dashboard)/dashboard/page.tsx`: ternary status classes inline.
3. `bstadmin/src/app/(dashboard)/bookings/[id]/page.tsx`: status styling inline berulang.

Dampak:
1. risiko beda warna/label antar halaman untuk status sama.
2. maintenance sulit saat ada perubahan status baru.

Prioritas: `P0`

## 4.2 Source Badge Styling Belum Tunggal

Temuan:
1. beberapa halaman pakai class map (`SOURCE_COLORS` class-based).
2. halaman lain pakai inline style color (`style={{ backgroundColor: ... }}`).

Contoh:
1. `bstadmin/src/app/(dashboard)/bookings/page.tsx`
2. `bstadmin/src/app/(dashboard)/dashboard/page.tsx`

Dampak:
1. visual source badge tidak konsisten.
2. sulit menerapkan token/theme secara global.

Prioritas: `P1`

## 4.3 Table Pattern Belum Distandarkan

Temuan:
1. struktur table/list/header/filter/empty state ditulis manual per page.
2. variasi spacing, typography, dan action layout berbeda.

Contoh:
1. `bstadmin/src/app/(dashboard)/bookings/page.tsx`
2. `bstadmin/src/app/(dashboard)/dashboard/page.tsx`
3. `bstadmin/src/app/(dashboard)/email-inbox/page.tsx`

Dampak:
1. UX terasa tidak seragam antar modul.
2. effort maintenance tinggi.

Prioritas: `P1`

## 4.4 Modal Form Pattern Terlalu Verbose

Temuan:
1. banyak dialog dengan struktur tombol dan behavior serupa, tetapi diulang manual.
2. state disable/loading/close handling berbeda-beda antar modal.

Contoh:
1. `bstadmin/src/app/(dashboard)/bookings/[id]/page.tsx`
2. `bstadmin/src/app/(dashboard)/finance/*`
3. `bstadmin/src/app/(dashboard)/settings/page.tsx`

Dampak:
1. perilaku dialog tidak seragam.
2. bug UX kecil mudah berulang.

Prioritas: `P1`

## 4.5 Form Field Wrapper Belum Ada

Temuan:
1. label, input, help text, error text belum dibungkus pattern standar.
2. validasi visual mostly manual per form.

Dampak:
1. inkonsistensi pengalaman input.
2. aksesibilitas field-level berisiko tidak konsisten.

Prioritas: `P1`

## 5. Komponen Baru yang Direkomendasikan (Internal)

| Komponen Target | Prioritas | Tujuan |
|---|---|---|
| `StatusBadge` | P0 | single source status label + class + icon |
| `SourceBadge` | P1 | visual source channel konsisten |
| `DataTableShell` | P1 | standard table header/filter/empty/loading |
| `FormField` | P1 | bungkus label+control+help+error+a11y |
| `ConfirmDialog` | P1 | destructive/non-destructive modal konsisten |
| `SectionHeader` | P2 | judul + subtitle + action slot konsisten |

## 6. Rencana Refactor Bertahap

## Gelombang 1 (P0)

1. Introduce `StatusBadge`.
2. Replace mapping status lokal di halaman kritikal:
3. `bookings/page`,
4. `dashboard/page`,
5. `bookings/[id]/page`.

Acceptance:
1. tidak ada status class hardcode tersisa di tiga halaman prioritas.

## Gelombang 2 (P1)

1. Introduce `SourceBadge`.
2. Introduce `ConfirmDialog` reusable.
3. Introduce `FormField`.
4. Terapkan ke flow booking detail dan finance modals.

Acceptance:
1. modal confirm tidak lagi duplikasi pattern tombol + loading handling.
2. form utama booking/finance memakai wrapper field standar.

## Gelombang 3 (P1-P2)

1. Introduce `DataTableShell` + `SectionHeader`.
2. Terapkan ke page list prioritas.
3. Siapkan paket yang sama untuk bootstrap `content-manager`.

Acceptance:
1. list pages utama punya struktur visual/interaction konsisten.
2. content manager bisa langsung reuse pattern list/form/dialog.

## 7. Aturan Untuk Content Manager

1. CM wajib mulai dari inventory ini sebagai baseline.
2. CM tidak boleh menambah library UI baru untuk kebutuhan yang sudah ada.
3. jika menambah komponen baru, harus dicatat sebagai candidate shared component.
4. sebelum merge, komponen baru CM wajib dicek apakah bisa dipindahkan ke baseline shared UI.

## 8. KPI Standardisasi UI

1. `StatusBadge adoption`: >= 90% halaman yang menampilkan status ops.
2. `Hardcoded status class occurrences`: menurun ke 0 pada modul prioritas.
3. `Modal pattern duplication`: turun minimal 70% pada flow booking/finance utama.
4. `Public web regression`: 0 mayor regression pada halaman kritis.

## 9. Keterkaitan Dokumen

1. Rule utama: `doc/prep-ui-ux-standardization-spec-2026-02-18.md`
2. Lock keputusan: `doc/prep-decision-lock-2026-02-18.md` (`ADR-011`)
3. Backlog eksekusi: `doc/prep-implementation-backlog-2026-02-18.md` (`EP-013`)
