import type { ReportType } from "@aletheia/shared-contracts";

import { periodEndDate } from "../../shared/lib/format";

export interface ReportTypeOption {
  value: ReportType;
  label: string;
  periodMode: "month" | "year";
}

export const REPORT_TYPE_OPTIONS: ReadonlyArray<ReportTypeOption> = [
  { value: "PPH21_MONTHLY", label: "PPh 21 bulanan", periodMode: "month" },
  { value: "PPH21_ANNUAL", label: "PPh 21 tahunan", periodMode: "year" },
  { value: "BPJS_MONTHLY", label: "BPJS bulanan", periodMode: "month" },
  { value: "BANK_FILE", label: "Berkas transfer bank", periodMode: "month" },
  { value: "PAYROLL_VARIANCE", label: "Varians payroll", periodMode: "month" },
];

export function reportPeriod(input: { reportType: ReportType; month: string; year: string }): {
  period_start: string;
  period_end: string;
} {
  const option = REPORT_TYPE_OPTIONS.find((item) => item.value === input.reportType);
  if (option?.periodMode === "year") {
    return {
      period_start: `${input.year}-01-01`,
      period_end: `${input.year}-12-31`,
    };
  }
  return {
    period_start: `${input.month}-01`,
    period_end: periodEndDate(input.month),
  };
}
