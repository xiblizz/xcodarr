import { json } from '@sveltejs/kit'
import { getJob } from '$lib/utils/database.js'
import { getJobQueue } from '$lib/utils/jobQueue.js'

export async function POST({ params }) {
    try {
        const jobId = parseInt(params.id, 10)
        if (Number.isNaN(jobId)) {
            return json({ error: 'Invalid job ID' }, { status: 400 })
        }

        const job = await getJob(jobId)
        if (!job) {
            return json({ error: 'Job not found' }, { status: 404 })
        }

        const queue = getJobQueue()
        const ok = await queue.forceStopAndRemove(jobId)
        if (!ok) {
            return json({ error: 'Failed to force stop/remove job' }, { status: 500 })
        }

        return json({ success: true })
    } catch (error) {
        console.error('Error force stopping job:', error)
        return json({ error: error.message }, { status: 500 })
    }
}
