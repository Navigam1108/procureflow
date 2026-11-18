FROM node:22-bookworm-slim AS web-build
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
ENV NEXT_TELEMETRY_DISABLED=1 \
    STANDALONE_BUILD=true \
    API_URL=http://127.0.0.1:8000
RUN npm run build

FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 appuser
WORKDIR /app
COPY backend/requirements.lock.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY --from=web-build /usr/local/bin/node /usr/local/bin/node
COPY --from=web-build --chown=1000:1000 /build/frontend/.next/standalone /app/frontend
COPY --from=web-build --chown=1000:1000 /build/frontend/.next/static /app/frontend/.next/static
COPY --chown=1000:1000 backend/app /app/backend/app
COPY --chown=1000:1000 deploy/spaces/serve.py /app/deploy/spaces/serve.py
RUN mkdir -p /app/runtime && chown 1000:1000 /app/runtime
ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/backend \
    PROCUREFLOW_ROOT=/app/runtime \
    AGENT_MODE=demo \
    DEMO_AUTH=true \
    SESSION_HTTPS_ONLY=true \
    SESSION_SAME_SITE=none \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=7860
USER appuser
EXPOSE 7860
CMD ["python", "/app/deploy/spaces/serve.py"]
