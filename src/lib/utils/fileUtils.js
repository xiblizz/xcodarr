import fs from 'fs/promises'
import path from 'path'
import { spawn } from 'child_process'

// Allow MEDIA_DIR to be set via environment (loaded from .env when running locally).
// If not set, default to a `media` directory next to project root for local development.
const MEDIA_DIR = process.env.MEDIA_DIR || path.resolve(process.cwd(), 'media')

// Exported for tests and runtime checks
export function getResolvedMediaDir() {
    return MEDIA_DIR
}

// Security: Validate that paths stay within the media directory
export function validatePath(targetPath) {
    // If a relative path is supplied, treat it as relative to MEDIA_DIR
    let resolvedPath
    if (!path.isAbsolute(targetPath)) {
        resolvedPath = path.resolve(MEDIA_DIR, targetPath)
    } else {
        resolvedPath = path.resolve(targetPath)
    }

    const resolvedMediaDir = path.resolve(MEDIA_DIR)
    const legacyMediaDir = path.resolve('/media')

    const isUnder = (dir) => resolvedPath === dir || resolvedPath.startsWith(dir + path.sep)

    // Allow paths under the configured MEDIA_DIR or legacy /media mount so existing
    // absolute paths stored in the DB continue to work when running locally.
    if (!isUnder(resolvedMediaDir) && !isUnder(legacyMediaDir)) {
        throw new Error('Path is outside the allowed media directory')
    }

    return resolvedPath
}

export async function getFileMetadata(filePath) {
    return new Promise((resolve, reject) => {
        const ffprobe = spawn('ffprobe', [
            '-v',
            'quiet',
            '-print_format',
            'json',
            '-show_format',
            '-show_streams',
            filePath,
        ])

        let output = ''

        ffprobe.stdout.on('data', (data) => {
            output += data.toString()
        })

        ffprobe.on('close', (code) => {
            if (code !== 0) {
                resolve(null) // Not a media file
                return
            }

            try {
                const data = JSON.parse(output)
                const videoStream = data.streams?.find((s) => s.codec_type === 'video')

                if (!videoStream) {
                    resolve(null)
                    return
                }

                resolve({
                    duration: parseFloat(data.format?.duration) || null,
                    video_codec: videoStream.codec_name || null,
                    resolution:
                        videoStream.width && videoStream.height ? `${videoStream.width}×${videoStream.height}` : null,
                    bitrate: parseInt(data.format?.bit_rate) || null,
                })
            } catch (error) {
                resolve(null)
            }
        })

        ffprobe.on('error', () => {
            resolve(null)
        })
    })
}

export async function listFiles(dirPath) {
    try {
        let validatedPath = validatePath(dirPath)

        // If the resolved path doesn't exist (common when '/media' was used in Docker
        // but not present locally), and the path points to the legacy '/media', try
        // falling back to the configured MEDIA_DIR if it exists.
        try {
            await fs.access(validatedPath)
        } catch (err) {
            const resolvedMediaDir = path.resolve(MEDIA_DIR)
            const legacyMediaDir = path.resolve('/media')

            if (validatedPath === legacyMediaDir || validatedPath.startsWith(legacyMediaDir + path.sep)) {
                // try to fall back to configured MEDIA_DIR
                try {
                    await fs.access(resolvedMediaDir)
                    validatedPath = resolvedMediaDir
                } catch (e) {
                    // neither legacy nor configured directory exists
                    throw err
                }
            } else {
                // path simply doesn't exist
                throw err
            }
        }

        const entries = await fs.readdir(validatedPath, { withFileTypes: true })

        const files = []

        for (const entry of entries) {
            const fullPath = path.join(validatedPath, entry.name)

            try {
                const stats = await fs.stat(fullPath)
                const isDirectory = entry.isDirectory()

                let metadata = null
                if (!isDirectory) {
                    metadata = await getFileMetadata(fullPath)
                }

                files.push({
                    name: entry.name,
                    path: fullPath,
                    type: isDirectory ? 'directory' : 'file',
                    size: isDirectory ? 0 : stats.size,
                    modified: stats.mtime,
                    metadata,
                })
            } catch (error) {
                // Skip files that can't be accessed
                continue
            }
        }

        // Sort: directories first, then files
        files.sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === 'directory' ? -1 : 1
            }
            return a.name.localeCompare(b.name)
        })

        return files
    } catch (error) {
        throw new Error(`Failed to list files: ${error.message}`)
    }
}

export async function renameFile(oldPath, newName) {
    try {
        const validatedOldPath = validatePath(oldPath)
        const newPath = path.join(path.dirname(validatedOldPath), newName)
        const validatedNewPath = validatePath(newPath)

        await fs.rename(validatedOldPath, validatedNewPath)
        return validatedNewPath
    } catch (error) {
        throw new Error(`Failed to rename file: ${error.message}`)
    }
}

export async function copyFile(sourcePath, targetDir) {
    try {
        const validatedSourcePath = validatePath(sourcePath)
        const fileName = path.basename(validatedSourcePath)
        const targetPath = path.join(targetDir, fileName)
        const validatedTargetPath = validatePath(targetPath)

        await fs.copyFile(validatedSourcePath, validatedTargetPath)
        return validatedTargetPath
    } catch (error) {
        throw new Error(`Failed to copy file: ${error.message}`)
    }
}

export async function moveFile(sourcePath, targetDir) {
    try {
        const validatedSourcePath = validatePath(sourcePath)
        const fileName = path.basename(validatedSourcePath)
        const targetPath = path.join(targetDir, fileName)
        const validatedTargetPath = validatePath(targetPath)

        await fs.rename(validatedSourcePath, validatedTargetPath)
        return validatedTargetPath
    } catch (error) {
        throw new Error(`Failed to move file: ${error.message}`)
    }
}

export async function deleteFile(filePath) {
    try {
        const validatedPath = validatePath(filePath)
        const stats = await fs.stat(validatedPath)

        if (stats.isDirectory()) {
            await fs.rmdir(validatedPath, { recursive: true })
        } else {
            await fs.unlink(validatedPath)
        }
    } catch (error) {
        throw new Error(`Failed to delete file: ${error.message}`)
    }
}

export function getMediaDir() {
    return MEDIA_DIR
}
