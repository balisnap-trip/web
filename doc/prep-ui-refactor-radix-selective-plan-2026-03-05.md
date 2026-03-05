# UI Refactor + Selective Radix Adoption Plan (Admin + Content Manager)

Tanggal: 2026-03-05  
Status: proposed-executable  
Scope utama: `bstadmin` dan `apps/content-manager`

## 1. Tujuan

1. Menutup gap inkonsistensi UI antar `bstadmin` dan `content-manager` tanpa rewrite total.
2. Menstandarkan kontrak komponen `components/ui` agar perilaku, API, dan visual konsisten.
3. Menambah Radix UI secara selektif pada area yang saat ini manual dan rawan drift.
4. Menetapkan jalur rollout yang aman dengan gate dan acceptance criteria terukur.

## 2. Ringkasan Keputusan

1. Refactor diperlukan, tetapi bertahap dan terfokus pada komponen + behavior kritikal.
2. Adopsi Radix dilakukan selektif:
3. `@radix-ui/react-dialog` (untuk `Dialog` + `Sheet`) di `content-manager`: wajib.
4. `@radix-ui/react-popover` untuk panel notifikasi: direkomendasikan.
5. `@radix-ui/react-select`: tidak prioritas saat ini (native select masih cukup).
6. Konsistensi lintas app dicapai lewat kontrak komponen tunggal, bukan dengan menambah library UI besar.

## 3. Baseline Masalah (Source-Truth)

## 3.1 Komponen dengan nama sama, kontrak berbeda

1. `status-badge.tsx`:
2. `bstadmin`: status-driven (`status`, icon, mapping internal).
3. `content-manager`: tone-driven (`label`, `tone`) berbasis `Badge`.
4. `table.tsx`:
5. `content-manager` punya `TableEmpty` dan wrapper overflow bawaan.
6. `bstadmin` belum setara.
7. `form-field.tsx`:
8. hint color token berbeda (`gray-500` vs `muted-foreground`).

## 3.2 Interaksi manual yang belum distandarkan

1. `content-manager` punya modal custom non-Radix:
2. `src/components/catalog/catalog-item-delete-modal.tsx`
3. `src/components/catalog/image-preview-modal.tsx`
4. mobile sidebar `content-manager` masih overlay manual di `cm-shell.tsx`.

## 3.3 Feedback UX belum utuh di admin

1. `toast()` dipakai di beberapa flow penting.
2. `Toaster` belum terlihat di-mount pada root/dashboard layout.
3. Risiko: notifikasi toast tidak tampil walau event terjadi.

## 3.4 Pattern aksi destruktif belum konsisten

1. Masih ada banyak `confirm(...)` native browser di admin.
2. Dampak: UX, styling, dan accessibility tidak konsisten.

## 3.5 Dependency drift

1. `bstadmin` menyimpan beberapa dependency Radix yang belum terlihat digunakan aktif di `src` (contoh: `react-select`, `react-dropdown-menu`).
2. `content-manager` belum punya dependency Radix untuk dialog/sheet, padahal ada kebutuhan nyata.

## 4. Prinsip Refactor

1. Stabilitas perilaku bisnis lebih penting daripada perubahan visual agresif.
2. Komponen dasar harus punya kontrak API yang sinkron lintas app.
3. Style harus token-first (`muted-foreground`, `border`, `background`) dan hindari hardcoded gray/slate di komponen shared.
4. Adopsi Radix hanya pada komponen interaktif yang memberi nilai langsung (modal/sheet/popover).
5. Rollout inkremental dengan gate per fase, bukan big-bang merge.

## 5. Scope dan Non-Scope

## 5.1 In-Scope

1. `bstadmin/src/components/ui/*` (harmonisasi kontrak dan token).
2. `apps/content-manager/src/components/ui/*` (sinkronisasi baseline).
3. Modal/sheet/panel notifikasi pada kedua app.
4. Penggantian `confirm(...)` pada modul prioritas.
5. Gate dan checklist UI consistency untuk dua app.

## 5.2 Out-of-Scope (fase ini)

1. Redesign visual total.
2. Migrasi total ke package UI eksternal.
3. Perubahan UI public web `balisnap`.
4. Migrasi ke data-grid library berat.

## 6. Target Arsitektur Komponen

## 6.1 Kontrak komponen lintas app

1. `Button`, `Input`, `Textarea`, `Checkbox`, `Label`, `Card`: identik.
2. `FormField`: identik, token-based hint/error.
3. `Table`: identik, termasuk:
4. `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`.
5. `DataTableShell`.
6. `TableEmpty`.
7. `StatusBadge`: satu kontrak unified:
8. terima input domain (`status`) dan mode generic (`label` + `tone`) via adapter, agar kompatibel lintas modul.
9. `ConfirmDialog`: komponen baru shared untuk aksi destruktif/non-destruktif.

## 6.2 Komponen interaksi berbasis Radix

1. `Dialog` (wajib shared).
2. `Sheet` (wajib shared).
3. `Popover` (direkomendasikan untuk panel notifikasi).

## 7. Matriks Adopsi Radix (Selektif)

| Area | Kondisi saat ini | Target | Tambah Radix? | Keputusan |
|---|---|---|---|---|
| Modal konfirmasi/edit (`content-manager`) | manual overlay | `Dialog` shared | Ya (`react-dialog`) | wajib |
| Mobile sidebar (`content-manager`) | manual overlay | `Sheet` shared | Ya (`react-dialog`) | wajib |
| Notification panel (`admin` + `content-manager`) | custom absolute panel | `Popover` shared + focus management | Ya (`react-popover`) | direkomendasikan |
| Select field | native `<select>` | tetap native (fase ini) | Tidak | tunda |
| Toast | admin punya primitive, mounting belum valid | mount global + evaluasi simplifikasi | Tidak wajib tambah | perbaikan internal |

## 8. Rencana Implementasi Bertahap

## Phase R0 - Baseline Lock dan Governance

Tujuan:
1. Freeze baseline kontrak komponen dan area prioritas.

Pekerjaan:
1. Buat inventory hash file `components/ui` untuk kedua app.
2. Definisikan kontrak API komponen shared (termasuk props wajib/opsional).
3. Tetapkan linting rule sederhana untuk mencegah import komponen drift.

Output:
1. Dokumen kontrak komponen + daftar prioritas P0/P1/P2.

Acceptance:
1. Kontrak untuk `Table`, `StatusBadge`, `FormField`, `Dialog`, `Sheet` disepakati.

## Phase R1 - Quick Win P0 (Stabilitas UX)

Tujuan:
1. Menutup gap paling berisiko dengan perubahan minimal.

Pekerjaan:
1. Mount `Toaster` pada layout admin yang tepat.
2. Sinkronkan `FormField` agar token-based konsisten.
3. Samakan `Table` baseline (`TableEmpty`, spacing tokenized, overflow wrapper).

Output:
1. Feedback toast terlihat konsisten.
2. Struktur table dan form-field setara lintas app.

Acceptance:
1. Trigger toast di settings tampil di UI.
2. `TableEmpty` dan style `TableHead/TableCell` seragam antar app.

## Phase R2 - Radix Wajib di Content Manager

Tujuan:
1. Hilangkan modal/sheet manual dan ganti dengan primitive aksesibel.

Pekerjaan:
1. Tambah dependency `@radix-ui/react-dialog` di `apps/content-manager`.
2. Tambah `components/ui/dialog.tsx` dan `components/ui/sheet.tsx` (baseline sama dengan admin).
3. Migrasi:
4. `catalog-item-delete-modal.tsx` ke `Dialog`.
5. `image-preview-modal.tsx` ke `Dialog`.
6. `cm-shell.tsx` mobile sidebar ke `Sheet`.

Output:
1. Tidak ada lagi dialog manual overlay di content-manager untuk flow prioritas.

Acceptance:
1. Escape key, focus trap, close behavior, dan scroll lock ditangani oleh primitive Radix.

## Phase R3 - Standardisasi Pattern Aksi

Tujuan:
1. Menghapus `confirm(...)` native di modul prioritas admin.

Pekerjaan:
1. Buat `ConfirmDialog` shared (varian destructive/default).
2. Ganti `confirm(...)` di page prioritas:
3. `tours`, `drivers`, `finance/patterns`, `finance/tour-items`, `finance/tour-item-categories`, `email-inbox`.

Output:
1. Pattern konfirmasi tunggal yang konsisten.

Acceptance:
1. Tidak ada `confirm(...)` pada modul prioritas P1.

## Phase R4 - Harmonisasi Status dan Notification Pattern

Tujuan:
1. Menyatukan semantic status badge dan panel notifikasi.

Pekerjaan:
1. Refactor `StatusBadge` ke kontrak unified + adapter domain.
2. Tambah `Popover` shared untuk panel notifikasi (jika dipilih).
3. Selaraskan header notification di admin dan content-manager dengan komponen shared.

Output:
1. API `StatusBadge` seragam.
2. Notification panel memiliki behavior konsisten (outside click, escape, focus).

Acceptance:
1. Dua app menggunakan komponen notifikasi shared yang sama atau wrapper identik.

## Phase R5 - Gate, QA, dan Stabilization

Tujuan:
1. Mencegah drift kembali setelah refactor.

Pekerjaan:
1. Tambah gate `ui-release-checklist` untuk `content-manager` (analog admin).
2. Tambah pengecekan:
3. larangan `confirm(...)` di modul panel.
4. larangan dialog manual dengan `role="dialog"` pada komponen app-level bila sudah ada `Dialog`.
5. minimal coverage test untuk komponen kritikal.

Output:
1. Gate CI yang enforce konsistensi.

Acceptance:
1. Build gagal jika pattern legacy terdeteksi pada scope yang dilindungi.

## 9. Backlog Teknis Detail

## 9.1 Komponen Shared

1. `components/ui/table.tsx`:
2. satukan API + export `TableEmpty`.
3. tokenisasi warna/spacing.
4. `components/ui/form-field.tsx`:
5. enforce token `muted-foreground`.
6. `components/ui/status-badge.tsx`:
7. tambah mode adapter agar domain admin dan CM tidak pecah.
8. `components/ui/confirm-dialog.tsx`:
9. komponen baru reusable.

## 9.2 Layout + Interaction

1. Admin:
2. mount `Toaster`.
3. migrasi `confirm(...)` prioritas.
4. Content Manager:
5. migrasi modal manual ke `Dialog`.
6. migrasi mobile sidebar ke `Sheet`.

## 9.3 Dependency Hygiene

1. Tambah: `apps/content-manager` -> `@radix-ui/react-dialog`.
2. Opsional tambah: kedua app -> `@radix-ui/react-popover` (jika Phase R4 aktif).
3. Audit dependency Radix yang tidak dipakai; remove setelah verifikasi lintas branch.

## 10. Strategi Testing dan Validasi

## 10.1 Functional

1. Dialog open/close (button, escape, outside click).
2. Form submit disable/loading state.
3. Aksi destructive dengan confirm dialog.
4. Toast tampil saat success/error critical flow.

## 10.2 Accessibility

1. Focus trap pada dialog/sheet.
2. `aria` labeling untuk title/description.
3. Keyboard navigation panel notifikasi/popover.

## 10.3 Regression

1. Snapshot visual page prioritas:
2. Admin: bookings, drivers, finance patterns/settlements/report, settings.
3. CM: dashboard, catalog list/detail/new, publish, site-content.

## 10.4 Gate CI

1. Rule scan:
2. `confirm(...)` pada scope panel.
3. dialog manual pattern (`role="dialog"` custom overlay) pada scope panel.
4. Kontrak komponen shared hash-check untuk file kritikal.

## 11. Risiko dan Mitigasi

1. Risiko: perubahan kontrak `StatusBadge` memecah page lama.
2. Mitigasi: adapter backward-compatible selama 1 fase transisi.
3. Risiko: migrasi modal mengubah behavior close yang sensitif.
4. Mitigasi: integration test per flow destructive/edit.
5. Risiko: dependency cleanup menghapus paket yang ternyata dipakai branch lain.
6. Mitigasi: lakukan cleanup setelah full-text usage scan + CI pass.

## 12. Estimasi Eksekusi

1. R0-R1: 1-2 hari kerja.
2. R2: 2-3 hari kerja.
3. R3-R4: 2-4 hari kerja (tergantung jumlah halaman yang dimigrasi).
4. R5: 1-2 hari kerja.
5. Total: 6-11 hari kerja (inkremental, bisa di-split per PR kecil).

## 13. Definition of Done (DoD)

1. `bstadmin` dan `content-manager` memakai kontrak komponen shared yang sama untuk `Table`, `FormField`, `Dialog`, `Sheet`.
2. `content-manager` tidak punya modal manual prioritas (delete + image preview) dan sidebar mobile manual.
3. `confirm(...)` hilang dari modul admin prioritas.
4. Toast admin dipastikan tampil (Toaster mounted).
5. Gate konsistensi aktif minimal untuk dua app.
6. Tidak ada regresi fungsi bisnis pada modul yang disentuh.

## 14. Urutan PR yang Direkomendasikan

1. PR-1: `Toaster` mount + table/form-field harmonization.
2. PR-2: Radix dialog/sheet adoption di content-manager.
3. PR-3: `ConfirmDialog` introduction + migrasi `confirm(...)` prioritas.
4. PR-4: StatusBadge unification + optional popover notification.
5. PR-5: Gate CI content-manager + aturan anti-drift.

## 14.1 Task List Eksekusi per PR (Actionable)

## PR-1: Foundation Quick Win

1. Update `bstadmin/src/app/(dashboard)/layout.tsx` atau `bstadmin/src/app/layout.tsx` untuk mount `Toaster`.
2. Harmonisasi `bstadmin/src/components/ui/form-field.tsx` agar hint memakai token `text-muted-foreground`.
3. Harmonisasi `bstadmin/src/components/ui/table.tsx` agar setara baseline:
4. `TableEmpty`, spacing tokenized, wrapper overflow bawaan.
5. Verifikasi minimal:
6. toast settings muncul.
7. daftar table utama (`bookings`, `email-inbox`, `finance/*`) tetap render.

## PR-2: Content Manager Radix Adoption

1. Tambah dependency `@radix-ui/react-dialog` di `apps/content-manager/package.json`.
2. Tambah komponen:
3. `apps/content-manager/src/components/ui/dialog.tsx`.
4. `apps/content-manager/src/components/ui/sheet.tsx`.
5. Migrasi komponen manual:
6. `catalog-item-delete-modal.tsx` -> `Dialog`.
7. `image-preview-modal.tsx` -> `Dialog`.
8. `cm-shell.tsx` mobile sidebar overlay -> `Sheet`.
9. Verifikasi minimal:
10. escape/outside click berfungsi.
11. scroll lock/focus behavior stabil.

## PR-3: Confirm Dialog Standardization

1. Tambah `bstadmin/src/components/ui/confirm-dialog.tsx`.
2. Ganti `confirm(...)` pada halaman prioritas:
3. `tours/page.tsx`.
4. `drivers/[id]/page.tsx`.
5. `email-inbox/[id]/page.tsx`.
6. `finance/partners/page.tsx`.
7. `finance/patterns/page.tsx`.
8. `finance/tour-items/page.tsx`.
9. `finance/tour-item-categories/page.tsx`.
10. Verifikasi minimal:
11. semua aksi destructive tetap berjalan.
12. loading/disable state saat delete tetap benar.

## PR-4: Status + Notification Harmonization

1. Unifikasi kontrak `StatusBadge` lintas app dengan mode domain + mode generic.
2. (Opsional) Tambah `Popover` shared untuk panel notifikasi.
3. Samakan behavior panel notifikasi admin + CM.
4. Verifikasi minimal:
5. semua pemakaian `StatusBadge` existing tetap compile.
6. panel notifikasi dapat ditutup via click-outside dan escape.

## PR-5: Consistency Gate untuk Content Manager

1. Tambah script gate baru di `apps/content-manager/scripts/`.
2. Tambah baseline checklist di `apps/content-manager/config/`.
3. Tambah npm script gate di `apps/content-manager/package.json`.
4. Tambah rule scan minimal:
5. larang `confirm(...)` pada scope panel.
6. larang dialog manual (`role="dialog"`) pada scope panel prioritas.
7. Verifikasi minimal:
8. gate berjalan lokal dan menghasilkan report.
9. gate fail jika pattern legacy muncul.

## 15. Catatan Implementasi

1. Pertahankan perubahan kecil per PR agar rollback mudah.
2. Hindari refactor visual besar di luar scope.
3. Jika ada perbedaan perilaku bisnis antar app, pertahankan behavior bisnis, seragamkan hanya layer UI.

## 16. Eksekusi 2026-03-05 (Completed)

1. `PR-1` diselesaikan:
2. `Toaster` admin di-mount pada dashboard layout.
3. `FormField` dan `Table` di `bstadmin` disinkronkan ke baseline tokenized.
4. `PR-2` diselesaikan:
5. `content-manager` menambahkan `@radix-ui/react-dialog`.
6. ditambahkan `components/ui/dialog.tsx` dan `components/ui/sheet.tsx`.
7. `catalog-item-delete-modal` dan `image-preview-modal` dimigrasikan ke `Dialog`.
8. `cm-shell` mobile sidebar dimigrasikan ke `Sheet`.
9. `PR-3` diselesaikan:
10. ditambahkan `bstadmin/src/components/ui/confirm-dialog.tsx`.
11. seluruh `confirm(...)` prioritas diganti `ConfirmDialog` pada halaman target.
12. `PR-4` diselesaikan (core scope):
13. kontrak `StatusBadge` diharmonisasikan agar mendukung mode `status` dan `label + tone`.
14. `PR-5` diselesaikan:
15. ditambahkan gate `apps/content-manager/scripts/ui-release-checklist-gate.mjs`.
16. ditambahkan baseline `apps/content-manager/config/ui-release-checklist-baseline.json`.
17. ditambahkan script npm `gate:ui-release-checklist` pada content-manager.
18. perbaikan lint blocker admin pada `components/layout/module-tabs.tsx`:
19. variabel lokal `module` diganti menjadi `currentModule` agar lolos rule `@next/next/no-assign-module-variable`.
20. `PR-4` opsional (popover notification) juga dieksekusi:
21. ditambahkan `components/ui/popover.tsx` pada `bstadmin` dan `content-manager`.
22. panel notifikasi pada `bstadmin` (`header.tsx`) dan `content-manager` (`cm-header.tsx`) dimigrasikan ke `Popover`.
23. gate `content-manager` diperluas untuk mengunci kontrak `cm-header` menggunakan `Popover`.
24. hasil scan: tidak ada lagi penggunaan `confirm(...)` pada `bstadmin/src` maupun `apps/content-manager/src`.
