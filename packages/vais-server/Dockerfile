# =============================================================================
# Stage 1: builder
# Assumes vaisc is installed in the builder image
# =============================================================================
FROM vais-builder:latest AS builder

WORKDIR /build

# Copy all source files needed for compilation
COPY src/ ./src/

# Compile the vais-server binary
RUN vaisc build src/main.vais -o vais-server

# =============================================================================
# Stage 2: runtime
# Slim image — only the compiled binary is copied over
# =============================================================================
FROM debian:bookworm-slim AS runtime

# Install curl for the HEALTHCHECK
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only the compiled binary from the builder stage
COPY --from=builder /build/vais-server ./vais-server

# Make the binary executable
RUN chmod +x ./vais-server

# Environment defaults
ENV PORT=8080
ENV ENV=production

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

CMD ["./vais-server"]
