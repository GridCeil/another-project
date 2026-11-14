FROM node:22-bookworm-slim AS frontend
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY frontend ./frontend
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend ./backend
COPY --from=frontend /build/frontend/dist ./frontend/dist
RUN useradd --create-home unsaid
USER unsaid
EXPOSE 5000
CMD ["sh", "-c", "python -m flask --app backend.server:create_app init-db && waitress-serve --host=0.0.0.0 --port=5000 --call backend.server:create_app"]
