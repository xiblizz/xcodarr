import { getNextQueuedJob, getRunningJobs, updateJob, getJob, deleteJob } from './database.js'
import { encodeVideo, checkGpuAvailability } from './encodingUtils.js'

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

            // Determine if we should use GPU
            const gpuAvailable = await checkGpuAvailability()
            let useGpu = job.using_gpu && gpuAvailable

            // If GPU was requested but not available, fall back to CPU
            if (job.using_gpu && !gpuAvailable) {
                console.log(`Job ${jobId}: GPU requested but not available, falling back to CPU`)
                await updateJob(jobId, { using_gpu: 0 })
                useGpu = false
            }

            const jobData = {
                inputPath: job.input_path,
                outputPath: job.output_path,
                codec: job.codec,
                cq: job.cq,
                useGpu,
            }

            const process = encodeVideo(
                jobData,
                // Progress callback
                async (progress) => {
                    await updateJob(jobId, { progress })
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
