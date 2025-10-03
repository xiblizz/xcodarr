# Build stage: use Bun for installs and build
FROM oven/bun:1 AS builder
WORKDIR /app

# Only copy package.json for dependency install caching
COPY package.json ./

# Install dependencies with Bun (produces node_modules compatible with Node)
RUN bun install

# Copy the rest of the source
COPY . .

# Build the application with Bun
RUN bun run build


# Runtime stage: slim Node with ffmpeg
FROM oven/bun:1 AS runtime

RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built app and node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

# Create directories for data and media
RUN mkdir -p /data /media

EXPOSE 3000

ENV NODE_ENV=production
ENV MEDIA_DIR=/media

CMD ["bun", "./build/index.js"]