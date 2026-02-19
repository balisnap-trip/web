FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    git \
    openssh-client \
    libicu72 \
    libssl3 \
    docker.io \
    docker-compose \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /runner

# Install Docker Compose v2 plugin (needed for `docker compose ...`).
# Debian's `docker-compose` package is v1 (python) and can break with newer Docker engines.
RUN mkdir -p /usr/local/lib/docker/cli-plugins \
  && curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose \
  && chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

CMD ["./run.sh"]
