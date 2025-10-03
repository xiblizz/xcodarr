import { spawn } from 'child_process'
import fs from 'fs/promises'
import path from 'path'

let gpuInfoCache = null

// Returns an object describing available hardware encoders. This is more useful
// than a boolean so callers can choose between HW encoders (VideoToolbox vs NVENC).
export async function checkGpuAvailability() {
    if (gpuInfoCache !== null) return gpuInfoCache

    // Probe ffmpeg encoders list
    const encodersOut = await new Promise((resolve) => {
        const ff = spawn('ffmpeg', ['-hide_banner', '-v', 'error', '-encoders'])
        let out = ''
        ff.stdout?.on('data', (d) => (out += d.toString()))
        ff.stderr?.on('data', (d) => (out += d.toString()))
        ff.on('close', () => resolve(out))
        ff.on('error', () => resolve(''))
    })

    const hasNvenc = /\b(h264_nvenc|hevc_nvenc)\b/.test(encodersOut)
    // VideoToolbox encoder names in ffmpeg are h264_videotoolbox and hevc_videotoolbox
    const hasVideoToolbox = /\b(h264_videotoolbox|hevc_videotoolbox)\b/.test(encodersOut)

    // On macOS prefer VideoToolbox when available
    const isMac = process.platform === 'darwin'
    let preferred = null
    if (isMac && hasVideoToolbox) preferred = 'videotoolbox'
    else if (hasNvenc) preferred = 'nvenc'

    gpuInfoCache = {
        nvenc: hasNvenc,
        videotoolbox: hasVideoToolbox,
        preferred,
    }

    return gpuInfoCache
}

export function getCodecSettings(codec, hwEncoder, cq) {
    // hwEncoder can be: 'videotoolbox', 'nvenc', or null
    if (hwEncoder === 'videotoolbox') {
        if (codec === 'x264') {
            return {
                videoCodec: 'h264_videotoolbox',
                // videotoolbox typically uses bitrate/quality options differently; keep simple
                codecOptions: ['-qscale', cq.toString()],
            }
        } else {
            return {
                videoCodec: 'hevc_videotoolbox',
                codecOptions: ['-qscale', cq.toString()],
            }
        }
    } else if (hwEncoder === 'nvenc') {
        if (codec === 'x264') {
            return {
                videoCodec: 'h264_nvenc',
                codecOptions: ['-cq', cq.toString(), '-preset', 'medium'],
            }
        } else {
            return {
                videoCodec: 'hevc_nvenc',
                codecOptions: ['-cq', cq.toString(), '-preset', 'medium'],
            }
        }
    } else {
        // Software encoders
        if (codec === 'x264') {
            return {
                videoCodec: 'libx264',
                codecOptions: ['-crf', cq.toString(), '-preset', 'medium'],
            }
        } else {
            return {
                videoCodec: 'libx265',
                codecOptions: ['-crf', cq.toString(), '-preset', 'medium'],
            }
        }
    }
}

export function generateOutputPath(inputPath, codec) {
    const parsed = path.parse(inputPath)
    const suffix = codec === 'x264' ? '_h264' : '_h265'
    return path.join(parsed.dir, `${parsed.name}${suffix}.mkv`)
}

export function createTempPath(outputPath) {
    const parsed = path.parse(outputPath)
    return path.join(parsed.dir, `${parsed.name}.tmp${parsed.ext}`)
}

export function encodeVideo(jobData, onProgress, onComplete) {
    const { inputPath, outputPath, codec, cq, hwEncoder } = jobData

    const tempOutputPath = createTempPath(outputPath)
    const { videoCodec, codecOptions } = getCodecSettings(codec, hwEncoder, cq)

    // Build FFmpeg command
    const ffmpegArgs = [
        '-i',
        inputPath,
        '-map',
        '0',
        '-c:v',
        videoCodec,
        ...codecOptions,
        '-c:a',
        'copy',
        '-c:s',
        'copy',
        '-y', // Overwrite output file
        tempOutputPath,
    ]

    console.log('Starting FFmpeg with args:', ffmpegArgs)

    const ffmpeg = spawn('ffmpeg', ffmpegArgs)

    let totalDuration = null
    let currentTime = 0
    const stderrBuffer = []
    const MAX_LINES = 50

    ffmpeg.stderr.on('data', (data) => {
        const output = data.toString()
        // Keep a rolling buffer of stderr lines for debugging
        output.split(/\r?\n/).forEach((line) => {
            if (!line) return
            stderrBuffer.push(line)
            if (stderrBuffer.length > MAX_LINES) stderrBuffer.shift()
        })

        // Parse duration from FFmpeg output
        const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.\d{2}/)
        if (durationMatch && !totalDuration) {
            const hours = parseInt(durationMatch[1])
            const minutes = parseInt(durationMatch[2])
            const seconds = parseInt(durationMatch[3])
            totalDuration = hours * 3600 + minutes * 60 + seconds
        }

        // Parse current time from FFmpeg output
        const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2})\.\d{2}/)
        if (timeMatch && totalDuration) {
            const hours = parseInt(timeMatch[1])
            const minutes = parseInt(timeMatch[2])
            const seconds = parseInt(timeMatch[3])
            currentTime = hours * 3600 + minutes * 60 + seconds

            const progress = Math.min((currentTime / totalDuration) * 100, 100)
            onProgress(progress)
        }
    })

    ffmpeg.on('close', async (code) => {
        if (code === 0) {
            try {
                // Atomic replacement: move temp file to final location
                await fs.rename(tempOutputPath, outputPath)

                // Get output file size
                const stats = await fs.stat(outputPath)
                onComplete(null, { size: stats.size })
            } catch (error) {
                // Clean up temp file if it exists
                try {
                    await fs.unlink(tempOutputPath)
                } catch {}

                onComplete(new Error(`Failed to finalize output file: ${error.message}`))
            }
        } else {
            // Clean up temp file if it exists
            try {
                await fs.unlink(tempOutputPath)
            } catch {}
            const tail = stderrBuffer.slice(-10).join('\n')
            onComplete(new Error(`FFmpeg exited with code ${code}${tail ? `\n${tail}` : ''}`))
        }
    })

    ffmpeg.on('error', async (error) => {
        // Clean up temp file if it exists
        try {
            await fs.unlink(tempOutputPath)
        } catch {}
        const tail = stderrBuffer.slice(-10).join('\n')
        const err = new Error(`${error.message}${tail ? `\n${tail}` : ''}`)
        onComplete(err)
    })

    return ffmpeg
}
