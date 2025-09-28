import { json } from '@sveltejs/kit';
import { deleteFile } from '$lib/utils/fileUtils.js';

export async function DELETE({ request }) {
	try {
		const { path } = await request.json();
		
		if (!path) {
			return json({ error: 'Missing path' }, { status: 400 });
		}
		
		await deleteFile(path);
		
		return json({ success: true });
	} catch (error) {
		console.error('Error deleting file:', error);
		return json({ error: error.message }, { status: 500 });
	}
}