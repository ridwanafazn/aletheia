package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/ridwanafazn/aletheia/services/analytics-worker-go/internal/qstash"
	"github.com/ridwanafazn/aletheia/services/analytics-worker-go/internal/worker"
)

type Config struct {
	SigningKeys       []string
	PublicURL         string
	AllowUnsigned     bool
	MaxBodyBytes      int64
	ProcessingTimeout time.Duration
}

type Server struct {
	worker *worker.Worker
	pool   *pgxpool.Pool
	logger *slog.Logger
	config Config
}

func New(pool *pgxpool.Pool, analyticsWorker *worker.Worker, logger *slog.Logger, config Config) *Server {
	keys := make([]string, 0, len(config.SigningKeys))
	for _, key := range config.SigningKeys {
		if key = strings.TrimSpace(key); key != "" {
			keys = append(keys, key)
		}
	}
	config.SigningKeys = keys
	if config.MaxBodyBytes <= 0 {
		config.MaxBodyBytes = 1 << 20
	}
	if config.ProcessingTimeout <= 0 {
		config.ProcessingTimeout = 55 * time.Second
	}
	return &Server{worker: analyticsWorker, pool: pool, logger: logger, config: config}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "service": "analytics-worker-go"})
	})
	mux.HandleFunc("/readyz", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if s.pool == nil || s.pool.Ping(ctx) != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{
				"status": "degraded", "service": "analytics-worker-go",
			})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "ready", "service": "analytics-worker-go"})
	})
	mux.HandleFunc("/internal/v1/qstash/consume", s.handleConsume)
	return mux
}

func (s *Server) handleConsume(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "method_not_allowed"})
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, s.config.MaxBodyBytes+1))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "body_unreadable"})
		return
	}
	if int64(len(body)) > s.config.MaxBodyBytes {
		writeJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"error": "body_too_large"})
		return
	}

	signature := r.Header.Get("Upstash-Signature")
	if signature == "" {
		signature = r.Header.Get("X-Qstash-Signature")
	}
	if len(s.config.SigningKeys) == 0 {
		if !s.config.AllowUnsigned {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "signature_keys_missing"})
			return
		}
	} else {
		destination := s.config.PublicURL
		if destination == "" {
			scheme := "http"
			if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
				scheme = "https"
			}
			destination = fmt.Sprintf("%s://%s%s", scheme, r.Host, r.URL.Path)
		} else {
			destination = strings.TrimRight(destination, "/") + "/internal/v1/qstash/consume"
		}
		if err := qstash.Verify(signature, destination, s.config.SigningKeys, time.Now()); err != nil {
			s.logger.Warn("qstash signature rejected", "error", err)
			writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "invalid_signature"})
			return
		}
	}

	var event worker.Event
	if err := json.Unmarshal(body, &event); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid_json"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.config.ProcessingTimeout)
	defer cancel()
	result, err := s.worker.Handle(ctx, event)
	if err != nil {
		s.logger.Error("event processing failed", "event_type", event.EventType, "event_id", event.EventID, "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{
			"error":      "event_processing_failed",
			"event_type": event.EventType,
			"event_id":   event.EventID,
		})
		return
	}
	s.logger.Info("event processed", "event_type", event.EventType, "event_id", event.EventID)
	writeJSON(w, http.StatusOK, map[string]any{"received": true, "result": result})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
