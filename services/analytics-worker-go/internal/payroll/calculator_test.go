package payroll

import (
	"strings"
	"testing"
	"time"

	"github.com/shopspring/decimal"

	"github.com/ridwanafazn/aletheia/services/analytics-worker-go/internal/policy"
)

func d(value string) decimal.Decimal {
	result, err := decimal.NewFromString(value)
	if err != nil {
		panic(err)
	}
	return result
}

func testPolicy() *policy.Policy {
	jhtCap := d("10042300.00")
	return &policy.Policy{
		BPJSParameters: policy.BPJSParameters{
			KesehatanEmployeeRate:  d("0.0100"),
			KesehatanSalaryCap:     d("12000000.00"),
			JHTEmployeeRate:        d("0.0200"),
			JHTSalaryCap:           nil,
			JPEmployeeRate:         d("0.0100"),
			JPSalaryCap:            jhtCap,
			BPJSWageBaseComponents: []string{"base_salary", "fixed_allowance"},
		},
		PPH21TerMapping: map[string][]string{
			"CATEGORY_A": {"TK/0", "TK/1", "K/0"},
			"CATEGORY_B": {"TK/2", "TK/3", "K/1", "K/2"},
			"CATEGORY_C": {"K/3"},
		},
		TerBaseComponents: []string{"base_salary", "fixed_allowance", "variable_allowance", "overtime_pay", "agent_commission"},
		TerBaseExclusions: []string{},
		PPH21TerBrackets: map[string][]policy.Bracket{
			"CATEGORY_A": {{MaxGross: d("10000000.00"), Rate: d("0.0100")}, {MaxGross: d("20000000.00"), Rate: d("0.0200")}, {MaxGross: d("999999999999.00"), Rate: d("0.0500")}},
			"CATEGORY_B": {{MaxGross: d("10000000.00"), Rate: d("0.0100")}, {MaxGross: d("20000000.00"), Rate: d("0.0200")}, {MaxGross: d("999999999999.00"), Rate: d("0.0500")}},
			"CATEGORY_C": {{MaxGross: d("10000000.00"), Rate: d("0.0100")}, {MaxGross: d("20000000.00"), Rate: d("0.0200")}, {MaxGross: d("999999999999.00"), Rate: d("0.0500")}},
		},
		PPH21AnnualBrackets: []policy.Bracket{
			{MaxPKP: d("60000000.00"), Rate: d("0.0500")},
			{MaxPKP: d("250000000.00"), Rate: d("0.1500")},
			{MaxPKP: d("500000000.00"), Rate: d("0.2500")},
			{MaxPKP: d("5000000000.00"), Rate: d("0.3000")},
			{MaxPKP: d("999999999999.00"), Rate: d("0.3500")},
		},
		AgentCommissionTiers: []policy.CommissionTier{
			{MinSales: d("0.00"), MaxSales: d("50000000.00"), CommissionRate: d("0.0250")},
			{MinSales: d("50000000.01"), MaxSales: d("150000000.00"), CommissionRate: d("0.0500")},
			{MinSales: d("150000000.01"), MaxSales: d("999999999999.00"), CommissionRate: d("0.0750")},
		},
		CommissionMode: "FLAT_TIER",
		BPJSEmployerRates: policy.BPJSEmployerRates{
			KesehatanEmployerRate: d("0.0400"),
			JHTEmployerRate:       d("0.0370"),
			JPEmployerRate:        d("0.0200"),
			JKKRateByRiskClass: map[string]decimal.Decimal{
				"I": d("0.0024"), "II": d("0.0054"), "III": d("0.0089"), "IV": d("0.0127"), "V": d("0.0174"),
			},
			JKMRate: d("0.0030"),
		},
		PTKPAmounts: map[string]decimal.Decimal{
			"TK/0": d("54000000.00"), "TK/1": d("58500000.00"), "TK/2": d("63000000.00"), "TK/3": d("67500000.00"),
			"K/0": d("58500000.00"), "K/1": d("63000000.00"), "K/2": d("67500000.00"), "K/3": d("72000000.00"),
		},
		AnnualDeductions: policy.AnnualDeductions{
			BiayaJabatanRate:     d("0.0500"),
			BiayaJabatanMax:      d("6000000.00"),
			DeductibleComponents: []string{"JHT", "JP"},
		},
		NegativeNetPolicy:     "REJECT",
		TaxRemittanceRounding: 0,
		ProrateFixedAllowance: true,
		Attendance: policy.AttendancePolicy{
			ProrationBasis:               "working_days",
			DailyRateBasis:               "base_salary/working_days",
			HourlyRateBasis:              "base_salary/(working_days*8)",
			OvertimeFirstHourMultiplier:  d("1.5000"),
			OvertimeSubsequentMultiplier: d("2.0000"),
			OvertimeRestDayMultiplier:    d("2.0000"),
			MaxOvertimeHoursPerMonth:     d("40.00"),
		},
	}
}

func employeeInput(base string, ptkp string) Input {
	start := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	return Input{
		Personnel: Personnel{
			ID: "p1", Code: "EMP-1", Type: "EMPLOYEE", PTKPStatus: ptkp, RiskClass: "II",
			BaseSalary: d(base), FixedAllowance: d("2000000.00"),
		},
		Attendance:  &Attendance{WorkingDays: 22, PresentDays: 22, OvertimeHours: d("0")},
		PeriodStart: start,
		PeriodEnd:   start.AddDate(0, 0, 29),
		YTDGross:    d("0.00"),
		YTDTax:      d("0.00"),
	}
}

func TestU01BPJSKesehatanCap(t *testing.T) {
	input := employeeInput("18000000.00", "TK/0")
	result, err := Calculate(input, testPolicy(), "v2026.11.test")
	if err != nil {
		t.Fatal(err)
	}
	if !result.BPJSKesehatanDeduction.Equal(d("120000.00")) {
		t.Fatalf("expected 120000.00, got %s", result.BPJSKesehatanDeduction)
	}
}

func TestU02BPJSJPCap(t *testing.T) {
	input := employeeInput("18000000.00", "TK/0")
	result, err := Calculate(input, testPolicy(), "v2026.11.test")
	if err != nil {
		t.Fatal(err)
	}
	if !result.BPJSJPDeduction.Equal(d("100423.00")) {
		t.Fatalf("expected 100423.00, got %s", result.BPJSJPDeduction)
	}
}

func TestU03TERBoundaryUsesCurrentBracket(t *testing.T) {
	input := employeeInput("8000000.00", "TK/0")
	result, err := Calculate(input, testPolicy(), "v2026.11.test")
	if err != nil {
		t.Fatal(err)
	}
	if !result.PPH21TaxDeduction.Equal(d("100000.00")) {
		t.Fatalf("expected 100000.00, got %s", result.PPH21TaxDeduction)
	}
}

func TestU04TERAboveBoundaryUsesNextBracket(t *testing.T) {
	input := employeeInput("8000000.01", "TK/0")
	result, err := Calculate(input, testPolicy(), "v2026.11.test")
	if err != nil {
		t.Fatal(err)
	}
	if !result.PPH21TaxDeduction.Equal(d("200000.00")) {
		t.Fatalf("expected 200000.00, got %s", result.PPH21TaxDeduction)
	}
}

func TestU05PTKPKeCategory(t *testing.T) {
	input := employeeInput("8000000.00", "K/1")
	result, err := Calculate(input, testPolicy(), "v2026.11.test")
	if err != nil {
		t.Fatal(err)
	}
	if result.Breakdown.TERCategory != "CATEGORY_B" {
		t.Fatalf("expected CATEGORY_B, got %s", result.Breakdown.TERCategory)
	}
}

func TestU06CommissionAtTierMax(t *testing.T) {
	value, err := CalculateCommission(d("50000000.00"), testPolicy())
	if err != nil {
		t.Fatal(err)
	}
	if !value.Equal(d("1250000.00")) {
		t.Fatalf("expected 1250000.00, got %s", value)
	}
}

func TestU07CommissionAboveTierMax(t *testing.T) {
	value, err := CalculateCommission(d("50000000.01"), testPolicy())
	if err != nil {
		t.Fatal(err)
	}
	if !value.Equal(d("2500000.00")) {
		t.Fatalf("expected 2500000.00, got %s", value)
	}
}

func TestU08NegativeNetRejected(t *testing.T) {
	rules := testPolicy()
	rules.BPJSParameters.KesehatanEmployeeRate = d("2.0000")
	input := employeeInput("1000000.00", "TK/0")
	if _, err := Calculate(input, rules, "v2026.11.test"); err == nil {
		t.Fatal("expected negative net rejection")
	}
}

func TestU15AnnualTaxWithTERCredits(t *testing.T) {
	rules := testPolicy()
	annualGross := d("120000000.00")
	ptkp := rules.PTKPAmounts["TK/0"]
	deductible := d("3845076.20")
	tax, biaya, pkp, err := CalculateAnnualTax(annualGross, ptkp, deductible, rules)
	if err != nil {
		t.Fatal(err)
	}
	if !biaya.Equal(d("6000000.00")) {
		t.Fatalf("expected biaya jabatan 6000000.00, got %s", biaya)
	}
	if !pkp.Equal(d("56154923.80")) {
		t.Fatalf("expected PKP 56154923.80, got %s", pkp)
	}
	if !tax.Equal(d("2807746.19")) {
		t.Fatalf("expected annual tax 2807746.19, got %s", tax)
	}
	credits := d("2400000.00")
	difference := tax.Sub(credits)
	if !difference.Equal(d("407746.19")) {
		t.Fatalf("expected difference 407746.19, got %s", difference)
	}
}

func TestMissingPolicyKeyFailsClosed(t *testing.T) {
	rules := testPolicy()
	rules.TerBaseComponents = nil
	if _, err := Calculate(employeeInput("8000000.00", "TK/0"), rules, "v2026.11.test"); err == nil ||
		!strings.Contains(err.Error(), "ter_base_components") {
		t.Fatalf("expected missing policy key error, got %v", err)
	}
}

func TestBPJSEmployerSeparateFromNet(t *testing.T) {
	rules := testPolicy()
	input := employeeInput("8000000.00", "TK/0")
	result, err := Calculate(input, rules, "v2026.11.test")
	if err != nil {
		t.Fatal(err)
	}
	if result.BPJSKesehatanEmployer.Equal(decimal.Zero) || result.BPJSJKKEmployer.Equal(decimal.Zero) {
		t.Fatal("expected employer contributions")
	}
	expectedNet := result.GrossIncome.
		Sub(result.BPJSKesehatanDeduction).
		Sub(result.BPJSKetenagakerjaanDeduction).
		Sub(result.PPH21TaxDeduction)
	if !result.NetTakeHomePay.Equal(expectedNet) {
		t.Fatalf("net mismatch: %s vs %s", result.NetTakeHomePay, expectedNet)
	}
}

func Test500ItemsUnder60Seconds(t *testing.T) {
	rules := testPolicy()
	input := employeeInput("8000000.00", "K/1")
	start := time.Now()
	for index := 0; index < 500; index++ {
		if _, err := Calculate(input, rules, "v2026.11.test"); err != nil {
			t.Fatal(err)
		}
	}
	if elapsed := time.Since(start); elapsed > 60*time.Second {
		t.Fatalf("500 items took %s", elapsed)
	}
}

func TestProrationUsesWorkingDaysForMidMonthJoin(t *testing.T) {
	input := employeeInput("8400000.00", "TK/0")
	input.Personnel.FixedAllowance = d("2100000.00")
	join := time.Date(2026, 11, 16, 0, 0, 0, 0, time.UTC)
	input.Personnel.JoinDate = &join
	result, err := Calculate(input, testPolicy(), "v2026.11.test")
	if err != nil {
		t.Fatal(err)
	}
	if !result.GrossIncome.Equal(d("5500000.00")) {
		t.Fatalf("expected gross 5500000.00, got %s", result.GrossIncome)
	}
	if !result.NetTakeHomePay.Equal(d("5225000.00")) {
		t.Fatalf("expected net 5225000.00, got %s", result.NetTakeHomePay)
	}
}

func TestMissingAttendanceFailsClosed(t *testing.T) {
	input := employeeInput("8000000.00", "TK/0")
	input.Attendance = nil
	_, err := Calculate(input, testPolicy(), "v2026.11.test")
	if err == nil || !strings.Contains(err.Error(), "MISSING_ATTENDANCE") {
		t.Fatalf("expected MISSING_ATTENDANCE, got %v", err)
	}
}

func TestUnknownProrationBasisFailsClosed(t *testing.T) {
	rules := testPolicy()
	rules.Attendance.ProrationBasis = "quarterly"
	invoice := employeeInput("8000000.00", "TK/0")
	join := time.Date(2026, 11, 16, 0, 0, 0, 0, time.UTC)
	invoice.Personnel.JoinDate = &join
	if _, err := Calculate(invoice, rules, "v2026.11.test"); err == nil {
		t.Fatal("expected unknown proration basis error")
	}
}
