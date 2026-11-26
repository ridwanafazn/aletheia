package qstash

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"testing"
	"time"
)

func signToken(secret, destination string, now time.Time, expires int64) string {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	payload, _ := json.Marshal(map[string]any{
		"iss": "Upstash",
		"sub": destination,
		"exp": expires,
		"nbf": now.Add(-time.Minute).Unix(),
		"iat": now.Unix(),
		"jti": "test",
	})
	body := header + "." + base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(body))
	return body + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func TestVerifySignature(t *testing.T) {
	now := time.Now()
	destination := "https://worker.test/internal/v1/qstash/consume"
	token := signToken("secret", destination, now, now.Add(time.Minute).Unix())
	if err := Verify(token, destination, []string{"secret"}, now); err != nil {
		t.Fatalf("expected valid signature: %v", err)
	}
	if err := Verify(token, "https://other.test", []string{"secret"}, now); err == nil {
		t.Fatal("expected destination mismatch")
	}
	if err := Verify(token, destination, []string{"wrong"}, now); err == nil {
		t.Fatal("expected key mismatch")
	}
	expired := signToken("secret", destination, now, now.Add(-time.Minute).Unix())
	if err := Verify(expired, destination, []string{"secret"}, now); err == nil {
		t.Fatal("expected expired signature")
	}
	if err := Verify(fmt.Sprintf("%s.tampered", token), destination, []string{"secret"}, now); err == nil {
		t.Fatal("expected malformed signature")
	}
}
