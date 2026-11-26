package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/ridwanafazn/aletheia/services/analytics-worker-go/internal/httpapi"
	"github.com/ridwanafazn/aletheia/services/analytics-worker-go/internal/telemetry"
	"github.com/ridwanafazn/aletheia/services/analytics-worker-go/internal/worker"
)

const serviceName = "analytics-worker-go"

func main() {
	port := envPort()

	if len(os.Args) > 1 && os.Args[1] == "--healthcheck" {
		if err := healthcheck(port); err != nil {
			slog.Error("healthcheck failed", "error", err)
			os.Exit(1)
		}
		os.Exit(0)
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	providers, err := telemetry.Init(context.Background(), serviceName)
	if err != nil {
		logger.Error("telemetry gagal diinisialisasi", "error", err)
		os.Exit(1)
	}
	defer func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := providers.Shutdown(shutdownCtx); err != nil {
			logger.Warn("telemetry shutdown gagal", "error", err)
		}
	}()

	databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if databaseURL == "" {
		logger.Error("DATABASE_URL wajib diisi")
		os.Exit(1)
	}

	poolConfig, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		logger.Error("DATABASE_URL tidak valid", "error", err)
		os.Exit(1)
	}
	if poolConfig.MaxConns < 4 {
		poolConfig.MaxConns = 4
	}
	pool, err := pgxpool.NewWithConfig(context.Background(), poolConfig)
	if err != nil {
		logger.Error("pool database gagal dibuat", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	pingCtx, cancelPing := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancelPing()
	if err := pool.Ping(pingCtx); err != nil {
		logger.Error("database tidak dapat dijangkau", "error", err)
		os.Exit(1)
	}

	signingKeys := []string{
		strings.TrimSpace(os.Getenv("QSTASH_CURRENT_SIGNING_KEY")),
		strings.TrimSpace(os.Getenv("QSTASH_NEXT_SIGNING_KEY")),
	}
	allowUnsigned := strings.EqualFold(os.Getenv("ALLOW_UNSIGNED_EVENTS"), "true")
	if len(nonEmpty(signingKeys)) == 0 && !allowUnsigned {
		logger.Error("QSTASH_CURRENT_SIGNING_KEY wajib diisi kecuali ALLOW_UNSIGNED_EVENTS=true")
		os.Exit(1)
	}

	analyticsWorker := worker.New(pool, logger, envInt("WORKER_CONCURRENCY", 8))
	server := &http.Server{
		Addr: fmt.Sprintf(":%d", port),
		Handler: telemetry.HTTPMetrics(httpapi.New(pool, analyticsWorker, logger, httpapi.Config{
			SigningKeys:   signingKeys,
			PublicURL:     strings.TrimSpace(os.Getenv("WORKER_PUBLIC_URL")),
			AllowUnsigned: allowUnsigned,
		}).Handler()),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		logger.Info("worker listening", "port", port, "service", serviceName)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("worker failed", "error", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	logger.Info("worker shutting down", "service", serviceName)

	shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancelShutdown()

	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("graceful shutdown failed", "error", err)
		os.Exit(1)
	}
}

func envPort() int {
	value := os.Getenv("PORT")
	if value == "" {
		return 4004
	}

	port, err := strconv.Atoi(value)
	if err != nil || port < 1 || port > 65535 {
		return 4004
	}

	return port
}

func envInt(name string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 1 {
		return fallback
	}
	return parsed
}

func nonEmpty(values []string) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		if value != "" {
			result = append(result, value)
		}
	}
	return result
}

func healthcheck(port int) error {
	client := &http.Client{Timeout: 2 * time.Second}
	response, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/healthz", port))
	if err != nil {
		return err
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected status %d", response.StatusCode)
	}

	return nil
}
