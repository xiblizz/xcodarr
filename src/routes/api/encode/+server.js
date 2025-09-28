import { json } from '@sveltejs/kit';
import { createJob } from '$lib/utils/database.js';
import { generateOutputPath, checkGpuAvailability } from '$lib/utils/encodingUtils.js';
import { validatePath } from '$lib/utils/fileUtils.js';
import fs from 'fs/promises';
import path from 'path';

export async function POST({ request }) {
	try {
		const { files, codec, cq, forceGpu, forceCpu } = await request.json();
		
		if (!files || !Array.isArray(files) || files.length === 0) {
			return json({ error: 'No files provided' }, { status: 400 });
		}
		
		if (!codec || (codec !== 'x264' && codec !== 'x265')) {
			return json({ error: 'Invalid codec. Must be x264 or x265' }, { status: 400 });
		}
		
		if (!cq || cq < 18 || cq > 28) {
			return json({ error: 'Invalid CQ value. Must be between 18 and 28' }, { status: 400 });
		}
		
		const gpuAvailable = await checkGpuAvailability();
		let useGpu = false;
		
		if (forceCpu) {
			useGpu = false;
		} else if (forceGpu) {
			useGpu = gpuAvailable;
		} else {
			useGpu = gpuAvailable; // Use GPU if available by default
		}
		
		const jobs = [];
		
		for (const filePath of files) {
			try {
				// Validate the file path
				const validatedPath = validatePath(filePath);
				
				// Check if file exists
				const stats = await fs.stat(validatedPath);
				if (!stats.isFile()) {
					console.warn(`Skipping ${filePath}: not a file`);
					continue;
				}
				
				// Generate output path
				const outputPath = generateOutputPath(validatedPath, codec);
				
				// Create job in database
				const jobId = await createJob({
					filename: path.basename(validatedPath),
					input_path: validatedPath,
					output_path: outputPath,
					codec,
					cq,
					using_gpu: useGpu,
					status: 'queued',
					input_size: stats.size
				});
				
				jobs.push({
					id: jobId,
					filename: path.basename(validatedPath),
					codec,
					cq,
					using_gpu: useGpu
				});
				
			} catch (error) {
				console.error(`Error creating job for ${filePath}:`, error);
				// Continue with other files
			}
		}
		
		if (jobs.length === 0) {
			return json({ error: 'No valid jobs could be created' }, { status: 400 });
		}
		
		return json({ 
			success: true, 
			jobs,
			message: `Created ${jobs.length} encoding job${jobs.length !== 1 ? 's' : ''}`
		});
		
	} catch (error) {
		console.error('Error creating encoding jobs:', error);
		return json({ error: error.message }, { status: 500 });
	}
}