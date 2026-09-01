# ---- BUILD STAGE ----
FROM node:24-alpine AS build
WORKDIR /app

# Build-time args inlined into the frontend bundle by Vite.
# Passed from docker-compose.yml (sourced from the root .env).
ARG VITE_API_URL=""
ARG VITE_GOOGLE_CLIENT_ID=""

# Copy package files for both root (frontend) and back_end
COPY package*.json ./
RUN npm ci

COPY back_end/package*.json ./back_end/
RUN cd back_end && npm ci --omit=dev

# Copy entire source
COPY . .

# Empty VITE_API_URL enforces relative /api/* paths (single-origin behind Caddy).
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}
ENV NODE_ENV=production

# Build frontend static files to /app/dist
RUN npm run build

# ---- RUNTIME STAGE ----
FROM node:24-alpine
WORKDIR /app

# Copy built frontend assets
COPY --from=build /app/dist ./dist

# Copy backend source and dependencies
COPY --from=build /app/back_end ./back_end

# Writable runtime data dir (JSON-file mock DB) for the unprivileged user
RUN mkdir -p /app/back_end/data && chown -R node:node /app

# Run as the non-root 'node' user (UID 1000)
USER node

# Set environment
ENV NODE_ENV=production
# Hugging Face Spaces listens on port 7860 by default
ENV PORT=7860
EXPOSE 7860

# Run Node.js backend (also serves the built SPA in production)
CMD ["node", "back_end/src/server.js"]
