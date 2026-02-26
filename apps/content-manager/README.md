# Content Manager (Scaffold)

Scaffold awal EP-010 untuk `content-manager` dengan:

1. login credentials berbasis `users` table (`next-auth` + Prisma),
2. RBAC guard (`CM_ALLOWED_ROLES`),
3. catalog editor CRUD (item/variant/rate) + starter variant flow saat create item,
4. workflow publish (`draft -> in_review -> published -> retry`) yang bisa dijalankan user yang sama (creator/reviewer/publisher),
5. upload media thumbnail langsung dari UI (`/api/media/upload`) dengan serving file via `/api/media/files/...`.

## Menjalankan lokal

1. salin `.env.example` -> `.env`.
2. isi `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`.
3. isi `CORE_API_BASE_URL`, `CORE_API_ADMIN_TOKEN`, `CORE_API_ADMIN_ROLE`.
4. jika signature publish diaktifkan di `core-api`, isi `CORE_API_PUBLISH_SECRET`.
5. opsional: sesuaikan policy role per aksi dengan `CM_CATALOG_EDITOR_ROLES`, `CM_PUBLISH_REVIEWER_ROLES`, `CM_PUBLISHER_ROLES`, `CM_PUBLISH_RETRY_ROLES`.
6. opsional: atur limit upload media dengan `CM_MEDIA_MAX_BYTES` (default 5MB).
7. opsional: set `CM_MEDIA_STORAGE_ROOT` agar file upload tersimpan di direktori persisten lintas release.
8. opsional: set `CM_LEGACY_MEDIA_BASE_URL` untuk proxy gambar legacy seperti `/tours/...`.
9. jalankan:

```bash
pnpm --filter @bst/content-manager dev
```

## Route utama

1. `/login`
2. `/dashboard` (protected + RBAC)
3. `/catalog` (protected, list + editor)
4. `/catalog/new` (create item)
5. `/catalog/[itemId]` (edit item + variant/rate CRUD)
6. `/publish` (create draft, submit review, publish, retry)
7. `/site-content` (overview content website)
8. `/site-content/about` (about us editor)
9. `/site-content/blog` (blog story manager)
