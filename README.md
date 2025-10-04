# xcodarr - Media Manager with Smart GPU/CPU FFMPEG Transcoding

A SvelteKit web application that provides a comprehensive media file manager with intelligent GPU/CPU transcoding capabilities using FFmpeg.

## Features

### File Management

-   **Web-based file browser** for mounted media directory
-   **Complete file operations**: rename, cut, copy, paste, delete
-   **Media metadata display**: file size, duration, video codec, resolution (via ffprobe)
-   **Secure path validation** - all operations stay within the mounted media directory

### Smart Transcoding

-   **Intelligent GPU detection**: Automatically detects NVIDIA GPU and uses NVENC when available
-   **Apple VideoToolBox Support**: Detects Apple Silicon in Local Mode and uses VideoToolBox when available
-   **Fallback support**: Falls back to CPU encoding (libx264/libx265) when GPU unavailable
-   **Manual override**: Force GPU or CPU encoding via environment variables or UI
-   **Codec support**: H.264 (x264) and H.265 (x265) encoding
-   **Quality control**: Adjustable CQ/CRF values (18-31)
-   **Output format**: Always outputs MKV with `-map 0`, `-c:a copy`, `-c:s copy`

### Job Management

-   **Concurrent job limiting**: 1 job by default (configurable)
-   **Job queue system**: Automatic queuing of additional jobs
-   **Real-time progress tracking**: Live progress updates in the UI
-   **Job controls**: Stop/kill running jobs, delete completed jobs
-   **Atomic file replacement**: Safe temp file handling with atomic replacement
-   **Optional backups**: Keep original files as backups

### Security & Reliability

-   **Path validation**: All file paths validated to stay within media directory
-   **Command injection prevention**: Uses spawn with argument arrays
-   **No shell execution**: Direct process spawning for security
-   **Error handling**: Comprehensive error handling and logging

## Installation & Usage

### Docker (Recommended)

#### CPU-only version:

```bash
# Clone the repository
git clone https://github.com/xiblizz/transcodarr.git
cd transcodarr

# Create data and media directories
mkdir -p data media

# Run with docker-compose
docker-compose up transcodarr
```

#### GPU-enabled version:

```bash
# Ensure nvidia-docker is installed and configured
# Run GPU-enabled version
docker-compose up transcodarr-gpu
```

### Local Development

```bash
# Clone and install dependencies
git clone https://github.com/xiblizz/transcodarr.git
cd transcodarr
bun install

# Set environment variables
# On Windows (PowerShell):
$env:MEDIA_DIR = 'C:\path\to\your\media'
$env:MAX_CONCURRENT_JOBS = '1'
# On Unix-like shells:
export MEDIA_DIR=/path/to/your/media
export MAX_CONCURRENT_JOBS=1

# Development server
bun run dev

# Production build
bun run build
# Start the production server (script name may vary depending on package.json)
bun run start
```

## Configuration

### Environment Variables

-   `MEDIA_DIR`: Path to the media directory (default: `/media`)
-   `MAX_CONCURRENT_JOBS`: Maximum concurrent encoding jobs (default: `1`)
-   `NODE_ENV`: Environment mode (`development` or `production`)

### Docker Volumes

-   `/data`: Application data (SQLite database, logs)
-   `/media`: Your media files directory

### GPU Support

For GPU transcoding, ensure:

1. NVIDIA GPU with NVENC support
2. NVIDIA Docker runtime installed
3. Use the `transcodarr-gpu` service in docker-compose

## API Endpoints

### File Management

-   `GET /api/files?path=<path>` - List files in directory
-   `POST /api/files/rename` - Rename file/directory
-   `POST /api/files/paste` - Copy/move files
-   `DELETE /api/files/delete` - Delete file/directory

### Encoding

-   `POST /api/encode` - Start encoding jobs
-   `GET /api/gpu-status` - Check GPU availability

### Job Management

-   `GET /api/jobs` - List all jobs
-   `POST /api/jobs/{id}/stop` - Stop specific job
-   `DELETE /api/jobs/{id}` - Delete job record

## UI Components

### File Manager

-   Tree-style file browser
-   Context menu for file operations
-   Multi-select support
-   Real-time metadata display

### Encoding Toolbar

-   Codec selection (H.264/H.265)
-   CQ value slider (18-31)
-   GPU/CPU override options
-   Encoding preview

### Job Manager

-   Real-time job status and progress
-   Job statistics (running, queued, completed, failed)
-   Job control buttons (stop, delete)
-   ETA calculations
-   Space savings display

## Technical Details

### Architecture

-   **Frontend**: SvelteKit with vanilla JavaScript
-   **Backend**: Node.js with SvelteKit API routes
-   **Database**: SQLite3 for job metadata
-   **Media Processing**: FFmpeg with ffprobe

### Security Measures

-   Path traversal protection
-   Command injection prevention
-   Input validation and sanitization
-   Secure file operations

### Performance

-   Atomic file operations
-   Efficient job queuing
-   Real-time progress updates
-   Minimal resource usage

## Development

```bash
# Install dependencies
bun install

# Start development server
bun run dev

# Build for production
bun run build

# Preview production build
bun run preview
```

## Troubleshooting

### GPU Not Detected

1. Verify NVIDIA drivers are installed
2. Check `nvidia-smi` command works
3. Ensure nvidia-docker runtime is configured
4. Use CPU fallback if needed

### File Access Issues

1. Check file permissions on mounted volumes
2. Verify MEDIA_DIR environment variable
3. Ensure paths are within allowed directory

### Encoding Failures

1. Check FFmpeg installation and codecs
2. Verify input file format compatibility
3. Check available disk space
4. Review job error messages

## License

ISC License - See LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For issues and questions:

1. Check the troubleshooting section
2. Review existing GitHub issues
3. Create a new issue with detailed information
