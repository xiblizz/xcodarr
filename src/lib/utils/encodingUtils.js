import { spawn } from 'child_process'
import fs from 'fs/promises'
import path from 'path'

let gpuAvailable = null

export async function checkGpuAvailability() {
    if (gpuAvailable !== null) {
        return gpuAvailable
    }

    // Check for NVIDIA GPU and NVENC availability in ffmpeg
    const hasNvidia = await new Promise((resolve) => {
        const nvidia = spawn('nvidia-smi', ['-L'])
        nvidia.on('close', (code) => resolve(code === 0))
        nvidia.on('error', () => resolve(false))
    })

    if (!hasNvidia) {
        gpuAvailable = false
        return gpuAvailable
    }

    const hasNvenc = await new Promise((resolve) => {
        const ff = spawn('ffmpeg', ['-hide_banner', '-v', 'error', '-encoders'])
        let out = ''
        ff.stdout?.on('data', (d) => (out += d.toString()))
        ff.stderr?.on('data', (d) => (out += d.toString()))
        ff.on('close', () => {
            resolve(/\b(h264_nvenc|hevc_nvenc)\b/.test(out))
        })
        ff.on('error', () => resolve(false))
    })

    gpuAvailable = hasNvenc
    return gpuAvailable
}

export function getCodecSettings(codec, useGpu, cq) {
    if (useGpu) {
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
    const { inputPath, outputPath, codec, cq, useGpu } = jobData

    const tempOutputPath = createTempPath(outputPath)
    const { videoCodec, codecOptions } = getCodecSettings(codec, useGpu, cq)

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
