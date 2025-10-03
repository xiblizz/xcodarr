import { getJobQueue } from '$lib/utils/jobQueue.js'

// Initialize job queue when server starts
getJobQueue()

// list environement variables
console.log('Environment Variables:')
console.log(process.env.MEDIA_DIR ? `MEDIA_DIR=${process.env.MEDIA_DIR}` : 'MEDIA_DIR not set')
console.log(Bun.env.MEDIA_DIR ? `MEDIA_DIR=${Bun.env.MEDIA_DIR}` : 'MEDIA_DIR not set')
