import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "@tanstack/react-router";
import { ArrowRight, LockKeyhole } from "lucide-react";

import type { Role } from "@aletheia/shared-contracts";

import { ApiError } from "../../shared/api/client";
import { Banner, Button } from "../../shared/ui";
import { useAuth } from "./AuthProvider";

const DEMO_USERS = [
  {
    label: "Spesialis SDM",
    email: "hr.ops@aletheia.id",
    note: "Menjalankan batch dan mengelola personel",
  },
  {
    label: "Petugas Klaim",
    email: "officer.bdg@aletheia.id",
    note: "Membuat dan mengirim klaim",
  },
  {
    label: "Manajer Cabang",
    email: "manager.bdg@aletheia.id",
    note: "Menyetujui batas cabang",
  },
  {
    label: "Manajer Keuangan",
    email: "finance.vp@aletheia.id",
    note: "Menyetujui eskalasi dan pencairan",
  },
  {
    label: "Administrator Kepatuhan",
    email: "compliance@aletheia.id",
    note: "Review konflik dan audit",
  },
  {
    label: "Analis MIS",
    email: "mis.analyst@aletheia.id",
    note: "Membaca KPI dan simulasi",
  },
];

function landingFor(role: Role | undefined): "/payroll" | "/mis" | "/claims" {
  if (role === "HR_SPECIALIST") {
    return "/payroll";
  }
  if (role === "MIS_ANALYST") {
    return "/mis";
  }
  return "/claims";
}

export default function LoginPage() {
  const { login, status, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("officer.bdg@aletheia.id");
  const [password, setPassword] = useState("AletheiaDemo!2026");
  const [mfaCode, setMfaCode] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === "loading") {
    return (
      <div className="content" role="status" aria-label="Memuat sesi">
        <div className="skeleton skeleton--row" style={{ height: 320 }} />
      </div>
    );
  }

  if (status === "authenticated") {
    return <Navigate to={landingFor(user?.role)} replace />;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const nextUser = await login({ email, password, mfaCode });
      await navigate({ to: landingFor(nextUser.role), replace: true });
    } catch (caught) {
      setError(caught);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-brand" aria-label="Tentang Aletheia">
        <div className="login-brand__mark">
          <span className="brand__mark" aria-hidden="true">
            A
          </span>
          <div>
            <span className="brand__name">Aletheia</span>
            <span className="brand__sub">Governed money movement</span>
          </div>
        </div>
        <div>
          <p className="login-brand__headline">Kendali penuh atas setiap pencairan.</p>
          <p className="login-brand__body">
            Kebijakan berversi, pemisahan tugas, dan jejak audit yang tidak dapat diubah. Satu ruang
            kerja untuk klaim, persetujuan, dan pengawasan.
          </p>
        </div>
        <div className="login-brand__meta">
          <span>Klaim</span>
          <span>Persetujuan</span>
          <span>Audit</span>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <h1>Selamat datang kembali</h1>
          <p className="login-card__description">
            Gunakan akun demo untuk menelusuri alur klaim dan persetujuan.
          </p>

          {error === null ? null : (
            <div className="stack--sm" style={{ marginBottom: 16 }}>
              <Banner tone="danger" title="Tidak dapat masuk">
                {error instanceof ApiError ? error.message : "Periksa koneksi lalu coba lagi"}
                {error instanceof ApiError && error.correlationId !== null ? (
                  <div className="error-state__code">{error.correlationId}</div>
                ) : null}
              </Banner>
            </div>
          )}

          <form className="stack" onSubmit={submit} noValidate>
            <div className="field">
              <label className="field__label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                className="input"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="password">
                Kata sandi
              </label>
              <input
                id="password"
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="mfa">
                Kode MFA
              </label>
              <input
                id="mfa"
                className="input"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Opsional untuk akun demo"
                value={mfaCode}
                onChange={(event) => setMfaCode(event.target.value)}
                maxLength={6}
              />
              <span className="field__hint">
                Isi bila akun sudah mengaktifkan autentikasi dua faktor.
              </span>
            </div>

            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              icon={<LockKeyhole size={15} />}
            >
              Masuk
              {submitting ? null : <ArrowRight size={15} aria-hidden="true" />}
            </Button>
          </form>

          <div className="demo-roles" aria-label="Akun demo">
            {DEMO_USERS.map((user) => (
              <button
                key={user.email}
                type="button"
                className="demo-role"
                onClick={() => {
                  setEmail(user.email);
                  setPassword("AletheiaDemo!2026");
                  setMfaCode("");
                }}
              >
                <strong>{user.label}</strong>
                {user.note}
              </button>
            ))}
          </div>

          <p className="muted small" style={{ marginTop: 18 }}>
            Data demo sintetis tanpa uang nyata dan tanpa data pribadi.
          </p>
        </div>
      </section>
    </main>
  );
}
