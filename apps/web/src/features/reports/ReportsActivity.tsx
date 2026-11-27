import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";

import { SkeletonTable } from "../../shared/ui";
import { StatusDonut } from "../overview/charts";
import { listReports } from "./api";

const COLORS = {
  ready: "#0e9384",
  pending: "#b54708",
  failed: "#d92d20",
};

export function ReportsActivity() {
  const query = useQuery({
    queryKey: ["reports-activity"],
    queryFn: () => listReports({ limit: 100 }),
    staleTime: 60_000,
  });

  const items = query.data?.data.items ?? [];
  const ready = items.filter((report) => report.status === "READY").length;
  const pending = items.filter(
    (report) => report.status === "QUEUED" || report.status === "GENERATING",
  ).length;
  const failed = items.filter((report) => report.status === "FAILED").length;

  return (
    <section className="panel reports-activity">
      <div className="panel__header">
        <div>
          <div className="panel__title">Status laporan</div>
          <div className="panel__description">100 laporan terbaru di tenant ini.</div>
        </div>
        <Activity size={16} aria-hidden="true" />
      </div>
      <div className="panel__body">
        {query.isPending ? (
          <SkeletonTable rows={4} />
        ) : (
          <StatusDonut
            data={[
              { label: "Siap", value: ready, color: COLORS.ready },
              { label: "Diproses", value: pending, color: COLORS.pending },
              { label: "Gagal", value: failed, color: COLORS.failed },
            ]}
          />
        )}
      </div>
    </section>
  );
}
