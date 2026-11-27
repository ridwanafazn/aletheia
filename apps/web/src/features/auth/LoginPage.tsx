import { useRef, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "@tanstack/react-router";
import { ArrowRight, ChevronLeft, ChevronRight, LockKeyhole } from "lucide-react";

import type { Role } from "@aletheia/shared-contracts";

import { ApiError } from "../../shared/api/client";
import { Banner, Button } from "../../shared/ui";
import { useAuth } from "./AuthProvider";

const DEMO_USERS = [
  {
    label: "Karyawan",
    email: "employee.siti@aletheia.id",
    note: "Melihat slip, absensi, cuti, dan lembur",
  },
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

function landingFor(role: Role | undefined): "/payroll" | "/mis" | "/claims" | "/me" {
  if (role === "EMPLOYEE") {
    return "/me";
  }
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
  const [email, setEmail] = useState(DEMO_USERS[0]?.email ?? "employee.siti@aletheia.id");
  const [password, setPassword] = useState("AletheiaDemo!2026");
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const [accountIndex, setAccountIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);

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
      const nextUser = await login({ email, password });
      await navigate({ to: landingFor(nextUser.role), replace: true });
    } catch (caught) {
      setError(caught);
    } finally {
      setSubmitting(false);
    }
  };

  const centerAccount = (index: number, behavior: ScrollBehavior = "smooth") => {
    const track = trackRef.current;
    const card = cardRefs.current[index];
    if (track === null || card === null || card === undefined) {
      return;
    }
    const nextLeft = card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2;
    track.scrollTo({ left: Math.max(0, nextLeft), behavior });
  };

  const selectAccount = (index: number) => {
    const next = DEMO_USERS[index];
    if (next === undefined) {
      return;
    }
    setAccountIndex(index);
    setEmail(next.email);
    setPassword("AletheiaDemo!2026");
    centerAccount(index);
  };

  const moveAccount = (delta: number) => {
    const next = (accountIndex + delta + DEMO_USERS.length) % DEMO_USERS.length;
    selectAccount(next);
  };

  const handleAccountScroll = () => {
    const track = trackRef.current;
    if (track === null) {
      return;
    }
    const center = track.scrollLeft + track.clientWidth / 2;
    let nearest = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    cardRefs.current.forEach((card, index) => {
      if (card === null) {
        return;
      }
      const distance = Math.abs(card.offsetLeft + card.offsetWidth / 2 - center);
      if (distance < nearestDistance) {
        nearest = index;
        nearestDistance = distance;
      }
    });
    if (nearest !== accountIndex) {
      const next = DEMO_USERS[nearest];
      if (next !== undefined) {
        setAccountIndex(nearest);
        setEmail(next.email);
        setPassword("AletheiaDemo!2026");
      }
    }
  };

  const errorMessage =
    error instanceof ApiError
      ? error.status >= 500 || error.code === "ERR_INTERNAL_ERROR"
        ? "Layanan demo sedang bangun. Tunggu beberapa detik lalu klik Masuk lagi."
        : error.message
      : "Periksa koneksi lalu coba lagi";

  return (
    <main className="login-page">
      <section className="login-brand" aria-label="Tentang Aletheia">
        <div className="login-brand__mark">
          <img src="/brand/aletheia-mark-white.svg" alt="" className="brand__mark" />
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
                {errorMessage}
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

          <div
            className="account-carousel"
            role="region"
            aria-roledescription="carousel"
            aria-label="Akun demo"
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                moveAccount(-1);
              }
              if (event.key === "ArrowRight") {
                event.preventDefault();
                moveAccount(1);
              }
            }}
          >
            <div className="account-carousel__track" ref={trackRef} onScroll={handleAccountScroll}>
              {DEMO_USERS.map((demoUser, index) => {
                const active = index === accountIndex;
                return (
                  <button
                    key={demoUser.email}
                    type="button"
                    ref={(node) => {
                      cardRefs.current[index] = node;
                    }}
                    className={`account-card${active ? " account-card--active" : ""}`}
                    aria-pressed={active}
                    aria-label={`Pilih akun ${demoUser.label}`}
                    onClick={() => selectAccount(index)}
                  >
                    <span className="account-card__label">{demoUser.label}</span>
                    <span className="account-card__note">{demoUser.note}</span>
                    <span className="account-card__state">
                      {active ? "Terpilih" : "Pilih akun"}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="account-carousel__arrow account-carousel__arrow--prev"
              aria-label="Akun sebelumnya"
              onClick={() => moveAccount(-1)}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="account-carousel__arrow account-carousel__arrow--next"
              aria-label="Akun berikutnya"
              onClick={() => moveAccount(1)}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            <div className="account-carousel__footer">
              <div className="account-carousel__dots" aria-label="Posisi akun demo">
                {DEMO_USERS.map((demoUser, index) => (
                  <button
                    key={demoUser.email}
                    type="button"
                    className={`account-carousel__dot${
                      index === accountIndex ? " account-carousel__dot--active" : ""
                    }`}
                    aria-label={`Tampilkan akun ${index + 1}`}
                    aria-current={index === accountIndex ? "true" : undefined}
                    onClick={() => selectAccount(index)}
                  />
                ))}
              </div>
              <span className="account-carousel__count">
                {accountIndex + 1} / {DEMO_USERS.length}
              </span>
            </div>
            <p className="sr-only" aria-live="polite">
              Akun demo {accountIndex + 1} dari {DEMO_USERS.length}:{" "}
              {DEMO_USERS[accountIndex]?.label ?? ""}
            </p>
          </div>

          <p className="muted small" style={{ marginTop: 18 }}>
            Data demo sintetis tanpa uang nyata dan tanpa data pribadi.
          </p>
        </div>
      </section>
    </main>
  );
}
