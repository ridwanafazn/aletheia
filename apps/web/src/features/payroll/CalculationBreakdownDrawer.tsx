import type { PayrollItem } from "@aletheia/shared-contracts";

import { Drawer, Money } from "../../shared/ui";
import { formatMoney, formatPeriod, formatRate } from "../../shared/lib/format";

function LedgerRow({
  label,
  value,
  negative = false,
}: {
  label: string;
  value: string;
  negative?: boolean;
}) {
  return (
    <div className="ledger__row">
      <dt>{label}</dt>
      <dd>
        <span className={negative ? "ledger__negative" : undefined}>
          {negative ? "− " : ""}
          {formatMoney(value)}
        </span>
      </dd>
    </div>
  );
}

export function CalculationBreakdownDrawer({
  open,
  onClose,
  item,
  employeeName,
  employeeCode,
  periodMonth,
}: {
  open: boolean;
  onClose: () => void;
  item: PayrollItem | null;
  employeeName: string;
  employeeCode: string;
  periodMonth: string;
}) {
  if (item === null) {
    return null;
  }
  const breakdown = item.calculation_breakdown;
  const employeeDeductions =
    Number(breakdown.deduction_components.bpjs_kesehatan) +
    Number(breakdown.deduction_components.bpjs_jht) +
    Number(breakdown.deduction_components.bpjs_jp) +
    Number(breakdown.deduction_components.pph21_tax);
  const employerTotal =
    Number(breakdown.employer_components.bpjs_kesehatan) +
    Number(breakdown.employer_components.bpjs_jht) +
    Number(breakdown.employer_components.bpjs_jp) +
    Number(breakdown.employer_components.bpjs_jkk) +
    Number(breakdown.employer_components.bpjs_jkm);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={employeeName}
      description={`${employeeCode} · ${formatPeriod(periodMonth)} · ${breakdown.policy_version_tag}`}
    >
      <div className="stack">
        <div className="breakdown-hero">
          <div className="micro">Net diterima</div>
          <div className="amount-large">{formatMoney(breakdown.net_take_home_pay)}</div>
          <div className="small muted">
            Bruto {formatMoney(item.gross_income)} dikurangi potongan karyawan{" "}
            {formatMoney(String(employeeDeductions))}
          </div>
        </div>

        <div className="summary-list">
          <div>
            <div className="summary-list__label">Status PTKP</div>
            <div className="summary-list__value mono">{breakdown.ptkp_status}</div>
          </div>
          <div>
            <div className="summary-list__label">Kategori TER</div>
            <div className="summary-list__value">
              {breakdown.ter_category.replace("CATEGORY_", "Kategori ")}
            </div>
          </div>
          <div>
            <div className="summary-list__label">Tarif TER</div>
            <div className="summary-list__value mono">{formatRate(breakdown.applied_ter_rate)}</div>
          </div>
          <div>
            <div className="summary-list__label">Dasar pengenaan</div>
            <div className="summary-list__value mono">{formatMoney(breakdown.ter_base)}</div>
          </div>
          <div>
            <div className="summary-list__label">Pembulatan</div>
            <div className="summary-list__value mono">
              {formatMoney(breakdown.rounding_adjustment)}
            </div>
          </div>
          <div>
            <div className="summary-list__label">Kebijakan</div>
            <div className="summary-list__value mono">{breakdown.policy_version_tag}</div>
          </div>
        </div>

        <section>
          <h3>Komponen bruto</h3>
          <dl className="ledger">
            <LedgerRow label="Gaji pokok" value={breakdown.gross_components.base_salary} />
            <LedgerRow label="Tunjangan tetap" value={breakdown.gross_components.fixed_allowance} />
            <LedgerRow
              label="Tunjangan variabel"
              value={breakdown.gross_components.variable_allowance}
            />
            <LedgerRow label="Lembur" value={breakdown.gross_components.overtime_pay} />
            <LedgerRow label="Komisi agen" value={breakdown.gross_components.agent_commission} />
            <LedgerRow
              label="Potongan cuti tidak dibayar"
              value={item.unpaid_leave_deduction}
              negative
            />
            <LedgerRow label="Potongan absensi" value={item.absence_deduction} negative />
            <div className="ledger__row ledger__row--total">
              <dt>Bruto</dt>
              <dd>
                <Money value={item.gross_income} />
              </dd>
            </div>
          </dl>
        </section>

        <section>
          <h3>Potongan karyawan</h3>
          <dl className="ledger">
            <LedgerRow
              label="BPJS Kesehatan"
              value={breakdown.deduction_components.bpjs_kesehatan}
            />
            <LedgerRow label="BPJS JHT" value={breakdown.deduction_components.bpjs_jht} />
            <LedgerRow label="BPJS JP" value={breakdown.deduction_components.bpjs_jp} />
            <LedgerRow label="PPh 21" value={breakdown.deduction_components.pph21_tax} />
            <div className="ledger__row ledger__row--total">
              <dt>Total potongan</dt>
              <dd>{formatMoney(String(employeeDeductions))}</dd>
            </div>
          </dl>
        </section>

        <section>
          <h3>Kontribusi pemberi kerja</h3>
          <dl className="ledger">
            <LedgerRow
              label="BPJS Kesehatan"
              value={breakdown.employer_components.bpjs_kesehatan}
            />
            <LedgerRow label="BPJS JHT" value={breakdown.employer_components.bpjs_jht} />
            <LedgerRow label="BPJS JP" value={breakdown.employer_components.bpjs_jp} />
            <LedgerRow label="BPJS JKK" value={breakdown.employer_components.bpjs_jkk} />
            <LedgerRow label="BPJS JKM" value={breakdown.employer_components.bpjs_jkm} />
            <div className="ledger__row ledger__row--total">
              <dt>Total pemberi kerja</dt>
              <dd>{formatMoney(String(employerTotal))}</dd>
            </div>
          </dl>
        </section>

        <div className="small muted">
          Komponen pemberi kerja tidak mengurangi net karyawan. Nilai ini menjadi beban tambahan
          perusahaan pada periode berjalan.
        </div>
      </div>
    </Drawer>
  );
}
