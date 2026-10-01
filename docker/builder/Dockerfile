# Sandboxed WLED build worker. Runs as a non-root user with no Discord credentials, started
# fresh (docker run --rm) for every single build - see commands/build/lib/dockerRunner.js on the
# orchestrator side for the exact hardening flags (--read-only, --cap-drop=ALL, resource limits,
# isolated network).
FROM node:20-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git \
        ca-certificates \
        python3 \
        python3-venv \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/pio-venv \
    && /opt/pio-venv/bin/pip install --no-cache-dir platformio
ENV PATH="/opt/pio-venv/bin:${PATH}"

# /home/builder/.platformio wird als benanntes Docker-Volume gemountet (persistenter
# Paket-/Toolchain-Cache über Builds hinweg). Ein benanntes Volume wird beim allerersten Mount
# leer und root-owned angelegt - liegt am selben Pfad im Image aber bereits ein Verzeichnis mit
# korrektem Besitzer, kopiert Docker dessen Inhalt (inkl. Rechte) beim ersten Start ins Volume.
# Ohne das hier scheitert PlatformIO beim Start mit HomeDirPermissionsError, weil "builder" nicht
# in das root-owned Volume schreiben kann.
RUN useradd --create-home --home-dir /home/builder --shell /usr/sbin/nologin builder \
    && mkdir -p /home/builder/.platformio \
    && chown -R builder:builder /home/builder

WORKDIR /app
COPY package.json ./
COPY lib ./lib
COPY entrypoint.js ./

# Von dockerRunner.js überschreibbar (Ziel-Repo, Timeouts, Job-Parallelität innerhalb von pio);
# siehe docker/builder/lib/buildJob.js für die vollständige Liste und Defaults.
ENV WLED_REPO_URL="https://github.com/wled/WLED.git" \
    BUILD_WORK_DIR="/tmp/wled" \
    BUILD_INPUT_DIR="/input" \
    BUILD_OUTPUT_DIR="/output"

USER builder

ENTRYPOINT ["node", "entrypoint.js"]
