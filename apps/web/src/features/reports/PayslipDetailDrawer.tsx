import type { Payslip } from "@aletheia/shared-contracts";

import { Drawer, Money } from "../../shared/ui";
import { formatDateTime, formatMoney, formatPeriod } from "../../shared/lib/format";

export function PayslipDetailDrawer({
  open,
  onClose,
  payslip,
  employeeName,
  employeeCode,
}: {
  open: boolean;
  onClose: () => void;
  payslip: Payslip | null;
  employeeName: string;
  employeeCode: string;
}) {
  if (payslip === null) {
    return null;
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={employeeName}
      description={`${employeeCode} · ${formatPeriod(payslip.period_month)} · versi ${payslip.version}`}
    >
      <div className="stack">
        <div className="employee-hero">
          <div>
            <div className="micro">Net diterima</div>
            <div className="amount-large">
              <Money value={payslip.net_take_home_pay} />
            </div>
            <div className="small muted">
              Bruto {formatMoney(payslip.gross_income)} · kode verifikasi{" "}
              {payslip.verification_code}
            </div>
          </div>
          <span className="badge badge--draft">
            <span className="badge__dot" aria-hidden="true" />
            Tersimpan
          </span>
        </div>

        <div className="summary-list">
          <div>
            <div className="summary-list__label">Periode</div>
            <div className="summary-list__value">{formatPeriod(payslip.period_month)}</div>
          </div>
          <div>
            <div className="summary-list__label">Versi</div>
            <div className="summary-list__value mono">{payslip.version}</div>
          </div>
          <div>
            <div className="summary-list__label">Diterbitkan</div>
            <div className="summary-list__value">{formatDateTime(payslip.published_at)}</div>
          </div>
          <div>
            <div className="summary-list__label">Dilihat</div>
            <div className="summary-list__value">{formatDateTime(payslip.viewed_at)}</div>
          </div>
          <div>
            <div className="summary-list__label">Batch</div>
            <div className="summary-list__value mono">{payslip.batch_id}</div>
          </div>
          <div>
            <div className="summary-list__label">Personel</div>
            <div className="summary-list__value mono">{payslip.personnel_id}</div>
          </div>
          {payslip.supersedes_id === null ? null : (
            <div>
              <div className="summary-list__label">Menggantikan</div>
              <div className="summary-list__value mono">{payslip.supersedes_id}</div>
            </div>
          )}
        </div>

        <section>
          <h3>Integritas berkas</h3>
          <dl className="ledger">
            <div className="ledger__row">
              <dt>Checksum berkas</dt>
              <dd className="mono small">{payslip.file_checksum_sha256}</dd>
            </div>
            <div className="ledger__row">
              <dt>Snapshot data</dt>
              <dd className="mono small">{payslip.snapshot_hash_sha256}</dd>
            </div>
            <div className="ledger__row">
              <dt>Kode verifikasi</dt>
              <dd className="mono">{payslip.verification_code}</dd>
            </div>
          </dl>
          <p className="small muted" style={{ marginTop: 10 }}>
            Slip dirender dari breakdown perhitungan yang tersimpan. Angka tidak dihitung ulang di
            browser.
          </p>
        </section>
      </div>
    </Drawer>
  );
}
