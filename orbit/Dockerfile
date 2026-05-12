# syntax=docker/dockerfile:1

FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite inlines `VITE_*` at build time. Pass via Cloud Build `--build-arg` (see `gcp/cloudbuild-orbit-frontend.yaml`).
ARG VITE_API_URL
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_ALLOW_LOCAL_EMAIL_LOGIN
ARG VITE_IMPORT_API_URL
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}
ENV VITE_ALLOW_LOCAL_EMAIL_LOGIN=${VITE_ALLOW_LOCAL_EMAIL_LOGIN}
ENV VITE_IMPORT_API_URL=${VITE_IMPORT_API_URL}

RUN npm run build

FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
