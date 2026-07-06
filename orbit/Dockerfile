# syntax=docker/dockerfile:1

FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite inlines `VITE_*` at build time (.env.production por defecto).
# Solo exportar cuando el ARG viene definido; un ENV vacío pisa .env.production y rompe Google login.
ARG VITE_API_URL
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_ALLOW_LOCAL_EMAIL_LOGIN
ARG VITE_IMPORT_API_URL
RUN set -e; \
  if [ -n "$VITE_API_URL" ]; then export VITE_API_URL="$VITE_API_URL"; fi; \
  if [ -n "$VITE_GOOGLE_CLIENT_ID" ]; then export VITE_GOOGLE_CLIENT_ID="$VITE_GOOGLE_CLIENT_ID"; fi; \
  if [ -n "$VITE_ALLOW_LOCAL_EMAIL_LOGIN" ]; then export VITE_ALLOW_LOCAL_EMAIL_LOGIN="$VITE_ALLOW_LOCAL_EMAIL_LOGIN"; fi; \
  if [ -n "$VITE_IMPORT_API_URL" ]; then export VITE_IMPORT_API_URL="$VITE_IMPORT_API_URL"; fi; \
  npm run build

FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
