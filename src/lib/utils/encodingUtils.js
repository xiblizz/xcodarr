import { spawn } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { spawn as spawnAsync } from 'child_process'

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
    // If the filename already contains a codec token (h264, x264, h265, x265),
    // replace that token with the target codec token (h264 or h265) to avoid
    // double-suffixes. Example: "movie_x264.mkv" -> "movie_h265.mkv" when
    // converting to x265.
    const targetToken = codec === 'x264' ? 'h264' : 'h265'

    // Replace tokens in a case-insensitive manner, but preserve the rest of the name.
    const newName = parsed.name.replace(/\b(x?h264|x?h265)\b/i, targetToken)

    if (newName !== parsed.name) {
        return path.join(parsed.dir, `${newName}.mkv`)
    }

    // Fallback: append a suffix to indicate the target codec
    const suffix = codec === 'x264' ? ' [h264]' : ' [h265]'
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

    // Probe input file duration with ffprobe in the background as a fallback.
    // This is async and won't block returning the ChildProcess; when the
    // duration becomes available we'll use it for progress calculations.
    try {
        const probe = spawnAsync('ffprobe', [
            '-v',
            'quiet',
            '-print_format',
            'json',
            '-show_format',
            '-show_streams',
            inputPath,
        ])

        let probeOut = ''
        probe.stdout?.on('data', (d) => (probeOut += d.toString()))
        probe.on('close', (code) => {
            try {
                if (code === 0 && probeOut) {
                    const data = JSON.parse(probeOut)
                    const duration = parseFloat(data.format?.duration)
                    if (!isNaN(duration) && duration > 0) {
                        totalDuration = duration
                        console.debug(`[encode] ffprobe detected duration for ${inputPath}: ${totalDuration}s`)
                    }
                }
            } catch (err) {
                // ignore probe parse errors; we'll rely on FFmpeg stderr when available
            }
        })
        probe.on('error', () => {})
    } catch (err) {
        // ignore errors probing duration
    }

    ffmpeg.stderr.on('data', (data) => {
        const output = data.toString()
        // Keep a rolling buffer of stderr lines for debugging
        output.split(/\r?\n/).forEach((line) => {
            if (!line) return
            stderrBuffer.push(line)
            if (stderrBuffer.length > MAX_LINES) stderrBuffer.shift()
        })

        // Parse duration from FFmpeg output (allow 1+ hour digits and fractional seconds)
        // Examples: "Duration: 00:02:34.56" or "Duration: 0:02:34.56"
        const durationMatch = output.match(/Duration:\s*(\d{1,}:\d{2}:\d{2}(?:\.\d+)?)/)
        if (durationMatch && !totalDuration) {
            const durStr = durationMatch[1]
            const parts = durStr.split(':')
            const hours = parseInt(parts[0])
            const minutes = parseInt(parts[1])
            const seconds = parseFloat(parts[2])
            totalDuration = hours * 3600 + minutes * 60 + seconds
        }

        // Parse current time from FFmpeg output
        // Primary: hh:mm:ss[.ms] (e.g., time=00:00:10.00 or time=0:00:10.00)
        const timeMatch = output.match(/time=(\d{1,}:\d{2}:\d{2}(?:\.\d+)?)/)
        if (timeMatch && totalDuration) {
            const timeStr = timeMatch[1]
            const parts = timeStr.split(':')
            const hours = parseInt(parts[0])
            const minutes = parseInt(parts[1])
            const seconds = parseFloat(parts[2])
            currentTime = hours * 3600 + minutes * 60 + seconds

            const progress = Math.min((currentTime / totalDuration) * 100, 100)
            const pct = Number(progress.toFixed(1))
            console.debug(
                `[encode] progress parsed for ${inputPath}: ${pct}% (time=${timeStr} / duration=${totalDuration}s)`
            )
            onProgress(pct)
            return
        }

        // Fallback: some ffmpeg builds or encoders (or piped input) may emit time in seconds: e.g., time=123.45
        const secsMatch = output.match(/time=(\d+(?:\.\d+)?)(?:\s|$)/)
        if (secsMatch && totalDuration) {
            const secs = parseFloat(secsMatch[1])
            if (!isNaN(secs)) {
                currentTime = secs
                const progress = Math.min((currentTime / totalDuration) * 100, 100)
                const pct = Number(progress.toFixed(1))
                console.debug(
                    `[encode] progress parsed (secs) for ${inputPath}: ${pct}% (time=${secs}s / duration=${totalDuration}s)`
                )
                onProgress(pct)
            }
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
