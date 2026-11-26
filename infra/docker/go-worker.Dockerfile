# syntax=docker/dockerfile:1.7

FROM golang:1.26.11-alpine AS build
WORKDIR /src
COPY services/analytics-worker-go/go.mod services/analytics-worker-go/go.sum ./
RUN go mod download
COPY services/analytics-worker-go/ ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /out/worker ./cmd/worker

FROM gcr.io/distroless/static-debian12:nonroot
ENV GOMEMLIMIT=128MiB
COPY --from=build /out/worker /app/worker
USER nonroot:nonroot
EXPOSE 4004
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD ["/app/worker", "--healthcheck"]
ENTRYPOINT ["/app/worker"]
