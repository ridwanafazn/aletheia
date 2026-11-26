package qstash

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

type claims struct {
	Issuer    string `json:"iss"`
	Subject   string `json:"sub"`
	Expires   int64  `json:"exp"`
	NotBefore int64  `json:"nbf"`
	IssuedAt  int64  `json:"iat"`
	JTI       string `json:"jti"`
}

func Verify(signature string, destination string, keys []string, now time.Time) error {
	parts := strings.Split(signature, ".")
	if len(parts) != 3 {
		return fmt.Errorf("signature QStash bukan JWT yang valid")
	}
	headerBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return fmt.Errorf("header signature tidak valid: %w", err)
	}
	var header struct {
		Algorithm string `json:"alg"`
	}
	if err := json.Unmarshal(headerBytes, &header); err != nil {
		return fmt.Errorf("header signature tidak dapat dibaca: %w", err)
	}
	if header.Algorithm != "HS256" {
		return fmt.Errorf("algoritma signature QStash tidak didukung: %s", header.Algorithm)
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return fmt.Errorf("payload signature tidak valid: %w", err)
	}
	signatureBytes, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return fmt.Errorf("nilai signature tidak valid: %w", err)
	}

	valid := false
	for _, key := range keys {
		if key == "" {
			continue
		}
		candidate := hmac.New(sha256.New, []byte(key))
		candidate.Write([]byte(parts[0] + "." + parts[1]))
		if hmac.Equal(candidate.Sum(nil), signatureBytes) {
			valid = true
			break
		}
	}
	if !valid {
		return fmt.Errorf("signature QStash tidak cocok")
	}

	var payload claims
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return fmt.Errorf("claims signature tidak dapat dibaca: %w", err)
	}
	if payload.Issuer != "Upstash" {
		return fmt.Errorf("issuer signature tidak valid")
	}
	if destination != "" && strings.TrimRight(payload.Subject, "/") != strings.TrimRight(destination, "/") {
		return fmt.Errorf("subject signature tidak cocok dengan tujuan worker")
	}
	unix := now.Unix()
	if payload.Expires != 0 && unix >= payload.Expires {
		return fmt.Errorf("signature QStash kedaluwarsa")
	}
	if payload.NotBefore != 0 && unix < payload.NotBefore {
		return fmt.Errorf("signature QStash belum berlaku")
	}
	return nil
}
