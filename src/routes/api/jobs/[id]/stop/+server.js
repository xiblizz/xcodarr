import { json } from '@sveltejs/kit';
import { getJobQueue } from '$lib/utils/jobQueue.js';

export async function POST({ params }) {
	try {
		const jobId = parseInt(params.id);
		
		if (isNaN(jobId)) {
			return json({ error: 'Invalid job ID' }, { status: 400 });
		}
		
		const jobQueue = getJobQueue();
		const stopped = await jobQueue.stopJob(jobId);
		
		if (!stopped) {
			return json({ error: 'Job not found or not running' }, { status: 404 });
		}
		
		return json({ success: true });
	} catch (error) {
		console.error('Error stopping job:', error);
		return json({ error: error.message }, { status: 500 });
	}
}