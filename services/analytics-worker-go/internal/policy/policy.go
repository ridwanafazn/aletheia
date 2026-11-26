package policy

import (
	"encoding/json"
	"fmt"

	"github.com/shopspring/decimal"
)

type Policy struct {
	BPJSParameters        BPJSParameters             `json:"bpjs_parameters"`
	PPH21TerMapping       map[string][]string        `json:"pph21_ter_mapping"`
	TerBaseComponents     []string                   `json:"ter_base_components"`
	TerBaseExclusions     []string                   `json:"ter_base_exclusions"`
	PPH21TerBrackets      map[string][]Bracket       `json:"pph21_ter_brackets"`
	PPH21AnnualBrackets   []Bracket                  `json:"pph21_annual_brackets"`
	AgentCommissionTiers  []CommissionTier           `json:"agent_commission_tiers"`
	CommissionMode        string                     `json:"commission_mode"`
	BPJSEmployerRates     BPJSEmployerRates          `json:"bpjs_employer_rates"`
	PTKPAmounts           map[string]decimal.Decimal `json:"ptkp_amounts"`
	AnnualDeductions      AnnualDeductions           `json:"annual_deductions"`
	ReconciliationPeriod  string                     `json:"reconciliation_posting_period"`
	OverpaymentTreatment  string                     `json:"overpayment_treatment"`
	NegativeNetPolicy     string                     `json:"negative_net_policy"`
	TaxRemittanceRounding int                        `json:"tax_remittance_rounding"`
	ProrateFixedAllowance bool                       `json:"prorate_fixed_allowance"`
	Attendance            AttendancePolicy           `json:"attendance"`
}

type BPJSParameters struct {
	KesehatanEmployeeRate  decimal.Decimal  `json:"kesehatan_employee_rate"`
	KesehatanSalaryCap     decimal.Decimal  `json:"kesehatan_salary_cap"`
	JHTEmployeeRate        decimal.Decimal  `json:"jht_employee_rate"`
	JHTSalaryCap           *decimal.Decimal `json:"jht_salary_cap"`
	JPEmployeeRate         decimal.Decimal  `json:"jp_employee_rate"`
	JPSalaryCap            decimal.Decimal  `json:"jp_salary_cap"`
	BPJSWageBaseComponents []string         `json:"bpjs_wage_base_components"`
	AgentBPJSApplicable    bool             `json:"agent_bpjs_applicable"`
}

type BPJSEmployerRates struct {
	KesehatanEmployerRate decimal.Decimal            `json:"kesehatan_employer_rate"`
	JHTEmployerRate       decimal.Decimal            `json:"jht_employer_rate"`
	JPEmployerRate        decimal.Decimal            `json:"jp_employer_rate"`
	JKKRateByRiskClass    map[string]decimal.Decimal `json:"jkk_rate_by_risk_class"`
	JKMRate               decimal.Decimal            `json:"jkm_rate"`
}

type Bracket struct {
	MaxGross decimal.Decimal `json:"max_gross"`
	MaxPKP   decimal.Decimal `json:"max_pkp"`
	Rate     decimal.Decimal `json:"rate"`
}

type CommissionTier struct {
	MinSales       decimal.Decimal `json:"min_sales"`
	MaxSales       decimal.Decimal `json:"max_sales"`
	CommissionRate decimal.Decimal `json:"commission_rate"`
}

type AnnualDeductions struct {
	BiayaJabatanRate     decimal.Decimal `json:"biaya_jabatan_rate"`
	BiayaJabatanMax      decimal.Decimal `json:"biaya_jabatan_max_annual"`
	DeductibleComponents []string        `json:"deductible_employee_contributions"`
}

type AttendancePolicy struct {
	ProrationBasis               string          `json:"proration_basis"`
	DailyRateBasis               string          `json:"daily_rate_basis"`
	HourlyRateBasis              string          `json:"hourly_rate_basis"`
	OvertimeFirstHourMultiplier  decimal.Decimal `json:"overtime_first_hour_multiplier"`
	OvertimeSubsequentMultiplier decimal.Decimal `json:"overtime_subsequent_multiplier"`
	OvertimeRestDayMultiplier    decimal.Decimal `json:"overtime_rest_day_multiplier"`
	MaxOvertimeHoursPerMonth     decimal.Decimal `json:"max_overtime_hours_per_month"`
}

func Parse(raw []byte) (*Policy, error) {
	var result Policy
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("policy payload tidak valid: %w", err)
	}
	if err := result.Validate(); err != nil {
		return nil, err
	}
	return &result, nil
}

func (p *Policy) Validate() error {
	switch {
	case len(p.PPH21TerMapping) == 0:
		return fmt.Errorf("policy key pph21_ter_mapping hilang")
	case len(p.PPH21TerBrackets) == 0:
		return fmt.Errorf("policy key pph21_ter_brackets hilang")
	case len(p.PTKPAmounts) == 0:
		return fmt.Errorf("policy key ptkp_amounts hilang")
	case len(p.BPJSParameters.BPJSWageBaseComponents) == 0:
		return fmt.Errorf("policy key bpjs_wage_base_components hilang")
	case len(p.TerBaseComponents) == 0:
		return fmt.Errorf("policy key ter_base_components hilang")
	case len(p.AgentCommissionTiers) == 0:
		return fmt.Errorf("policy key agent_commission_tiers hilang")
	case p.Attendance.DailyRateBasis == "":
		return fmt.Errorf("policy key attendance.daily_rate_basis hilang")
	case p.Attendance.HourlyRateBasis == "":
		return fmt.Errorf("policy key attendance.hourly_rate_basis hilang")
	}
	return nil
}

func (p *Policy) TerCategory(ptkp string) (string, error) {
	for category, statuses := range p.PPH21TerMapping {
		for _, status := range statuses {
			if status == ptkp {
				return category, nil
			}
		}
	}
	return "", fmt.Errorf("PTKP %s tidak memiliki kategori TER", ptkp)
}

func (p *Policy) TerBracket(category string, base decimal.Decimal) (Bracket, error) {
	brackets, ok := p.PPH21TerBrackets[category]
	if !ok || len(brackets) == 0 {
		return Bracket{}, fmt.Errorf("bracket TER kategori %s tidak ditemukan", category)
	}
	for _, bracket := range brackets {
		if base.LessThanOrEqual(bracket.MaxGross) {
			return bracket, nil
		}
	}
	return Bracket{}, fmt.Errorf("bracket TER kategori %s tidak mencakup nilai %s", category, base)
}
