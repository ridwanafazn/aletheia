# `docs/assets` — Screenshot & Diagram Assets

Simpan aset visual yang dirujuk README dan dokumen di sini.

## Aturan

- Format: PNG untuk screenshot, SVG untuk diagram.
- Nama: `<screen>-<viewport>-<theme>.png`, contoh `claims-workbench-1440-light.png`.
- Viewport wajib: 1440, 1024, 390.
- Jangan memuat PII nyata; gunakan data seed sintetis dan masking.
- Jangan memuat token, cookie, email pribadi, atau path lokal di screenshot.
- Kompres PNG (misalnya `pngquant`) agar repo tetap ringan.
- Diagram arsitektur disimpan sebagai SVG + sumber Mermaid di dokumen.

## Struktur yang disarankan

```text
assets/
├── screens/
│   ├── login-1440-light.png
│   ├── claims-workbench-1440-light.png
│   ├── approval-queue-1440-light.png
│   ├── payroll-console-1440-light.png
│   ├── payslip-1440-light.png
│   ├── reports-1440-light.png
│   ├── mis-dashboard-1440-light.png
│   └── audit-ledger-1440-light.png
├── diagrams/
│   └── architecture.svg
└── demo/
    └── demo-flow.gif
```

Perbarui screenshot setiap kali layar berubah secara visual.
