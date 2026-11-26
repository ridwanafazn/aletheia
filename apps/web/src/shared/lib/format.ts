const moneyFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

const dateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

const numberFormatter = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

const monthFormatter = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

const periodFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  timeZone: "Asia/Jakarta",
});

export function formatMoney(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return "Belum ada";
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "Tidak valid";
  }
  return moneyFormatter.format(number);
}

export function formatNumber(value: number | string): string {
  return numberFormatter.format(Number(value));
}

export function formatPeriod(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return "Belum ada";
  }
  return monthFormatter.format(new Date(`${value.slice(0, 10)}T00:00:00+07:00`));
}

export function currentPeriod(): string {
  return periodFormatter.format(new Date()).slice(0, 7);
}

export function periodEndDate(value: string): string {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${value}-${String(lastDay).padStart(2, "0")}`;
}

export function formatRate(value: string | number): string {
  const rate = Number(value);
  if (!Number.isFinite(rate)) {
    return "Tidak valid";
  }
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(rate * 100)} persen`;
}

export function formatPercent(value: number | string): string {
  return `${numberFormatter.format(Number(value))} persen`;
}

export function formatDate(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return "Belum ada";
  }
  return dateFormatter.format(new Date(value));
}

export function formatDateTime(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return "Belum ada";
  }
  return `${dateTimeFormatter.format(new Date(value))} WIB`;
}

export function ageLabel(value: string): string {
  const hours = Math.max(0, (Date.now() - new Date(value).getTime()) / 3_600_000);
  if (hours < 1) {
    return "Baru saja";
  }
  if (hours < 24) {
    return `${Math.floor(hours)} jam`;
  }
  return `${Math.floor(hours / 24)} hari`;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

export function riskBand(score: number): "low" | "medium" | "high" {
  if (score >= 65) {
    return "high";
  }
  if (score >= 30) {
    return "medium";
  }
  return "low";
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draf",
  CALCULATING: "Kalkulasi berjalan",
  READY_FOR_APPROVAL: "Siap disetujui",
  DISBURSING: "Pencairan berjalan",
  PARTIAL: "Cair sebagian",
  CANCELLED: "Dibatalkan",
  SUBMITTED: "Diajukan",
  RISK_PENDING: "Evaluasi risiko",
  UNDER_REVIEW: "Menunggu keputusan",
  RETURNED: "Dikembalikan",
  ESCALATED: "Eskalasi",
  COMPLIANCE_REVIEW: "Review kepatuhan",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  DISBURSED: "Sudah dicairkan",
  PENDING: "Menunggu",
  PROCESSING: "Diproses",
  PAID: "Dibayar",
  FAILED: "Gagal",
  REVERSED: "Dibalik",
  QUEUED: "Dalam antrean",
  GENERATING: "Sedang dibuat",
  READY: "Siap",
  PERMANENT: "Tetap",
  CONTRACT: "Kontrak",
  PROBATION: "Masa percobaan",
  INACTIVE: "Tidak aktif",
};

const CATEGORY_LABELS: Record<string, string> = {
  HEALTH: "Kesehatan",
  ACCIDENT: "Kecelakaan",
  PROPERTY: "Properti",
  GUARANTEE: "Penjaminan",
};

const PERSONNEL_TYPE_LABELS: Record<string, string> = {
  EMPLOYEE: "Karyawan",
  SALES_AGENT: "Agen penjualan",
};

const EMPLOYMENT_LABELS: Record<string, string> = {
  PERMANENT: "Tetap",
  CONTRACT: "Kontrak",
  PROBATION: "Masa percobaan",
  INACTIVE: "Tidak aktif",
};

const BATCH_TYPE_LABELS: Record<string, string> = {
  REGULAR: "Reguler",
  CORRECTION: "Koreksi",
  THR: "THR",
  THIRTEENTH_MONTH: "Gaji ketiga belas",
};

const LEAVE_TYPE_LABELS: Record<string, string> = {
  ANNUAL: "Cuti tahunan",
  SICK: "Cuti sakit",
  MATERNITY: "Cuti melahirkan",
  UNPAID: "Cuti tidak dibayar",
  OTHER: "Cuti lainnya",
};

const ROLE_LABELS: Record<string, string> = {
  CLAIMS_OFFICER: "Petugas Klaim",
  BRANCH_MANAGER: "Manajer Cabang",
  FINANCE_MANAGER: "Manajer Keuangan",
  COMPLIANCE_ADMIN: "Administrator Kepatuhan",
  MIS_ANALYST: "Analis MIS",
  HR_SPECIALIST: "Spesialis SDM",
};

const DOCUMENT_LABELS: Record<string, string> = {
  IDENTITY_CARD: "Kartu identitas",
  MEDICAL_INVOICE: "Tagihan medis",
  POLICE_REPORT: "Laporan kepolisian",
  POLICY_CERT: "Sertifikat polis",
};

const CONFLICT_LABELS: Record<string, string> = {
  SHARED_BANK_ACCOUNT: "Rekening sama dengan personel internal",
  SHARED_NIK_IDENTITY: "NIK sama dengan agen penjualan",
  MULTI_CLAIM_SAME_ACCOUNT: "Banyak klaim pada rekening yang sama",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

export function personnelTypeLabel(value: string): string {
  return PERSONNEL_TYPE_LABELS[value] ?? value;
}

export function employmentLabel(value: string): string {
  return EMPLOYMENT_LABELS[value] ?? value;
}

export function batchTypeLabel(value: string): string {
  return BATCH_TYPE_LABELS[value] ?? value;
}

export function leaveTypeLabel(value: string): string {
  return LEAVE_TYPE_LABELS[value] ?? value;
}

export function documentLabel(type: string): string {
  return DOCUMENT_LABELS[type] ?? type;
}

export function conflictLabel(type: string): string {
  return CONFLICT_LABELS[type] ?? type;
}

export function statusClass(status: string): string {
  return `badge badge--${status.toLowerCase()}`;
}

export function maskId(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 8)}…${value.slice(-4)}`;
}

const ACTION_LABELS: Record<string, string> = {
  CLAIM_DRAFT_CREATED: "Draf klaim dibuat",
  CLAIM_UPDATED: "Klaim direvisi",
  CLAIM_SUBMITTED: "Klaim diajukan",
  CLAIM_RISK_EVALUATED: "Evaluasi risiko selesai",
  CLAIM_COMPLIANCE_REVIEWED: "Review kepatuhan dicatat",
  CLAIM_FRAUD_CONFIRMED: "Fraud dikonfirmasi",
  CLAIM_APPROVED: "Klaim disetujui",
  CLAIM_REJECTED: "Klaim ditolak",
  CLAIM_RETURNED: "Klaim dikembalikan",
  CLAIM_DISBURSEMENT_REQUESTED: "Pencairan diminta",
  CLAIM_DISBURSED: "Klaim dicairkan",
  CLAIM_DISBURSEMENT_FAILED: "Pencairan gagal",
  POLICY_DRAFT_CREATED: "Draf kebijakan dibuat",
  POLICY_APPROVED: "Kebijakan disetujui",
  POLICY_PUBLISHED: "Kebijakan diterbitkan",
  REFRESH_TOKEN_ROTATED: "Rotasi refresh token",
  BATCH_DISBURSED: "Batch payroll dicairkan",
  USER_LOGGED_IN: "Pengguna masuk",
  MFA_ENROLLED: "MFA didaftarkan",
  MFA_ENABLED: "MFA diaktifkan",
  MFA_RECOVERY_USED: "Recovery code dipakai",
  SECURITY_EVENT: "Peristiwa keamanan",
};

const CONTEXT_LABELS: Record<string, string> = {
  claim_category: "Kategori",
  requested_amount: "Nominal diajukan",
  document_count: "Jumlah dokumen",
  policy_version_tag: "Versi kebijakan",
  risk_score: "Skor risiko",
  route: "Jalur persetujuan",
  anomaly_flags: "Flag anomali",
  decision: "Keputusan",
  step_level: "Level keputusan",
  reason_notes: "Alasan",
  approved_amount: "Nominal disetujui",
  provider: "Provider",
  amount: "Nominal",
  source: "Sumber",
  family_id: "Family sesi",
  mfa_enabled: "Status MFA",
  resolution: "Resolusi",
  changed_fields: "Field yang diubah",
  checksum_sha256: "Checksum",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replaceAll("_", " ").toLowerCase();
}

export function contextLabel(key: string): string {
  return CONTEXT_LABELS[key] ?? key.replaceAll("_", " ");
}

export function contextValue(value: unknown): string {
  if (typeof value === "string") {
    return value.replaceAll("_", " ");
  }
  if (value === null || value === undefined) {
    return "Tidak ada";
  }
  return String(value);
}

const DOMAIN_LABELS: Record<string, string> = {
  CLAIMS: "Klaim",
  GOVERNANCE: "Governance",
  PAYROLL: "Payroll",
  ANALYTICS: "Analitik",
};

export function domainLabel(domain: string): string {
  return DOMAIN_LABELS[domain] ?? domain;
}
