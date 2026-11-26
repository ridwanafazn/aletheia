# Aletheia Web

Frontend React 19 dan Vite untuk Aletheia. M2.3 mencakup login, ruang klaim, klaim baru, detail klaim, antrean persetujuan, dan jejak audit.

## Menjalankan

```bash
pnpm dev
```

Vite mem-proxy `/api` dan `/graphql` ke edge gateway di `http://127.0.0.1:8787`. Jalankan governance, claims, dan edge lebih dahulu.

Untuk build preview yang memanggil Worker langsung:

```bash
VITE_API_BASE_URL=https://aletheia-edge-preview.ridwanafzn.workers.dev VITE_DEMO_UPLOAD=true pnpm build
```

`VITE_DEMO_UPLOAD=true` membuat lampiran demo tanpa mengunggah berkas nyata ke Cloudinary. Produksi wajib memakai `false` dan kredensial Cloudinary nyata.

## Aturan desain

- IBM Plex Sans untuk antarmuka dan IBM Plex Mono untuk ID serta hash.
- Token warna dan spacing ada di `src/styles/tokens.css`.
- Tidak ada tanda kurung, ampersand, emoji, atau tanda seru pada copy antarmuka.
- Nominal memakai angka tabular dan format `id-ID`.
- Setiap layar memiliki state loading, empty, error, dan permission denied.

## Gate

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm e2e
```

`pnpm build` menolak initial JavaScript di atas 200 KB gzip.
