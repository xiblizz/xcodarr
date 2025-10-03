// Load .env early so server-side code can pick up MEDIA_DIR/DATA_DIR when running without Docker
import dotenv from 'dotenv'
dotenv.config()

import { getJobQueue } from '$lib/utils/jobQueue.js'

// Initialize job queue when server starts
getJobQueue()

console.log('process.env.NODE_ENV', process.env.NODE_ENV)
console.log('process.env.MEDIA_DIR', process.env.MEDIA_DIR)
console.log('process.env.DATA_DIR', process.env.DATA_DIR)
