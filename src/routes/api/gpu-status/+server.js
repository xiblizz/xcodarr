import { json } from '@sveltejs/kit';
import { checkGpuAvailability } from '$lib/utils/encodingUtils.js';

export async function GET() {
	try {
		const available = await checkGpuAvailability();
		
		return json({ available });
	} catch (error) {
		console.error('Error checking GPU status:', error);
		return json({ available: false });
	}
}