import { json } from '@sveltejs/kit'
import { deleteJob, getJob } from '$lib/utils/database.js'

export async function DELETE({ params }) {
    try {
        const jobId = parseInt(params.id)

        if (isNaN(jobId)) {
            return json({ error: 'Invalid job ID' }, { status: 400 })
        }

        const job = await getJob(jobId)
        if (!job) {
            return json({ error: 'Job not found' }, { status: 404 })
        }

        if (job.status === 'running') {
            return json({ error: 'Cannot delete running job. Stop it first.' }, { status: 400 })
        }

        await deleteJob(jobId)

        return json({ success: true })
    } catch (error) {
        console.error('Error deleting job:', error)
        return json({ error: error.message }, { status: 500 })
    }
}

export async function GET({ params }) {
    try {
        const jobId = parseInt(params.id)
        if (isNaN(jobId)) return json({ error: 'Invalid job ID' }, { status: 400 })

        const job = await getJob(jobId)
        if (!job) return json({ error: 'Job not found' }, { status: 404 })

        return json(job)
    } catch (error) {
        console.error('Error fetching job:', error)
        return json({ error: error.message }, { status: 500 })
    }
}
