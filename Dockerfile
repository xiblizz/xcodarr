FROM node:18-slim

# Install FFmpeg and other required packages
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Create directories for data and media
RUN mkdir -p /data /media

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV MEDIA_DIR=/media

# Start the application
CMD ["npm", "start"]