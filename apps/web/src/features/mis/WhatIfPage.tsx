import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, FlaskConical, Play, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import type { WhatIfSimulation } from "./api";
import { fetchWhatIfSimulations, getActivePayrollPolicy, runWhatIf } from "./api";
import {
  currentPeriod,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPeriod,
  formatRate,
  periodEndDate,
} from "../../shared/lib/format";
import { listBranches } from "../../shared/api/reference";
import { Banner, Button, EmptyState, ErrorState, PageHeader, SkeletonTable } from "../../shared/ui";

function adjustedRate(rate: string, percent: number): string {
  return (Number(rate) * (1 + percent / 100)).toFixed(4);
}

const IMPACT_LABELS: Record<string, string> = {
  branch_code: "Cabang",
  affected_items: "Item terdampak",
  agent_count: "Jumlah agen",
  actual_commission: "Komisi aktual",
  simulated_commission: "Komisi simulasi",
};

function impactLabel(value: string): string {
  return IMPACT_LABELS[value] ?? value.replaceAll("_", " ");
}

function impactValue(value: unknown): string {
  if (typeof value === "number") {
    return formatNumber(value);
  }
  if (typeof value === "string") {
    return value;
  }
  return "Tidak ada";
}

export default function WhatIfPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [simulationName, setSimulationName] = useState("Kenaikan komisi agen 10 persen");
  const [percent, setPercent] = useState("10");
  const [period, setPeriod] = useState(currentPeriod());
  const [branchId, setBranchId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const policyQuery = useQuery({
    queryKey: ["payroll-active-policy"],
    queryFn: getActivePayrollPolicy,
  });
  const branchesQuery = useQuery({
    queryKey: ["payroll-branches"],
    queryFn: listBranches,
    staleTime: 300_000,
  });
  const simulationsQuery = useQuery({
    queryKey: ["what-if-simulations"],
    queryFn: () => fetchWhatIfSimulations(10),
  });

  const policy = policyQuery.data?.data;
  const branches = branchesQuery.data?.data.items ?? [];
  const simulations = simulationsQuery.data ?? [];
  const selected: WhatIfSimulation | undefined =
    simulations.find((simulation) => simulation.id === selectedId) ?? simulations[0];
  const numericPercent = Number(percent);
  const validPercent = Number.isFinite(numericPercent) && numericPercent > -100;

  const preview = useMemo(() => {
    if (policy === undefined || !validPercent) {
      return [];
    }
    return policy.rules_payload.agent_commission_tiers.map((tier) => ({
      minSales: tier.min_sales,
      maxSales: tier.max_sales,
      currentRate: tier.commission_rate,
      simulatedRate: adjustedRate(tier.commission_rate, numericPercent),
    }));
  }, [policy, numericPercent, validPercent]);

  const run = useMutation({
    mutationFn: async () => {
      if (policy === undefined) {
        throw new Error("Kebijakan payroll aktif belum tersedia");
      }
      if (!validPercent) {
        throw new Error("Penyesuaian komisi harus lebih besar dari minus 100 persen");
      }
      if (simulationName.trim().length < 3) {
        throw new Error("Nama simulasi minimal 3 karakter");
      }
      return runWhatIf({
        simulationName: simulationName.trim(),
        basePolicyVersionId: policy.id,
        simulatedRulesPayload: {
          commission_mode: policy.rules_payload.commission_mode,
          agent_commission_tiers: policy.rules_payload.agent_commission_tiers.map((tier) => ({
            min_sales: tier.min_sales,
            max_sales: tier.max_sales,
            commission_rate: adjustedRate(tier.commission_rate, numericPercent),
          })),
        },
        targetPeriodStart: `${period}-01`,
        targetPeriodEnd: periodEndDate(period),
        ...(branchId.length === 0 ? {} : { branchId }),
      });
    },
    onSuccess: (result) => {
      setNotice(
        result.enqueued
          ? "Simulasi masuk antrean worker. Hasil akan muncul setelah kalkulasi selesai."
          : "Permintaan simulasi dicatat, tetapi QStash belum aktif sehingga event tidak dikirim.",
      );
      void queryClient.invalidateQueries({ queryKey: ["what-if-simulations"] });
    },
  });

  const error = run.error ?? policyQuery.error ?? simulationsQuery.error;

  return (
    <div className="stack">
      <PageHeader
        title="What-If Sandbox"
        description="Ubah tarif komisi pada salinan kebijakan dan bandingkan biaya aktual dengan simulasi. Seluruh replay berjalan read-only."
        actions={
          <Button
            variant="secondary"
            icon={<ArrowLeft size={15} />}
            onClick={() => navigate({ to: "/mis" })}
          >
            Kembali
          </Button>
        }
      />

      <div className="row small muted">
        <ShieldCheck size={14} aria-hidden="true" />
        <span>Simulasi tidak menulis ke payroll, klaim, atau item pembayaran.</span>
        <span className="badge badge--compliance_review">SIMULATION READ ONLY</span>
        <Link to="/mis" className="small">
          Kembali ke MIS Intelligence
        </Link>
      </div>

      {notice === null ? null : (
        <Banner tone={run.data?.enqueued === false ? "warning" : "success"} title="Simulasi">
          {notice}
        </Banner>
      )}
      {error === null ? null : (
        <Banner tone="danger" title="Simulasi gagal">
          {error instanceof Error ? error.message : "Periksa input lalu coba lagi"}
        </Banner>
      )}

      <div className="grid-sidebar">
        <section className="panel">
          <div className="panel__header">
            <div>
              <div className="panel__title">Skenario komisi</div>
              <div className="panel__description">
                Basis kebijakan {policy?.version_tag ?? "memuat"}
              </div>
            </div>
            <FlaskConical size={16} aria-hidden="true" />
          </div>
          <div className="panel__body">
            {policyQuery.isPending ? (
              <SkeletonTable rows={4} />
            ) : policyQuery.isError ? (
              <ErrorState error={policyQuery.error} onRetry={() => void policyQuery.refetch()} />
            ) : policy === undefined ? (
              <EmptyState
                title="Kebijakan payroll tidak tersedia"
                body="What-If memerlukan kebijakan payroll aktif pada tenant ini."
              />
            ) : (
              <form
                className="stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  run.mutate();
                }}
              >
                <div className="field">
                  <label className="field__label" htmlFor="what-if-name">
                    Nama simulasi <span className="field__required">wajib</span>
                  </label>
                  <input
                    id="what-if-name"
                    className="input"
                    value={simulationName}
                    onChange={(event) => setSimulationName(event.target.value)}
                    maxLength={120}
                    required
                  />
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label className="field__label" htmlFor="what-if-period">
                      Periode historis
                    </label>
                    <input
                      id="what-if-period"
                      className="input"
                      type="month"
                      value={period}
                      onChange={(event) => setPeriod(event.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="what-if-branch">
                      Cabang
                    </label>
                    <select
                      id="what-if-branch"
                      className="select"
                      value={branchId}
                      onChange={(event) => setBranchId(event.target.value)}
                    >
                      <option value="">Semua cabang</option>
                      {branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.code} · {branch.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="field">
                  <label className="field__label" htmlFor="what-if-percent">
                    Penyesuaian tarif komisi
                  </label>
                  <div className="row">
                    <input
                      id="what-if-percent"
                      className="input input--money"
                      type="number"
                      step="0.1"
                      min="-99"
                      max="500"
                      value={percent}
                      onChange={(event) => setPercent(event.target.value)}
                      style={{ maxWidth: 160 }}
                    />
                    <span className="small muted">persen dari tarif aktif</span>
                  </div>
                  <span className="field__hint">
                    Nilai positif menaikkan komisi. Nilai negatif menurunkannya.
                  </span>
                </div>

                <div
                  className="table-wrap"
                  tabIndex={0}
                  aria-label="Perbandingan tarif komisi aktif dan tarif simulasi"
                >
                  <table className="table">
                    <caption className="sr-only">
                      Perbandingan tarif komisi aktif dan tarif simulasi
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Rentang penjualan</th>
                        <th scope="col" className="numeric">
                          Tarif aktif
                        </th>
                        <th scope="col" className="numeric">
                          Tarif simulasi
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((tier) => (
                        <tr key={tier.minSales}>
                          <td>
                            {formatMoney(tier.minSales)} sampai {formatMoney(tier.maxSales)}
                          </td>
                          <td className="numeric">{formatRate(tier.currentRate)}</td>
                          <td className="numeric">{formatRate(tier.simulatedRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="row row--between">
                  <span className="small muted">Target {formatPeriod(`${period}-01`)}</span>
                  <Button
                    variant="primary"
                    type="submit"
                    icon={<Play size={15} />}
                    loading={run.isPending}
                  >
                    Jalankan simulasi
                  </Button>
                </div>
              </form>
            )}
          </div>
        </section>

        <aside className="stack">
          <section className="panel">
            <div className="panel__header">
              <div>
                <div className="panel__title">Perbandingan</div>
                <div className="panel__description">
                  {selected === undefined ? "Belum ada simulasi" : selected.simulationName}
                </div>
              </div>
            </div>
            <div className="panel__body">
              {simulationsQuery.isPending ? (
                <SkeletonTable rows={3} />
              ) : selected === undefined ? (
                <EmptyState
                  title="Belum ada hasil simulasi"
                  body="Jalankan skenario baru atau tunggu worker memproses antrean."
                  icon={<FlaskConical size={18} />}
                />
              ) : (
                <div className="stack">
                  <div className="what-if-compare">
                    <div className="what-if-compare__side">
                      <span className="micro">Aktual</span>
                      <strong>{formatMoney(selected.actualTotalCost)}</strong>
                      <span className="small muted">Biaya historis</span>
                    </div>
                    <div className="what-if-compare__side what-if-compare__side--simulated">
                      <span className="micro">Simulasi</span>
                      <strong>{formatMoney(selected.simulatedTotalCost)}</strong>
                      <span className="small muted">Setelah perubahan</span>
                    </div>
                  </div>
                  <div className="variance variance--total">
                    <span className="variance__label">Selisih biaya</span>
                    <span
                      className={`numeric ${Number(selected.varianceAmount) > 0 ? "variance__down" : "variance__up"}`}
                    >
                      {Number(selected.varianceAmount) > 0 ? "+" : ""}
                      {formatMoney(selected.varianceAmount)}
                    </span>
                  </div>
                  <div className="variance">
                    <span className="variance__label">Variance</span>
                    <span className="numeric">
                      {selected.variancePercentage > 0 ? "+" : ""}
                      {formatNumber(selected.variancePercentage)} persen
                    </span>
                  </div>
                  <div className="summary-list">
                    <div>
                      <div className="summary-list__label">Kebijakan dasar</div>
                      <div className="summary-list__value mono">
                        {selected.basePolicyVersionTag}
                      </div>
                    </div>
                    <div>
                      <div className="summary-list__label">Dibuat</div>
                      <div className="summary-list__value">
                        {formatDateTime(selected.createdAt)}
                      </div>
                    </div>
                    {Object.entries(selected.impactBreakdown).map(([key, value]) => (
                      <div key={key}>
                        <div className="summary-list__label">{impactLabel(key)}</div>
                        <div className="summary-list__value">{impactValue(value)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel__header">
              <div>
                <div className="panel__title">Simulasi terakhir</div>
                <div className="panel__description">Pilih untuk membandingkan</div>
              </div>
            </div>
            <div className="panel__body">
              {simulationsQuery.isPending ? (
                <SkeletonTable rows={3} />
              ) : simulationsQuery.isError ? (
                <ErrorState
                  error={simulationsQuery.error}
                  onRetry={() => void simulationsQuery.refetch()}
                />
              ) : simulations.length === 0 ? (
                <p className="small muted">Belum ada simulasi tersimpan.</p>
              ) : (
                <div className="stack stack--sm">
                  {simulations.map((simulation) => (
                    <button
                      key={simulation.id}
                      type="button"
                      className={`what-if-item${selected?.id === simulation.id ? " what-if-item--active" : ""}`}
                      onClick={() => setSelectedId(simulation.id)}
                    >
                      <div>
                        <div className="what-if-item__name">{simulation.simulationName}</div>
                        <div className="what-if-item__meta">
                          {simulation.basePolicyVersionTag} · {formatDateTime(simulation.createdAt)}
                        </div>
                      </div>
                      <span className="numeric small">
                        {formatNumber(simulation.variancePercentage)}%
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
