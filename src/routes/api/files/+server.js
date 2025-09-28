import { json } from '@sveltejs/kit';
import { listFiles, getMediaDir } from '$lib/utils/fileUtils.js';

export async function GET({ url }) {
	try {
		const requestedPath = url.searchParams.get('path') || getMediaDir();
		const files = await listFiles(requestedPath);
		
		return json(files);
	} catch (error) {
		console.error('Error listing files:', error);
		return json({ error: error.message }, { status: 500 });
	}
}