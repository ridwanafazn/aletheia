package worker

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/go-pdf/fpdf"
	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"

	"github.com/ridwanafazn/aletheia/services/analytics-worker-go/internal/payroll"
)

type payslipSource struct {
	BatchID         string
	BatchCode       string
	PeriodMonth     time.Time
	BatchStatus     string
	PolicyVersionID string
	PolicyTag       string
	TenantName      string
	BranchName      string
}

type payslipItemRow struct {
	PersonnelID      string
	PersonnelCode    string
	FullName         string
	NIKMasked        string
	BankCode         string
	BankMasked       string
	PTKPStatus       string
	ItemID           string
	GrossIncome      string
	UnpaidDeduction  string
	AbsenceDeduction string
	PPH21            string
	Net              string
	YTDGross         string
	YTDTax           string
	BreakdownJSON    string
}

func (w *Worker) handlePayslipGenerate(ctx context.Context, event Event) (map[string]any, error) {
	var existing int
	if err := w.pool.QueryRow(
		ctx,
		`select count(*) from payroll.payslips where tenant_id = $1 and source_event_id = $2`,
		event.TenantID,
		event.EventID,
	).Scan(&existing); err != nil {
		return nil, err
	}
	if existing > 0 {
		return map[string]any{"batch_id": event.BatchID, "skipped": true}, nil
	}

	var source payslipSource
	if err := w.pool.QueryRow(
		ctx,
		`select b.id::text, b.batch_code, b.period_month, b.status,
		        b.policy_version_id::text, pv.version_tag, t.name, br.name
		   from payroll.batches b
		   join governance.tenants t on t.id = b.tenant_id
		   join governance.branches br on br.id = b.branch_id
		   join governance.policy_versions pv on pv.id = b.policy_version_id
		  where b.tenant_id = $1 and b.id = $2`,
		event.TenantID,
		event.BatchID,
	).Scan(
		&source.BatchID, &source.BatchCode, &source.PeriodMonth, &source.BatchStatus,
		&source.PolicyVersionID, &source.PolicyTag, &source.TenantName, &source.BranchName,
	); err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("batch payroll tidak ditemukan")
		}
		return nil, err
	}
	if source.BatchStatus != "APPROVED" && source.BatchStatus != "DISBURSED" && source.BatchStatus != "PARTIAL" {
		return nil, fmt.Errorf("payslip hanya untuk batch APPROVED atau DISBURSED")
	}

	rows, err := w.pool.Query(
		ctx,
		`select p.id::text, p.personnel_code, p.full_name, p.nik_masked, p.bank_code,
		        p.bank_account_masked, p.ptkp_status, i.id::text, i.gross_income::text,
		        i.unpaid_leave_deduction::text, i.absence_deduction::text,
		        i.pph21_tax_deduction::text, i.net_take_home_pay::text,
		        i.ytd_gross::text, i.ytd_tax::text, i.calculation_breakdown::text
		   from payroll.items i
		   join payroll.personnel p on p.id = i.personnel_id and p.tenant_id = i.tenant_id
		  where i.tenant_id = $1 and i.batch_id = $2
		  order by p.personnel_code`,
		event.TenantID,
		event.BatchID,
	)
	if err != nil {
		return nil, err
	}
	var items []payslipItemRow
	for rows.Next() {
		var row payslipItemRow
		if err := rows.Scan(
			&row.PersonnelID, &row.PersonnelCode, &row.FullName, &row.NIKMasked, &row.BankCode,
			&row.BankMasked, &row.PTKPStatus, &row.ItemID, &row.GrossIncome,
			&row.UnpaidDeduction, &row.AbsenceDeduction, &row.PPH21, &row.Net,
			&row.YTDGross, &row.YTDTax, &row.BreakdownJSON,
		); err != nil {
			rows.Close()
			return nil, err
		}
		items = append(items, row)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, fmt.Errorf("batch belum memiliki item")
	}

	tx, err := w.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `select pg_advisory_xact_lock(hashtextextended($1, 0))`, event.EventID); err != nil {
		return nil, err
	}
	if err := tx.QueryRow(
		ctx,
		`select count(*) from payroll.payslips where tenant_id = $1 and source_event_id = $2`,
		event.TenantID,
		event.EventID,
	).Scan(&existing); err != nil {
		return nil, err
	}
	if existing > 0 {
		return map[string]any{"batch_id": event.BatchID, "skipped": true}, nil
	}

	generated := 0
	for _, item := range items {
		var breakdown payroll.Breakdown
		if err := json.Unmarshal([]byte(item.BreakdownJSON), &breakdown); err != nil {
			return nil, fmt.Errorf("breakdown %s tidak valid: %w", item.PersonnelCode, err)
		}
		var nextVersion int
		var supersedes sql.NullString
		if err := tx.QueryRow(
			ctx,
			`select coalesce(max(version), 0) + 1,
			        (array_agg(id::text order by version desc))[1]
			   from payroll.payslips
			  where tenant_id = $1 and batch_id = $2 and personnel_id = $3`,
			event.TenantID,
			event.BatchID,
			item.PersonnelID,
		).Scan(&nextVersion, &supersedes); err != nil {
			return nil, err
		}
		var supersedesID *string
		if supersedes.Valid {
			supersedesID = &supersedes.String
		}

		snapshot := map[string]any{
			"batch_code":         source.BatchCode,
			"period_month":       source.PeriodMonth.Format("2006-01-02"),
			"personnel_code":     item.PersonnelCode,
			"gross_income":       item.GrossIncome,
			"pph21":              item.PPH21,
			"net":                item.Net,
			"ptkp_status":        item.PTKPStatus,
			"policy_version_tag": source.PolicyTag,
			"breakdown":          json.RawMessage(item.BreakdownJSON),
		}
		snapshotJSON, err := json.Marshal(snapshot)
		if err != nil {
			return nil, err
		}
		snapshotHash := sha256Hex(snapshotJSON)
		verificationCode, err := randomCode(10)
		if err != nil {
			return nil, err
		}
		payslipID := newUUID()

		pdfBytes, err := renderPayslipPDF(payslipPDFInput{
			TenantName:       source.TenantName,
			BranchName:       source.BranchName,
			BatchCode:        source.BatchCode,
			PeriodMonth:      source.PeriodMonth,
			PolicyTag:        source.PolicyTag,
			EmployeeName:     item.FullName,
			PersonnelCode:    item.PersonnelCode,
			NIKMasked:        item.NIKMasked,
			BankCode:         item.BankCode,
			BankMasked:       item.BankMasked,
			PTKPStatus:       item.PTKPStatus,
			Breakdown:        breakdown,
			GrossIncome:      item.GrossIncome,
			UnpaidDeduction:  item.UnpaidDeduction,
			AbsenceDeduction: item.AbsenceDeduction,
			PPH21:            item.PPH21,
			Net:              item.Net,
			YTDGross:         item.YTDGross,
			YTDTax:           item.YTDTax,
			VerificationCode: verificationCode,
			SnapshotHash:     snapshotHash,
		})
		if err != nil {
			return nil, err
		}
		fileChecksum := sha256Hex(pdfBytes)
		secureURL := fmt.Sprintf("/api/v1/payslips/%s/download", payslipID)

		if _, err := tx.Exec(
			ctx,
			`insert into payroll.payslips
			   (id, tenant_id, batch_id, personnel_id, period_month, version, secure_url,
			    snapshot_hash_sha256, file_checksum_sha256, gross_income, net_take_home_pay,
			    verification_code, published_at, supersedes_id, source_event_id)
			 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),$13,$14)`,
			payslipID,
			event.TenantID,
			event.BatchID,
			item.PersonnelID,
			source.PeriodMonth,
			nextVersion,
			secureURL,
			snapshotHash,
			fileChecksum,
			item.GrossIncome,
			item.Net,
			verificationCode,
			supersedesID,
			event.EventID,
		); err != nil {
			return nil, err
		}
		fileName := fmt.Sprintf("payslip-%s-%s-v%d.pdf", source.BatchCode, item.PersonnelCode, nextVersion)
		if _, err := tx.Exec(
			ctx,
			`insert into payroll.generated_files
			   (id, tenant_id, kind, entity_id, file_name, mime_type, file_size, content, checksum_sha256)
			 values (gen_random_uuid(),$1,'PAYSLIP',$2,$3,'application/pdf',$4,$5,$6)`,
			event.TenantID,
			payslipID,
			fileName,
			len(pdfBytes),
			pdfBytes,
			fileChecksum,
		); err != nil {
			return nil, err
		}
		generated++
	}

	if err := w.appendAuditWithEvent(
		ctx,
		tx,
		event.TenantID,
		event.CorrelationID,
		"PAYROLL",
		"PAYROLL_BATCH",
		event.BatchID,
		"PAYSLIP_GENERATED",
		source.PolicyVersionID,
		map[string]any{
			"batch_code":         source.BatchCode,
			"payslip_count":      generated,
			"policy_version_tag": source.PolicyTag,
		},
		event.EventID,
	); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return map[string]any{"batch_id": event.BatchID, "payslip_count": generated, "status": "READY"}, nil
}

type payslipPDFInput struct {
	TenantName       string
	BranchName       string
	BatchCode        string
	PeriodMonth      time.Time
	PolicyTag        string
	EmployeeName     string
	PersonnelCode    string
	NIKMasked        string
	BankCode         string
	BankMasked       string
	PTKPStatus       string
	Breakdown        payroll.Breakdown
	GrossIncome      string
	UnpaidDeduction  string
	AbsenceDeduction string
	PPH21            string
	Net              string
	YTDGross         string
	YTDTax           string
	VerificationCode string
	SnapshotHash     string
}

func renderPayslipPDF(input payslipPDFInput) ([]byte, error) {
	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(15, 14, 15)
	pdf.SetAutoPageBreak(true, 14)
	pdf.AddPage()
	pdf.SetFont("Helvetica", "B", 16)
	pdf.CellFormat(0, 8, "ALETHEIA", "", 1, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 9)
	pdf.SetTextColor(90, 100, 115)
	pdf.CellFormat(0, 5, "Slip gaji resmi internal. Bukan bukti pembayaran bank.", "", 1, "L", false, 0, "")
	pdf.SetTextColor(15, 23, 42)
	pdf.Ln(3)

	pdf.SetFont("Helvetica", "B", 13)
	pdf.CellFormat(0, 7, "SLIP GAJI", "", 1, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 9)
	pdf.CellFormat(0, 5, fmt.Sprintf("%s - %s", input.TenantName, input.BranchName), "", 1, "L", false, 0, "")
	pdf.CellFormat(0, 5, fmt.Sprintf("Periode %s | Batch %s | Kebijakan %s",
		monthName(input.PeriodMonth), input.BatchCode, input.PolicyTag), "", 1, "L", false, 0, "")
	pdf.Ln(3)

	pdf.SetFont("Helvetica", "B", 9)
	pdf.CellFormat(35, 6, "Nama", "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 9)
	pdf.CellFormat(70, 6, input.EmployeeName, "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "B", 9)
	pdf.CellFormat(30, 6, "Kode", "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 9)
	pdf.CellFormat(0, 6, input.PersonnelCode, "", 1, "L", false, 0, "")
	pdf.SetFont("Helvetica", "B", 9)
	pdf.CellFormat(35, 6, "PTKP", "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 9)
	pdf.CellFormat(70, 6, input.PTKPStatus, "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "B", 9)
	pdf.CellFormat(30, 6, "Rekening", "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 9)
	pdf.CellFormat(0, 6, fmt.Sprintf("%s %s", input.BankCode, input.BankMasked), "", 1, "L", false, 0, "")
	pdf.SetFont("Helvetica", "B", 9)
	pdf.CellFormat(35, 6, "NIK masked", "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 9)
	pdf.CellFormat(0, 6, input.NIKMasked, "", 1, "L", false, 0, "")
	pdf.Ln(3)

	line := func(label string, value string, bold bool) {
		style := ""
		if bold {
			style = "B"
		}
		pdf.SetFont("Helvetica", style, 9)
		pdf.CellFormat(105, 6, label, "B", 0, "L", false, 0, "")
		pdf.CellFormat(0, 6, value, "B", 1, "R", false, 0, "")
	}
	section := func(title string) {
		pdf.SetFont("Helvetica", "B", 10)
		pdf.CellFormat(0, 7, title, "", 1, "L", false, 0, "")
	}
	section("Komponen bruto")
	line("Gaji pokok", idr(input.Breakdown.GrossComponents.BaseSalary), false)
	line("Tunjangan tetap", idr(input.Breakdown.GrossComponents.FixedAllowance), false)
	line("Tunjangan variabel", idr(input.Breakdown.GrossComponents.VariableAllowance), false)
	line("Lembur", idr(input.Breakdown.GrossComponents.OvertimePay), false)
	line("Komisi agen", idr(input.Breakdown.GrossComponents.AgentCommission), false)
	line("Potongan cuti tidak dibayar", "-"+idr(input.UnpaidDeduction), false)
	line("Potongan absensi", "-"+idr(input.AbsenceDeduction), false)
	line("Bruto", idr(input.GrossIncome), true)

	section("Potongan karyawan")
	line("BPJS Kesehatan", idr(input.Breakdown.DeductionComponents.BPJSKesehatan), false)
	line("BPJS JHT", idr(input.Breakdown.DeductionComponents.BPJSJHT), false)
	line("BPJS JP", idr(input.Breakdown.DeductionComponents.BPJSJP), false)
	line("PPh 21", idr(input.Breakdown.DeductionComponents.PPH21Tax), false)

	section("Kontribusi pemberi kerja")
	line("BPJS Kesehatan", idr(input.Breakdown.EmployerComponents.BPJSKesehatan), false)
	line("BPJS JHT", idr(input.Breakdown.EmployerComponents.BPJSJHT), false)
	line("BPJS JP", idr(input.Breakdown.EmployerComponents.BPJSJP), false)
	line("BPJS JKK", idr(input.Breakdown.EmployerComponents.BPJSJKK), false)
	line("BPJS JKM", idr(input.Breakdown.EmployerComponents.BPJSJKM), false)
	pdf.Ln(2)

	pdf.SetFont("Helvetica", "B", 12)
	pdf.CellFormat(105, 9, "Net diterima", "B", 0, "L", false, 0, "")
	pdf.CellFormat(0, 9, idr(input.Net), "B", 1, "R", false, 0, "")
	pdf.SetFont("Helvetica", "", 8)
	pdf.SetTextColor(90, 100, 115)
	pdf.CellFormat(0, 5, fmt.Sprintf("YTD bruto %s | YTD PPh 21 %s", idr(input.YTDGross), idr(input.YTDTax)), "", 1, "L", false, 0, "")
	pdf.Ln(3)

	pdf.SetTextColor(15, 23, 42)
	pdf.SetFont("Helvetica", "B", 8)
	pdf.CellFormat(35, 5, "Kode verifikasi", "", 0, "L", false, 0, "")
	pdf.SetFont("Courier", "B", 10)
	pdf.CellFormat(0, 5, input.VerificationCode, "", 1, "L", false, 0, "")
	pdf.SetFont("Helvetica", "B", 8)
	pdf.CellFormat(35, 5, "Snapshot hash", "", 0, "L", false, 0, "")
	pdf.SetFont("Courier", "", 7)
	pdf.CellFormat(0, 5, input.SnapshotHash, "", 1, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 8)
	pdf.SetTextColor(90, 100, 115)
	pdf.MultiCell(0, 4, "Dokumen dihasilkan dari calculation_breakdown pada batch terikat. Periksa checksum dan kode verifikasi melalui sistem Aletheia.", "", "L", false)

	var buffer bytes.Buffer
	if err := pdf.Output(&buffer); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func idr(value string) string {
	number := mustDecimal(value)
	sign := ""
	if number.IsNegative() {
		sign = "-"
		number = number.Abs()
	}
	text := number.StringFixed(0)
	var builder strings.Builder
	for index, character := range text {
		if index > 0 && (len(text)-index)%3 == 0 {
			builder.WriteByte('.')
		}
		builder.WriteRune(character)
	}
	return "Rp " + sign + builder.String()
}

func monthName(value time.Time) string {
	months := []string{"Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"}
	return fmt.Sprintf("%s %d", months[value.Month()-1], value.Year())
}

func sha256Hex(value []byte) string {
	sum := sha256.Sum256(value)
	return hex.EncodeToString(sum[:])
}

func randomCode(length int) (string, error) {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	buffer := make([]byte, length)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	for index := range buffer {
		buffer[index] = alphabet[int(buffer[index])%len(alphabet)]
	}
	return string(buffer), nil
}

type reportSource struct {
	ID              string
	ReportType      string
	BranchID        *string
	PolicyVersionID string
	PolicyTag       string
	PeriodStart     time.Time
	PeriodEnd       time.Time
	Status          string
	Version         int
}

type reportRow struct {
	PersonnelID      string
	PersonnelCode    string
	FullName         string
	NIKMasked        string
	PTKPStatus       string
	BankCode         string
	BankMasked       string
	Gross            string
	BPJSKesehatan    string
	BPJSJHT          string
	BPJSJP           string
	BPJSKesehatanER  string
	BPJSJHTEr        string
	BPJSJPEr         string
	BPJSJKKEr        string
	BPJSJKMEr        string
	PPH21            string
	Net              string
	TaxableIncome    string
	AnnualGross      string
	AnnualTax        string
	AnnualDifference string
	AnnualStatus     string
}

func (w *Worker) handleReportGenerate(ctx context.Context, event Event) (map[string]any, error) {
	var source reportSource
	var branchID sql.NullString
	if err := w.pool.QueryRow(
		ctx,
		`select r.id::text, r.report_type, r.branch_id::text, r.policy_version_id::text,
		        pv.version_tag, r.period_start, r.period_end, r.status, r.version
		   from payroll.tax_reports r
		   join governance.policy_versions pv on pv.id = r.policy_version_id
		  where r.tenant_id = $1 and r.id = $2`,
		event.TenantID,
		event.ReportID,
	).Scan(
		&source.ID, &source.ReportType, &branchID, &source.PolicyVersionID,
		&source.PolicyTag, &source.PeriodStart, &source.PeriodEnd, &source.Status, &source.Version,
	); err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("laporan tidak ditemukan")
		}
		return nil, err
	}
	if branchID.Valid {
		source.BranchID = &branchID.String
	}
	if source.Status == "READY" {
		return map[string]any{"report_id": source.ID, "skipped": true, "status": "READY"}, nil
	}

	rows, err := w.pool.Query(
		ctx,
		`select p.id::text, p.personnel_code, p.full_name, p.nik_masked, p.ptkp_status,
		        p.bank_code, p.bank_account_masked,
		        i.gross_income::text, i.bpjs_kesehatan_deduction::text,
		        i.bpjs_jht_deduction::text, i.bpjs_jp_deduction::text,
		        i.bpjs_kesehatan_employer::text, i.bpjs_jht_employer::text,
		        i.bpjs_jp_employer::text, i.bpjs_jkk_employer::text,
		        i.bpjs_jkm_employer::text, i.pph21_tax_deduction::text,
		        i.net_take_home_pay::text, i.taxable_income::text
		   from payroll.items i
		   join payroll.batches b on b.id = i.batch_id and b.tenant_id = i.tenant_id
		   join payroll.personnel p on p.id = i.personnel_id and p.tenant_id = i.tenant_id
		  where i.tenant_id = $1
		    and b.status in ('APPROVED','DISBURSING','DISBURSED','PARTIAL')
		    and b.period_start <= $3::date
		    and b.period_end >= $2::date
		    and (nullif($4, '') is null or b.branch_id = nullif($4, '')::uuid)
		  order by p.personnel_code, i.id`,
		event.TenantID,
		source.PeriodStart,
		source.PeriodEnd,
		branchValue(source.BranchID),
	)
	if err != nil {
		return nil, err
	}
	var data []reportRow
	for rows.Next() {
		var row reportRow
		if err := rows.Scan(
			&row.PersonnelID, &row.PersonnelCode, &row.FullName, &row.NIKMasked, &row.PTKPStatus,
			&row.BankCode, &row.BankMasked, &row.Gross, &row.BPJSKesehatan, &row.BPJSJHT,
			&row.BPJSJP, &row.BPJSKesehatanER, &row.BPJSJHTEr, &row.BPJSJPEr, &row.BPJSJKKEr,
			&row.BPJSJKMEr, &row.PPH21, &row.Net, &row.TaxableIncome,
		); err != nil {
			rows.Close()
			return nil, err
		}
		data = append(data, row)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(data) == 0 {
		return nil, fmt.Errorf("tidak ada item payroll pada periode laporan")
	}

	if source.ReportType == "PPH21_ANNUAL" {
		if err := w.enrichAnnualReport(ctx, event.TenantID, source, data); err != nil {
			return nil, err
		}
	}

	var fileBytes []byte
	var fileName string
	switch source.ReportType {
	case "PPH21_MONTHLY":
		fileBytes, err = buildPPh21Report(source, data)
		fileName = fmt.Sprintf("pph21-%s-v%d.csv", source.PeriodStart.Format("2006-01"), source.Version)
	case "PPH21_ANNUAL":
		fileBytes, err = buildAnnualReport(source, data)
		fileName = fmt.Sprintf("pph21-annual-%d-v%d.csv", source.PeriodStart.Year(), source.Version)
	case "BPJS_MONTHLY":
		fileBytes, err = buildBPJSReport(source, data)
		fileName = fmt.Sprintf("bpjs-%s-v%d.csv", source.PeriodStart.Format("2006-01"), source.Version)
	case "BANK_FILE":
		fileBytes, err = buildBankFile(source, data)
		fileName = fmt.Sprintf("bank-file-%s-v%d.csv", source.PeriodStart.Format("2006-01"), source.Version)
	case "PAYROLL_VARIANCE":
		fileBytes, err = w.buildVarianceReport(ctx, event.TenantID, source, data)
		fileName = fmt.Sprintf("payroll-variance-%s-v%d.csv", source.PeriodStart.Format("2006-01"), source.Version)
	default:
		return nil, fmt.Errorf("report_type %s tidak didukung", source.ReportType)
	}
	if err != nil {
		return nil, err
	}
	fileChecksum := sha256Hex(fileBytes)
	snapshotHash := reportSnapshotHash(source, data)
	totals := reportTotals(data)
	fileURL := fmt.Sprintf("/api/v1/reports/%s/download", source.ID)

	tx, err := w.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(
		ctx,
		`update payroll.tax_reports
		    set status = 'READY', file_url = $3, snapshot_hash_sha256 = $4,
		        file_checksum_sha256 = $5, total_gross = $6, total_employee_bpjs = $7,
		        total_employer_bpjs = $8, total_pph21 = $9, total_net = $10,
		        headcount = $11, generated_at = now(), error_message = null,
		        source_event_id = $12
		  where tenant_id = $1 and id = $2`,
		event.TenantID,
		source.ID,
		fileURL,
		snapshotHash,
		fileChecksum,
		totals["gross"],
		totals["employee_bpjs"],
		totals["employer_bpjs"],
		totals["pph21"],
		totals["net"],
		len(data),
		event.EventID,
	); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(
		ctx,
		`insert into payroll.generated_files
		   (id, tenant_id, kind, entity_id, file_name, mime_type, file_size, content, checksum_sha256)
		 values (gen_random_uuid(),$1,'REPORT',$2,$3,'text/csv',$4,$5,$6)`,
		event.TenantID,
		source.ID,
		fileName,
		len(fileBytes),
		fileBytes,
		fileChecksum,
	); err != nil {
		return nil, err
	}
	if err := w.appendAuditWithEvent(
		ctx,
		tx,
		event.TenantID,
		event.CorrelationID,
		"PAYROLL",
		"TAX_REPORT",
		source.ID,
		"REPORT_GENERATED",
		source.PolicyVersionID,
		map[string]any{
			"report_type": source.ReportType,
			"version":     source.Version,
			"headcount":   len(data),
			"checksum":    fileChecksum,
		},
		event.EventID,
	); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return map[string]any{
		"report_id":     source.ID,
		"report_type":   source.ReportType,
		"status":        "READY",
		"headcount":     len(data),
		"checksum":      fileChecksum,
		"snapshot_hash": snapshotHash,
	}, nil
}

func branchValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func (w *Worker) enrichAnnualReport(ctx context.Context, tenantID string, source reportSource, data []reportRow) error {
	rows, err := w.pool.Query(
		ctx,
		`select i.personnel_id::text, coalesce(sum(i.gross_income),0)::text,
		        coalesce(sum(i.pph21_tax_deduction),0)::text
		   from payroll.items i
		   join payroll.batches b on b.id = i.batch_id and b.tenant_id = i.tenant_id
		  where i.tenant_id = $1 and b.period_month >= $2::date and b.period_month < $3::date
		    and b.status in ('APPROVED','DISBURSING','DISBURSED','PARTIAL')
		  group by i.personnel_id`,
		tenantID,
		fmt.Sprintf("%d-01-01", source.PeriodStart.Year()),
		fmt.Sprintf("%d-01-01", source.PeriodStart.Year()+1),
	)
	if err != nil {
		return err
	}
	annualGross := map[string]string{}
	credits := map[string]string{}
	for rows.Next() {
		var id, gross, tax string
		if err := rows.Scan(&id, &gross, &tax); err != nil {
			rows.Close()
			return err
		}
		annualGross[id] = gross
		credits[id] = tax
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	reconciliations := map[string][3]string{}
	reconRows, err := w.pool.Query(
		ctx,
		`select personnel_id::text, annual_tax::text, difference::text, status
		   from payroll.tax_reconciliations
		  where tenant_id = $1 and tax_year = $2
		  order by personnel_id, version desc`,
		tenantID,
		source.PeriodStart.Year(),
	)
	if err != nil {
		return err
	}
	for reconRows.Next() {
		var id, tax, difference, status string
		if err := reconRows.Scan(&id, &tax, &difference, &status); err != nil {
			reconRows.Close()
			return err
		}
		if _, exists := reconciliations[id]; !exists {
			reconciliations[id] = [3]string{tax, difference, status}
		}
	}
	reconRows.Close()
	if err := reconRows.Err(); err != nil {
		return err
	}
	for index := range data {
		data[index].AnnualGross = annualGross[data[index].PersonnelID]
		if data[index].AnnualGross == "" {
			data[index].AnnualGross = "0.00"
		}
		data[index].AnnualTax = credits[data[index].PersonnelID]
		if value, ok := reconciliations[data[index].PersonnelID]; ok {
			data[index].AnnualTax = value[0]
			data[index].AnnualDifference = value[1]
			data[index].AnnualStatus = value[2]
		}
	}
	return nil
}

func reportSnapshotHash(source reportSource, data []reportRow) string {
	payload, _ := json.Marshal(map[string]any{
		"report_type":  source.ReportType,
		"period_start": source.PeriodStart.Format("2006-01-02"),
		"period_end":   source.PeriodEnd.Format("2006-01-02"),
		"branch_id":    branchValue(source.BranchID),
		"policy":       source.PolicyTag,
		"rows":         data,
	})
	return sha256Hex(payload)
}

func reportTotals(data []reportRow) map[string]string {
	gross, employee, employer, tax, net := decimal.Zero, decimal.Zero, decimal.Zero, decimal.Zero, decimal.Zero
	for _, row := range data {
		gross = gross.Add(mustDecimal(row.Gross))
		employee = employee.Add(mustDecimal(row.BPJSKesehatan)).Add(mustDecimal(row.BPJSJHT)).Add(mustDecimal(row.BPJSJP))
		employer = employer.Add(mustDecimal(row.BPJSKesehatanER)).Add(mustDecimal(row.BPJSJHTEr)).Add(mustDecimal(row.BPJSJPEr)).Add(mustDecimal(row.BPJSJKKEr)).Add(mustDecimal(row.BPJSJKMEr))
		tax = tax.Add(mustDecimal(row.PPH21))
		net = net.Add(mustDecimal(row.Net))
	}
	return map[string]string{
		"gross":         gross.StringFixed(2),
		"employee_bpjs": employee.StringFixed(2),
		"employer_bpjs": employer.StringFixed(2),
		"pph21":         tax.StringFixed(2),
		"net":           net.StringFixed(2),
	}
}

func newCSV() (*bytes.Buffer, *csv.Writer) {
	buffer := &bytes.Buffer{}
	buffer.WriteString("\xEF\xBB\xBF")
	return buffer, csv.NewWriter(buffer)
}

func writeMetadata(writer *csv.Writer, source reportSource) {
	_ = writer.Write([]string{"# report_type", source.ReportType})
	_ = writer.Write([]string{"# period_start", source.PeriodStart.Format("2006-01-02")})
	_ = writer.Write([]string{"# period_end", source.PeriodEnd.Format("2006-01-02")})
	_ = writer.Write([]string{"# policy", source.PolicyTag})
	_ = writer.Write([]string{"# version", fmt.Sprintf("%d", source.Version)})
	_ = writer.Write([]string{"# generated_by", "analytics-worker-go"})
	_ = writer.Write([]string{"# currency", "IDR"})
}

func buildPPh21Report(source reportSource, data []reportRow) ([]byte, error) {
	buffer, writer := newCSV()
	writeMetadata(writer, source)
	_ = writer.Write([]string{"personnel_code", "name", "nik_masked", "ptkp", "gross", "taxable_income", "pph21", "net"})
	for _, row := range data {
		_ = writer.Write([]string{row.PersonnelCode, row.FullName, row.NIKMasked, row.PTKPStatus, row.Gross, row.TaxableIncome, row.PPH21, row.Net})
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func buildAnnualReport(source reportSource, data []reportRow) ([]byte, error) {
	buffer, writer := newCSV()
	writeMetadata(writer, source)
	_ = writer.Write([]string{"personnel_code", "name", "ptkp", "annual_gross", "annual_tax", "difference", "status"})
	for _, row := range data {
		_ = writer.Write([]string{row.PersonnelCode, row.FullName, row.PTKPStatus, row.AnnualGross, row.AnnualTax, row.AnnualDifference, row.AnnualStatus})
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func buildBPJSReport(source reportSource, data []reportRow) ([]byte, error) {
	buffer, writer := newCSV()
	writeMetadata(writer, source)
	_ = writer.Write([]string{"personnel_code", "name", "bpjs_kesehatan_employee", "bpjs_jht_employee", "bpjs_jp_employee", "bpjs_kesehatan_employer", "bpjs_jht_employer", "bpjs_jp_employer", "bpjs_jkk_employer", "bpjs_jkm_employer"})
	for _, row := range data {
		_ = writer.Write([]string{row.PersonnelCode, row.FullName, row.BPJSKesehatan, row.BPJSJHT, row.BPJSJP, row.BPJSKesehatanER, row.BPJSJHTEr, row.BPJSJPEr, row.BPJSJKKEr, row.BPJSJKMEr})
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func buildBankFile(source reportSource, data []reportRow) ([]byte, error) {
	buffer, writer := newCSV()
	writeMetadata(writer, source)
	_ = writer.Write([]string{"beneficiary_code", "beneficiary_name", "bank_code", "bank_account_masked", "amount", "reference"})
	for _, row := range data {
		_ = writer.Write([]string{row.PersonnelCode, row.FullName, row.BankCode, row.BankMasked, row.Net, source.ID})
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func (w *Worker) buildVarianceReport(ctx context.Context, tenantID string, source reportSource, data []reportRow) ([]byte, error) {
	previousRows, err := w.pool.Query(
		ctx,
		`select i.personnel_id::text, i.net_take_home_pay::text
		   from payroll.items i
		   join payroll.batches b on b.id = i.batch_id and b.tenant_id = i.tenant_id
		  where i.tenant_id = $1 and b.status in ('DISBURSED','PARTIAL')
		    and b.period_end < $2::date
		    and (nullif($3, '') is null or b.branch_id = nullif($3, '')::uuid)
		    and b.id = (
		      select b2.id from payroll.batches b2
		       where b2.tenant_id = $1 and b2.period_end < $2::date
		         and (nullif($3, '') is null or b2.branch_id = nullif($3, '')::uuid)
		         and b2.status in ('DISBURSED','PARTIAL')
		       order by b2.period_end desc limit 1
		    )`,
		tenantID,
		source.PeriodStart,
		branchValue(source.BranchID),
	)
	if err != nil {
		return nil, err
	}
	previous := map[string]string{}
	for previousRows.Next() {
		var id, net string
		if err := previousRows.Scan(&id, &net); err != nil {
			previousRows.Close()
			return nil, err
		}
		previous[id] = net
	}
	previousRows.Close()
	if err := previousRows.Err(); err != nil {
		return nil, err
	}
	buffer, writer := newCSV()
	writeMetadata(writer, source)
	_ = writer.Write([]string{"personnel_code", "name", "current_net", "previous_net", "delta", "reason"})
	for _, row := range data {
		current := mustDecimal(row.Net)
		before := mustDecimal(previous[row.PersonnelID])
		delta := current.Sub(before)
		reason := "Tidak ada batch pembanding"
		if _, ok := previous[row.PersonnelID]; ok {
			reason = "Perubahan komponen payroll"
		}
		_ = writer.Write([]string{row.PersonnelCode, row.FullName, row.Net, before.StringFixed(2), delta.StringFixed(2), reason})
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func newUUID() string {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		panic(err)
	}
	buffer[6] = (buffer[6] & 0x0f) | 0x40
	buffer[8] = (buffer[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", buffer[0:4], buffer[4:6], buffer[6:8], buffer[8:10], buffer[10:16])
}
