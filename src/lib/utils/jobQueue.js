import { getNextQueuedJob, getRunningJobs, updateJob, getJob, deleteJob } from './database.js'
import { encodeVideo, checkGpuAvailability } from './encodingUtils.js'
import fs from 'fs/promises'

class JobQueue {
    constructor() {
        this.maxConcurrentJobs = parseInt(process.env.MAX_CONCURRENT_JOBS) || 1
        this.runningJobs = new Map() // jobId -> process
        this.isProcessing = false

        // Start processing queue
        this.startProcessing()
    }

    async startProcessing() {
        if (this.isProcessing) return
        this.isProcessing = true

        console.log('Job queue processor started')

        // Process queue every 5 seconds
        setInterval(() => {
            this.processQueue()
        }, 5000)

        // Initial processing
        await this.processQueue()
    }

    async processQueue() {
        try {
            const runningJobs = await getRunningJobs()
            const currentRunning = runningJobs.length

            if (currentRunning >= this.maxConcurrentJobs) {
                return // Queue is full
            }

            const availableSlots = this.maxConcurrentJobs - currentRunning

            for (let i = 0; i < availableSlots; i++) {
                const nextJob = await getNextQueuedJob()
                if (!nextJob) break

                await this.startJob(nextJob)
            }
        } catch (error) {
            console.error('Error processing job queue:', error)
        }
    }

    async startJob(job) {
        const jobId = job.id

        try {
            console.log(`Starting job ${jobId}: ${job.filename}`)

            // Update job status to running
            await updateJob(jobId, {
                status: 'running',
                started_at: new Date().toISOString(),
            })

            // Determine available hardware encoders
            const gpuInfo = await checkGpuAvailability()
            // Choose hw encoder: prefer job.using_gpu and available preferred encoder
            let hwEncoder = null
            if (job.using_gpu) {
                if (gpuInfo.preferred) hwEncoder = gpuInfo.preferred
                else if (gpuInfo.nvenc) hwEncoder = 'nvenc'
            }

            if (job.using_gpu && !hwEncoder) {
                console.log(`Job ${jobId}: GPU requested but not available, falling back to CPU`)
                await updateJob(jobId, { using_gpu: 0 })
            }

            const jobData = {
                inputPath: job.input_path,
                outputPath: job.output_path,
                codec: job.codec,
                cq: job.cq,
                hwEncoder,
            }

            const process = encodeVideo(
                jobData,
                // Progress callback
                async (progress) => {
                    try {
                        // Ensure progress is a finite number
                        const pct = Number(progress)
                        if (!Number.isFinite(pct)) return
                        console.debug(`job ${jobId} progress callback: ${pct}%`)
                        await updateJob(jobId, { progress: pct })
                    } catch (err) {
                        console.error(`Failed to persist progress for job ${jobId}:`, err)
                    }
                },
                // Completion callback
                async (error, result) => {
                    this.runningJobs.delete(jobId)

                    if (error) {
                        console.error(`Job ${jobId} failed:`, error.message)
                        await updateJob(jobId, {
                            status: 'failed',
                            error_message: error.message,
                            completed_at: new Date().toISOString(),
                        })
                    } else {
                        console.log(`Job ${jobId} completed successfully`)
                        await updateJob(jobId, {
                            status: 'completed',
                            progress: 100,
                            output_size: result.size,
                            completed_at: new Date().toISOString(),
                        })

                        // If job requested auto-delete of the input file, attempt to remove it
                        try {
                            // Refresh job record to get the latest flags (auto_delete)
                            const finishedJob = await getJob(jobId)
                            if (finishedJob && finishedJob.auto_delete) {
                                // Verify output file exists and is reasonable before deleting input
                                try {
                                    const outStats = await fs.stat(finishedJob.output_path)
                                    const outSize = outStats.size || 0

                                    // Prefer the size reported by the encoder if provided
                                    const reportedSize = Number(result && result.size) || null

                                    const isValidOutput =
                                        outSize > 0 && (reportedSize === null || reportedSize === outSize)

                                    if (!isValidOutput) {
                                        console.error(
                                            `Auto-delete aborted for job ${jobId}: output validation failed (outSize=${outSize}, reported=${reportedSize})`
                                        )
                                    } else {
                                        try {
                                            await fs.unlink(finishedJob.input_path)
                                            console.log(
                                                `Auto-deleted input file for job ${jobId}: ${finishedJob.input_path}`
                                            )
                                        } catch (fsErr) {
                                            // Log but don't fail the job if deletion fails
                                            console.error(`Failed to auto-delete input file for job ${jobId}:`, fsErr)
                                        }
                                    }
                                } catch (statErr) {
                                    console.error(
                                        `Auto-delete aborted for job ${jobId}: can't stat output file:`,
                                        statErr
                                    )
                                }
                            }
                        } catch (err) {
                            console.error(`Error checking auto_delete for job ${jobId}:`, err)
                        }
                    }
                }
            )

            this.runningJobs.set(jobId, process)
        } catch (error) {
            console.error(`Failed to start job ${jobId}:`, error)
            await updateJob(jobId, {
                status: 'failed',
                error_message: error.message,
                completed_at: new Date().toISOString(),
            })
        }
    }

    async stopJob(jobId) {
        const process = this.runningJobs.get(jobId)
        if (process) {
            console.log(`Stopping job ${jobId}`)

            // Additional safety check - ensure process has kill method
            if (typeof process.kill !== 'function') {
                console.error(`Error stopping job: process.kill is not a function. Process:`, process)
                // Remove invalid process from map
                this.runningJobs.delete(jobId)
                return false
            }

            try {
                process.kill('SIGTERM')
                this.runningJobs.delete(jobId)

                await updateJob(jobId, {
                    status: 'cancelled',
                    completed_at: new Date().toISOString(),
                })

                return true
            } catch (error) {
                console.error(`Error killing process for job ${jobId}:`, error)
                this.runningJobs.delete(jobId)
                return false
            }
        }

        // If job is not running but is queued, mark as cancelled
        const job = await getJob(jobId)
        if (job && job.status === 'queued') {
            await updateJob(jobId, {
                status: 'cancelled',
                completed_at: new Date().toISOString(),
            })
            return true
        }

        return false
    }

    // Forcefully kill a process if running and remove the job record
    async forceStopAndRemove(jobId) {
        const process = this.runningJobs.get(jobId)
        if (process && typeof process.kill === 'function') {
            try {
                console.log(`Force killing job ${jobId}`)
                process.kill('SIGKILL')
            } catch (e) {
                console.error(`Error force killing process for job ${jobId}:`, e)
            }
            this.runningJobs.delete(jobId)
        }

        try {
            await deleteJob(jobId)
            return true
        } catch (error) {
            console.error(`Error deleting job ${jobId}:`, error)
            return false
        }
    }

    getRunningJobIds() {
        return Array.from(this.runningJobs.keys())
    }
}

// Singleton instance
let jobQueue = null

export function getJobQueue() {
    if (!jobQueue) {
        jobQueue = new JobQueue()
    }
    return jobQueue
}
