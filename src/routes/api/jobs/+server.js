import { json } from '@sveltejs/kit';
import { getAllJobs } from '$lib/utils/database.js';

export async function GET() {
	try {
		const jobs = await getAllJobs();
		return json(jobs);
	} catch (error) {
		console.error('Error getting jobs:', error);
		return json({ error: error.message }, { status: 500 });
	}
}