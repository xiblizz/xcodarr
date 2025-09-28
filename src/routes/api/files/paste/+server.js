import { json } from '@sveltejs/kit';
import { copyFile, moveFile } from '$lib/utils/fileUtils.js';

export async function POST({ request }) {
	try {
		const { sourcePath, targetDir, operation } = await request.json();
		
		if (!sourcePath || !targetDir || !operation) {
			return json({ error: 'Missing sourcePath, targetDir, or operation' }, { status: 400 });
		}
		
		if (operation !== 'copy' && operation !== 'cut') {
			return json({ error: 'Invalid operation. Must be "copy" or "cut"' }, { status: 400 });
		}
		
		let newPath;
		if (operation === 'copy') {
			newPath = await copyFile(sourcePath, targetDir);
		} else {
			newPath = await moveFile(sourcePath, targetDir);
		}
		
		return json({ success: true, newPath });
	} catch (error) {
		console.error('Error pasting file:', error);
		return json({ error: error.message }, { status: 500 });
	}
}