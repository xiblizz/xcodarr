import { json } from '@sveltejs/kit';
import { renameFile } from '$lib/utils/fileUtils.js';

export async function POST({ request }) {
	try {
		const { oldPath, newName } = await request.json();
		
		if (!oldPath || !newName) {
			return json({ error: 'Missing oldPath or newName' }, { status: 400 });
		}
		
		const newPath = await renameFile(oldPath, newName);
		
		return json({ success: true, newPath });
	} catch (error) {
		console.error('Error renaming file:', error);
		return json({ error: error.message }, { status: 500 });
	}
}