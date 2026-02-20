# Content Manager (Scaffold)

Scaffold awal EP-010 untuk `content-manager` dengan:

1. login credentials berbasis `users` table (`next-auth` + Prisma),
2. RBAC guard (`CM_ALLOWED_ROLES`),
3. catalog editor CRUD (item/variant/rate),
4. workflow publish (`draft -> in_review -> published -> retry`).

## Menjalankan lokal

1. salin `.env.example` -> `.env`.
2. isi `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`.
3. isi `CORE_API_BASE_URL`, `CORE_API_ADMIN_TOKEN`, `CORE_API_ADMIN_ROLE`.
4. jika signature publish diaktifkan di `core-api`, isi `CORE_API_PUBLISH_SECRET`.
3. jalankan:

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
