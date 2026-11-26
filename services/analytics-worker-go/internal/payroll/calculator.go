package payroll

import (
	"fmt"
	"time"

	"github.com/shopspring/decimal"

	"github.com/ridwanafazn/aletheia/services/analytics-worker-go/internal/policy"
)

var (
	zero = decimal.Zero
	one  = decimal.NewFromInt(1)
)

type Personnel struct {
	ID              string
	Code            string
	Type            string
	PTKPStatus      string
	RiskClass       string
	BaseSalary      decimal.Decimal
	FixedAllowance  decimal.Decimal
	JoinDate        *time.Time
	TerminationDate *time.Time
}

type Attendance struct {
	WorkingDays     int
	PresentDays     int
	PaidLeaveDays   int
	UnpaidLeaveDays int
	AbsentDays      int
	OvertimeHours   decimal.Decimal
}

type Input struct {
	Personnel        Personnel
	Attendance       *Attendance
	VerifiedSales    decimal.Decimal
	HasVerifiedSales bool
	PeriodStart      time.Time
	PeriodEnd        time.Time
	YTDGross         decimal.Decimal
	YTDTax           decimal.Decimal
}

type GrossComponents struct {
	BaseSalary        string `json:"base_salary"`
	FixedAllowance    string `json:"fixed_allowance"`
	VariableAllowance string `json:"variable_allowance"`
	OvertimePay       string `json:"overtime_pay"`
	AgentCommission   string `json:"agent_commission"`
}

type DeductionComponents struct {
	BPJSKesehatan string `json:"bpjs_kesehatan"`
	BPJSJHT       string `json:"bpjs_jht"`
	BPJSJP        string `json:"bpjs_jp"`
	PPH21Tax      string `json:"pph21_tax"`
}

type EmployerComponents struct {
	BPJSKesehatan string `json:"bpjs_kesehatan"`
	BPJSJHT       string `json:"bpjs_jht"`
	BPJSJP        string `json:"bpjs_jp"`
	BPJSJKK       string `json:"bpjs_jkk"`
	BPJSJKM       string `json:"bpjs_jkm"`
}

type Breakdown struct {
	PolicyVersionTag    string              `json:"policy_version_tag"`
	PTKPStatus          string              `json:"ptkp_status"`
	TERCategory         string              `json:"ter_category"`
	AppliedTERRate      string              `json:"applied_ter_rate"`
	TERBase             string              `json:"ter_base"`
	GrossComponents     GrossComponents     `json:"gross_components"`
	DeductionComponents DeductionComponents `json:"deduction_components"`
	EmployerComponents  EmployerComponents  `json:"employer_components"`
	NetTakeHomePay      string              `json:"net_take_home_pay"`
	RoundingAdjustment  string              `json:"rounding_adjustment"`
}

type Result struct {
	GrossIncome                  decimal.Decimal
	VariableAllowance            decimal.Decimal
	OvertimePay                  decimal.Decimal
	AgentCommission              decimal.Decimal
	UnpaidLeaveDeduction         decimal.Decimal
	AbsenceDeduction             decimal.Decimal
	BPJSKesehatanDeduction       decimal.Decimal
	BPJSJHTDeduction             decimal.Decimal
	BPJSJPDeduction              decimal.Decimal
	BPJSKetenagakerjaanDeduction decimal.Decimal
	BPJSKesehatanEmployer        decimal.Decimal
	BPJSJHTEmployer              decimal.Decimal
	BPJSJPEmployer               decimal.Decimal
	BPJSJKKEmployer              decimal.Decimal
	BPJSJKMEmployer              decimal.Decimal
	PPH21TaxDeduction            decimal.Decimal
	NetTakeHomePay               decimal.Decimal
	TaxableIncome                decimal.Decimal
	YTDGross                     decimal.Decimal
	YTDTax                       decimal.Decimal
	Breakdown                    Breakdown
	Warnings                     []string
}

func Round2(value decimal.Decimal) decimal.Decimal {
	return value.Round(2)
}

func Calculate(input Input, rules *policy.Policy, policyVersionTag string) (Result, error) {
	if err := rules.Validate(); err != nil {
		return Result{}, err
	}
	if input.Personnel.Type != "EMPLOYEE" && input.Personnel.Type != "SALES_AGENT" {
		return Result{}, fmt.Errorf("tipe personel %s tidak dikenal", input.Personnel.Type)
	}
	if input.PeriodEnd.Before(input.PeriodStart) {
		return Result{}, fmt.Errorf("periode batch tidak valid")
	}

	baseSalary := input.Personnel.BaseSalary
	fixedAllowance := input.Personnel.FixedAllowance
	totalDays := int(input.PeriodEnd.Sub(input.PeriodStart).Hours()/24) + 1
	if totalDays < 1 {
		totalDays = 1
	}

	// Proration memakai hari kerja terjadwal pada rentang aktif, bukan present_days,
	// karena cuti tidak dibayar dan absensi sudah dipotong terpisah di bawah.
	midPeriod := input.Personnel.JoinDate != nil && input.Personnel.JoinDate.After(input.PeriodStart) ||
		input.Personnel.TerminationDate != nil && input.Personnel.TerminationDate.Before(input.PeriodEnd)
	if midPeriod {
		start := input.PeriodStart
		if input.Personnel.JoinDate != nil && input.Personnel.JoinDate.After(start) {
			start = *input.Personnel.JoinDate
		}
		end := input.PeriodEnd
		if input.Personnel.TerminationDate != nil && input.Personnel.TerminationDate.Before(end) {
			end = *input.Personnel.TerminationDate
		}
		if end.Before(start) {
			return Result{}, fmt.Errorf("tanggal aktif personel %s berada di luar periode", input.Personnel.Code)
		}
		factor := decimal.Zero
		switch rules.Attendance.ProrationBasis {
		case "working_days":
			active := workingDaysBetween(start, end)
			total := workingDaysBetween(input.PeriodStart, input.PeriodEnd)
			if total > 0 {
				factor = decimal.NewFromInt(int64(active)).Div(decimal.NewFromInt(int64(total)))
			}
		case "calendar_days":
			activeDays := int(end.Sub(start).Hours()/24) + 1
			factor = decimal.NewFromInt(int64(activeDays)).Div(decimal.NewFromInt(int64(totalDays)))
		default:
			return Result{}, fmt.Errorf("proration_basis %s tidak dikenal", rules.Attendance.ProrationBasis)
		}
		baseSalary = Round2(baseSalary.Mul(factor))
		if rules.ProrateFixedAllowance {
			fixedAllowance = Round2(fixedAllowance.Mul(factor))
		}
	}

	workingDays := 0
	presentDays := 0
	unpaidLeaveDays := 0
	absentDays := 0
	overtimeHours := zero
	warnings := make([]string, 0)
	if input.Attendance != nil {
		workingDays = input.Attendance.WorkingDays
		presentDays = input.Attendance.PresentDays
		unpaidLeaveDays = input.Attendance.UnpaidLeaveDays
		absentDays = input.Attendance.AbsentDays
		overtimeHours = input.Attendance.OvertimeHours
	} else if input.Personnel.Type == "EMPLOYEE" {
		return Result{}, fmt.Errorf("MISSING_ATTENDANCE: absensi %s tidak ditemukan", input.Personnel.Code)
	}
	_ = presentDays

	dailyRate := zero
	hourlyRate := zero
	if workingDays > 0 {
		vars := map[string]decimal.Decimal{
			"base_salary":   baseSalary,
			"working_days":  decimal.NewFromInt(int64(workingDays)),
			"days_in_month": decimal.NewFromInt(int64(totalDays)),
		}
		value, err := EvalBasis(rules.Attendance.DailyRateBasis, vars)
		if err != nil {
			return Result{}, fmt.Errorf("daily_rate_basis: %w", err)
		}
		dailyRate = Round2(value)
		value, err = EvalBasis(rules.Attendance.HourlyRateBasis, vars)
		if err != nil {
			return Result{}, fmt.Errorf("hourly_rate_basis: %w", err)
		}
		hourlyRate = Round2(value)
	}

	unpaidDeduction := Round2(dailyRate.Mul(decimal.NewFromInt(int64(unpaidLeaveDays))))
	absenceDeduction := Round2(dailyRate.Mul(decimal.NewFromInt(int64(absentDays))))

	if overtimeHours.GreaterThan(rules.Attendance.MaxOvertimeHoursPerMonth) {
		warnings = append(warnings, "OVERTIME_CAPPED")
		overtimeHours = rules.Attendance.MaxOvertimeHoursPerMonth
	}
	overtimePay := zero
	if overtimeHours.GreaterThan(zero) && hourlyRate.GreaterThan(zero) {
		firstHour := decimal.Min(overtimeHours, one)
		remaining := overtimeHours.Sub(firstHour)
		overtimePay = hourlyRate.Mul(
			firstHour.Mul(rules.Attendance.OvertimeFirstHourMultiplier).Add(
				remaining.Mul(rules.Attendance.OvertimeSubsequentMultiplier),
			),
		)
		overtimePay = Round2(overtimePay)
	}

	commission := zero
	if input.Personnel.Type == "SALES_AGENT" && input.HasVerifiedSales {
		value, err := CalculateCommission(input.VerifiedSales, rules)
		if err != nil {
			return Result{}, err
		}
		commission = value
	}

	variableAllowance := zero
	gross := Round2(
		baseSalary.Add(fixedAllowance).Add(variableAllowance).Add(overtimePay).Add(commission).
			Sub(unpaidDeduction).Sub(absenceDeduction),
	)
	if gross.IsNegative() {
		return Result{}, fmt.Errorf("gross negatif untuk personel %s", input.Personnel.Code)
	}

	componentValues := map[string]decimal.Decimal{
		"base_salary":        baseSalary,
		"fixed_allowance":    fixedAllowance,
		"variable_allowance": variableAllowance,
		"overtime_pay":       overtimePay,
		"agent_commission":   commission,
	}
	bpjsWageBase, err := sumComponents(rules.BPJSParameters.BPJSWageBaseComponents, componentValues)
	if err != nil {
		return Result{}, err
	}
	bpjsApplicable := input.Personnel.Type == "EMPLOYEE" || rules.BPJSParameters.AgentBPJSApplicable
	if !bpjsApplicable {
		bpjsWageBase = zero
	}

	kesEmployee, jhtEmployee, jpEmployee := zero, zero, zero
	kesEmployer, jhtEmployer, jpEmployer, jkkEmployer, jkmEmployer := zero, zero, zero, zero, zero
	if bpjsApplicable {
		kesBase := decimal.Min(bpjsWageBase, rules.BPJSParameters.KesehatanSalaryCap)
		kesEmployee = Round2(kesBase.Mul(rules.BPJSParameters.KesehatanEmployeeRate))
		jhtBase := bpjsWageBase
		if rules.BPJSParameters.JHTSalaryCap != nil {
			jhtBase = decimal.Min(bpjsWageBase, *rules.BPJSParameters.JHTSalaryCap)
		}
		jhtEmployee = Round2(jhtBase.Mul(rules.BPJSParameters.JHTEmployeeRate))
		jpBase := decimal.Min(bpjsWageBase, rules.BPJSParameters.JPSalaryCap)
		jpEmployee = Round2(jpBase.Mul(rules.BPJSParameters.JPEmployeeRate))

		kesEmployer = Round2(kesBase.Mul(rules.BPJSEmployerRates.KesehatanEmployerRate))
		jhtEmployer = Round2(jhtBase.Mul(rules.BPJSEmployerRates.JHTEmployerRate))
		jpEmployer = Round2(jpBase.Mul(rules.BPJSEmployerRates.JPEmployerRate))
		jkkRate, ok := rules.BPJSEmployerRates.JKKRateByRiskClass[input.Personnel.RiskClass]
		if !ok {
			return Result{}, fmt.Errorf("risk_class %s tidak memiliki rate JKK", input.Personnel.RiskClass)
		}
		jkkEmployer = Round2(bpjsWageBase.Mul(jkkRate))
		jkmEmployer = Round2(bpjsWageBase.Mul(rules.BPJSEmployerRates.JKMRate))
	}
	bpjsKetenagakerjaan := jhtEmployee.Add(jpEmployee)

	terBaseRaw, err := sumComponents(rules.TerBaseComponents, componentValues)
	if err != nil {
		return Result{}, err
	}
	excluded, err := sumComponents(rules.TerBaseExclusions, componentValues)
	if err != nil {
		return Result{}, err
	}
	terBase := Round2(terBaseRaw.Sub(excluded))
	category, err := rules.TerCategory(input.Personnel.PTKPStatus)
	if err != nil {
		return Result{}, err
	}
	bracket, err := rules.TerBracket(category, terBase)
	if err != nil {
		return Result{}, err
	}
	pph21 := Round2(terBase.Mul(bracket.Rate))

	net := Round2(gross.Sub(kesEmployee).Sub(bpjsKetenagakerjaan).Sub(pph21))
	roundingAdjustment := zero
	if net.IsNegative() {
		switch rules.NegativeNetPolicy {
		case "CARRY_FORWARD":
			roundingAdjustment = net
			warnings = append(warnings, "NEGATIVE_NET_CARRY_FORWARD")
			net = zero
		default:
			return Result{}, fmt.Errorf("net negatif untuk personel %s", input.Personnel.Code)
		}
	}

	breakdown := Breakdown{
		PolicyVersionTag: policyVersionTag,
		PTKPStatus:       input.Personnel.PTKPStatus,
		TERCategory:      category,
		AppliedTERRate:   bracket.Rate.StringFixed(4),
		TERBase:          terBase.StringFixed(2),
		GrossComponents: GrossComponents{
			BaseSalary:        baseSalary.StringFixed(2),
			FixedAllowance:    fixedAllowance.StringFixed(2),
			VariableAllowance: variableAllowance.StringFixed(2),
			OvertimePay:       overtimePay.StringFixed(2),
			AgentCommission:   commission.StringFixed(2),
		},
		DeductionComponents: DeductionComponents{
			BPJSKesehatan: kesEmployee.StringFixed(2),
			BPJSJHT:       jhtEmployee.StringFixed(2),
			BPJSJP:        jpEmployee.StringFixed(2),
			PPH21Tax:      pph21.StringFixed(2),
		},
		EmployerComponents: EmployerComponents{
			BPJSKesehatan: kesEmployer.StringFixed(2),
			BPJSJHT:       jhtEmployer.StringFixed(2),
			BPJSJP:        jpEmployer.StringFixed(2),
			BPJSJKK:       jkkEmployer.StringFixed(2),
			BPJSJKM:       jkmEmployer.StringFixed(2),
		},
		NetTakeHomePay:     net.StringFixed(2),
		RoundingAdjustment: roundingAdjustment.StringFixed(2),
	}

	return Result{
		GrossIncome:                  gross,
		VariableAllowance:            variableAllowance,
		OvertimePay:                  overtimePay,
		AgentCommission:              commission,
		UnpaidLeaveDeduction:         unpaidDeduction,
		AbsenceDeduction:             absenceDeduction,
		BPJSKesehatanDeduction:       kesEmployee,
		BPJSJHTDeduction:             jhtEmployee,
		BPJSJPDeduction:              jpEmployee,
		BPJSKetenagakerjaanDeduction: bpjsKetenagakerjaan,
		BPJSKesehatanEmployer:        kesEmployer,
		BPJSJHTEmployer:              jhtEmployer,
		BPJSJPEmployer:               jpEmployer,
		BPJSJKKEmployer:              jkkEmployer,
		BPJSJKMEmployer:              jkmEmployer,
		PPH21TaxDeduction:            pph21,
		NetTakeHomePay:               net,
		TaxableIncome:                terBase,
		YTDGross:                     input.YTDGross,
		YTDTax:                       input.YTDTax,
		Breakdown:                    breakdown,
		Warnings:                     warnings,
	}, nil
}

func workingDaysBetween(start time.Time, end time.Time) int {
	count := 0
	for day := start; !day.After(end); day = day.AddDate(0, 0, 1) {
		if day.Weekday() != time.Saturday && day.Weekday() != time.Sunday {
			count++
		}
	}
	return count
}

func sumComponents(names []string, values map[string]decimal.Decimal) (decimal.Decimal, error) {
	total := zero
	for _, name := range names {
		value, ok := values[name]
		if !ok {
			return zero, fmt.Errorf("policy component %s tidak tersedia", name)
		}
		total = total.Add(value)
	}
	return total, nil
}

func CalculateCommission(sales decimal.Decimal, rules *policy.Policy) (decimal.Decimal, error) {
	switch rules.CommissionMode {
	case "FLAT_TIER":
		for _, tier := range rules.AgentCommissionTiers {
			if sales.GreaterThanOrEqual(tier.MinSales) && sales.LessThanOrEqual(tier.MaxSales) {
				return Round2(sales.Mul(tier.CommissionRate)), nil
			}
		}
		return zero, fmt.Errorf("tier komisi tidak mencakup penjualan %s", sales)
	case "MARGINAL":
		total := zero
		lower := zero
		for _, tier := range rules.AgentCommissionTiers {
			if sales.LessThanOrEqual(lower) {
				break
			}
			upper := decimal.Min(sales, tier.MaxSales)
			if upper.GreaterThan(lower) {
				total = total.Add(upper.Sub(lower).Mul(tier.CommissionRate))
			}
			lower = tier.MaxSales
		}
		return Round2(total), nil
	default:
		return zero, fmt.Errorf("commission_mode %s tidak dikenal", rules.CommissionMode)
	}
}

func CalculateAnnualTax(
	annualGross decimal.Decimal,
	ptkp decimal.Decimal,
	deductibleContributions decimal.Decimal,
	rules *policy.Policy,
) (tax decimal.Decimal, biayaJabatan decimal.Decimal, pkp decimal.Decimal, err error) {
	biayaJabatan = Round2(annualGross.Mul(rules.AnnualDeductions.BiayaJabatanRate))
	if biayaJabatan.GreaterThan(rules.AnnualDeductions.BiayaJabatanMax) {
		biayaJabatan = rules.AnnualDeductions.BiayaJabatanMax
	}
	netIncome := annualGross.Sub(biayaJabatan).Sub(deductibleContributions)
	pkp = netIncome.Sub(ptkp)
	if pkp.IsNegative() {
		pkp = zero
	}
	total := zero
	lower := zero
	for _, bracket := range rules.PPH21AnnualBrackets {
		if pkp.LessThanOrEqual(lower) {
			break
		}
		upper := decimal.Min(pkp, bracket.MaxPKP)
		if upper.GreaterThan(lower) {
			total = total.Add(upper.Sub(lower).Mul(bracket.Rate))
		}
		lower = bracket.MaxPKP
	}
	if pkp.GreaterThan(lower) {
		return zero, zero, zero, fmt.Errorf("bracket pajak tahunan tidak mencakup PKP %s", pkp)
	}
	return Round2(total), biayaJabatan, pkp, nil
}
