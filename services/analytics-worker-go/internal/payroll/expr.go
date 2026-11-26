package payroll

import (
	"fmt"
	"strings"
	"unicode"

	"github.com/shopspring/decimal"
)

type expressionParser struct {
	input string
	pos   int
	vars  map[string]decimal.Decimal
}

func EvalBasis(expression string, vars map[string]decimal.Decimal) (decimal.Decimal, error) {
	parser := &expressionParser{input: expression, vars: vars}
	value, err := parser.parseExpression()
	if err != nil {
		return decimal.Zero, err
	}
	parser.skipSpaces()
	if parser.pos != len(parser.input) {
		return decimal.Zero, fmt.Errorf("ekspresi rate tidak valid pada posisi %d", parser.pos)
	}
	return value, nil
}

func (p *expressionParser) skipSpaces() {
	for p.pos < len(p.input) && unicode.IsSpace(rune(p.input[p.pos])) {
		p.pos++
	}
}

func (p *expressionParser) parseExpression() (decimal.Decimal, error) {
	left, err := p.parseTerm()
	if err != nil {
		return decimal.Zero, err
	}
	for {
		p.skipSpaces()
		if p.pos >= len(p.input) {
			return left, nil
		}
		operator := p.input[p.pos]
		if operator != '+' && operator != '-' {
			return left, nil
		}
		p.pos++
		right, err := p.parseTerm()
		if err != nil {
			return decimal.Zero, err
		}
		if operator == '+' {
			left = left.Add(right)
		} else {
			left = left.Sub(right)
		}
	}
}

func (p *expressionParser) parseTerm() (decimal.Decimal, error) {
	left, err := p.parsePrimary()
	if err != nil {
		return decimal.Zero, err
	}
	for {
		p.skipSpaces()
		if p.pos >= len(p.input) {
			return left, nil
		}
		operator := p.input[p.pos]
		if operator != '*' && operator != '/' {
			return left, nil
		}
		p.pos++
		right, err := p.parsePrimary()
		if err != nil {
			return decimal.Zero, err
		}
		if operator == '*' {
			left = left.Mul(right)
			continue
		}
		if right.IsZero() {
			return decimal.Zero, fmt.Errorf("pembagian dengan nol pada ekspresi rate")
		}
		left = left.Div(right)
	}
}

func (p *expressionParser) parsePrimary() (decimal.Decimal, error) {
	p.skipSpaces()
	if p.pos >= len(p.input) {
		return decimal.Zero, fmt.Errorf("ekspresi rate tidak lengkap")
	}
	if p.input[p.pos] == '(' {
		p.pos++
		value, err := p.parseExpression()
		if err != nil {
			return decimal.Zero, err
		}
		p.skipSpaces()
		if p.pos >= len(p.input) || p.input[p.pos] != ')' {
			return decimal.Zero, fmt.Errorf("kurung tutup tidak ditemukan")
		}
		p.pos++
		return value, nil
	}

	start := p.pos
	if p.input[p.pos] >= '0' && p.input[p.pos] <= '9' {
		for p.pos < len(p.input) && (p.input[p.pos] >= '0' && p.input[p.pos] <= '9' || p.input[p.pos] == '.') {
			p.pos++
		}
		value, err := decimal.NewFromString(p.input[start:p.pos])
		if err != nil {
			return decimal.Zero, fmt.Errorf("angka pada ekspresi rate tidak valid: %w", err)
		}
		return value, nil
	}

	for p.pos < len(p.input) && (p.input[p.pos] == '_' || unicode.IsLetter(rune(p.input[p.pos]))) {
		p.pos++
	}
	name := strings.TrimSpace(p.input[start:p.pos])
	if name == "" {
		return decimal.Zero, fmt.Errorf("token ekspresi rate tidak dikenal pada posisi %d", start)
	}
	value, ok := p.vars[name]
	if !ok {
		return decimal.Zero, fmt.Errorf("variabel %s tidak tersedia untuk ekspresi rate", name)
	}
	return value, nil
}
