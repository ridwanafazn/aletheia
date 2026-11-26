package httpapi

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/ridwanafazn/aletheia/services/analytics-worker-go/internal/worker"
)

const testDestination = "https://worker.test/internal/v1/qstash/consume"

func signBody(secret string, body []byte, expires time.Time) string {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	payload, _ := json.Marshal(map[string]any{
		"iss": "Upstash",
		"sub": testDestination,
		"exp": expires.Unix(),
		"nbf": time.Now().Add(-time.Minute).Unix(),
		"iat": time.Now().Unix(),
		"jti": "http-test",
	})
	token := header + "." + base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(token))
	return token + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func testServer() *Server {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelError}))
	return New(nil, worker.New(nil, logger, 1), logger, Config{
		SigningKeys:   []string{"secret"},
		PublicURL:     "https://worker.test",
		AllowUnsigned: false,
	})
}

func TestConsumeRejectsUnsignedRequest(t *testing.T) {
	body := []byte(`{"event_type":"UNKNOWN","tenant_id":"tenant"}`)
	request := httptest.NewRequest(http.MethodPost, "/internal/v1/qstash/consume", bytes.NewReader(body))
	response := httptest.NewRecorder()
	testServer().Handler().ServeHTTP(response, request)
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", response.Code)
	}
}

func TestConsumeAcceptsSignedRequest(t *testing.T) {
	body := []byte(`{"event_type":"UNKNOWN","tenant_id":"tenant","event_id":"e1"}`)
	request := httptest.NewRequest(http.MethodPost, "/internal/v1/qstash/consume", bytes.NewReader(body))
	request.Header.Set("Upstash-Signature", signBody("secret", body, time.Now().Add(time.Minute)))
	response := httptest.NewRecorder()
	testServer().Handler().ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), "ignored") {
		t.Fatalf("unexpected body %s", response.Body.String())
	}
}

func TestConsumeRejectsExpiredOrTamperedSignature(t *testing.T) {
	body := []byte(`{"event_type":"UNKNOWN","tenant_id":"tenant"}`)
	expired := signBody("secret", body, time.Now().Add(-time.Minute))
	request := httptest.NewRequest(http.MethodPost, "/internal/v1/qstash/consume", bytes.NewReader(body))
	request.Header.Set("Upstash-Signature", expired)
	response := httptest.NewRecorder()
	testServer().Handler().ServeHTTP(response, request)
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for expired, got %d", response.Code)
	}

	wrongKey := signBody("other", body, time.Now().Add(time.Minute))
	request = httptest.NewRequest(http.MethodPost, "/internal/v1/qstash/consume", bytes.NewReader(body))
	request.Header.Set("Upstash-Signature", wrongKey)
	response = httptest.NewRecorder()
	testServer().Handler().ServeHTTP(response, request)
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for wrong key, got %d", response.Code)
	}
}

func TestConsumeRejectsOversizedBody(t *testing.T) {
	server := testServer()
	server.config.MaxBodyBytes = 8
	body := []byte(`{"event_type":"UNKNOWN","tenant_id":"tenant"}`)
	request := httptest.NewRequest(http.MethodPost, "/internal/v1/qstash/consume", bytes.NewReader(body))
	request.Header.Set("Upstash-Signature", signBody("secret", body, time.Now().Add(time.Minute)))
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected 413, got %d", response.Code)
	}
}

func TestConsumeRejectsMalformedJSON(t *testing.T) {
	body := []byte(`not-json`)
	request := httptest.NewRequest(http.MethodPost, "/internal/v1/qstash/consume", bytes.NewReader(body))
	request.Header.Set("Upstash-Signature", signBody("secret", body, time.Now().Add(time.Minute)))
	response := httptest.NewRecorder()
	testServer().Handler().ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", response.Code)
	}
}

func TestConsumeRejectsWrongMethod(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/internal/v1/qstash/consume", nil)
	response := httptest.NewRecorder()
	testServer().Handler().ServeHTTP(response, request)
	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", response.Code)
	}
}

func TestHealthEndpoints(t *testing.T) {
	for _, path := range []string{"/healthz"} {
		request := httptest.NewRequest(http.MethodGet, path, nil)
		response := httptest.NewRecorder()
		testServer().Handler().ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("%s expected 200, got %d", path, response.Code)
		}
		if !strings.Contains(response.Body.String(), "analytics-worker-go") {
			t.Fatalf("%s unexpected body %s", path, response.Body.String())
		}
	}
}

func TestReadyzWithoutDatabaseIsDegraded(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	response := httptest.NewRecorder()
	testServer().Handler().ServeHTTP(response, request)
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d: %s", response.Code, response.Body.String())
	}
}
