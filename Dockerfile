# One image = the whole product: the web app (PWA) is built, then served by the FastAPI backend.

# ---- 1. build the web app -------------------------------------------------------
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/yarn.lock frontend/.npmrc ./
RUN yarn install --frozen-lockfile --non-interactive
COPY frontend/ ./
RUN npx expo export -p web

# ---- 2. API + static hosting ----------------------------------------------------
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 WEB_DIST=/app/web
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=web /web/dist /app/web
EXPOSE 8000
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
