import { getJobQueue } from '$lib/utils/jobQueue.js';

// Initialize job queue when server starts
getJobQueue();