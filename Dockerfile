FROM node:20-slim

# Install FFmpeg and other required packages
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package.json (not package-lock.json to avoid version conflicts)
COPY package.json ./

# Install all dependencies fresh
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Remove dev dependencies after build to reduce image size
RUN npm prune --production

# Create directories for data and media
RUN mkdir -p /data /media

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV MEDIA_DIR=/media

# Start the application
CMD ["npm", "start"]