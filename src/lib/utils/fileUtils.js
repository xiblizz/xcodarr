import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

const MEDIA_DIR = process.env.MEDIA_DIR || '/media';

// Security: Validate that paths stay within the media directory
export function validatePath(targetPath) {
	const resolvedPath = path.resolve(targetPath);
	const resolvedMediaDir = path.resolve(MEDIA_DIR);
	
	if (!resolvedPath.startsWith(resolvedMediaDir)) {
		throw new Error('Path is outside the allowed media directory');
	}
	
	return resolvedPath;
}

export async function getFileMetadata(filePath) {
	return new Promise((resolve, reject) => {
		const ffprobe = spawn('ffprobe', [
			'-v', 'quiet',
			'-print_format', 'json',
			'-show_format',
			'-show_streams',
			filePath
		]);
		
		let output = '';
		
		ffprobe.stdout.on('data', (data) => {
			output += data.toString();
		});
		
		ffprobe.on('close', (code) => {
			if (code !== 0) {
				resolve(null); // Not a media file
				return;
			}
			
			try {
				const data = JSON.parse(output);
				const videoStream = data.streams?.find(s => s.codec_type === 'video');
				
				if (!videoStream) {
					resolve(null);
					return;
				}
				
				resolve({
					duration: parseFloat(data.format?.duration) || null,
					video_codec: videoStream.codec_name || null,
					resolution: videoStream.width && videoStream.height 
						? `${videoStream.width}×${videoStream.height}`
						: null,
					bitrate: parseInt(data.format?.bit_rate) || null
				});
			} catch (error) {
				resolve(null);
			}
		});
		
		ffprobe.on('error', () => {
			resolve(null);
		});
	});
}

export async function listFiles(dirPath) {
	try {
		const validatedPath = validatePath(dirPath);
		const entries = await fs.readdir(validatedPath, { withFileTypes: true });
		
		const files = [];
		
		for (const entry of entries) {
			const fullPath = path.join(validatedPath, entry.name);
			
			try {
				const stats = await fs.stat(fullPath);
				const isDirectory = entry.isDirectory();
				
				let metadata = null;
				if (!isDirectory) {
					metadata = await getFileMetadata(fullPath);
				}
				
				files.push({
					name: entry.name,
					path: fullPath,
					type: isDirectory ? 'directory' : 'file',
					size: isDirectory ? 0 : stats.size,
					modified: stats.mtime,
					metadata
				});
			} catch (error) {
				// Skip files that can't be accessed
				continue;
			}
		}
		
		// Sort: directories first, then files
		files.sort((a, b) => {
			if (a.type !== b.type) {
				return a.type === 'directory' ? -1 : 1;
			}
			return a.name.localeCompare(b.name);
		});
		
		return files;
	} catch (error) {
		throw new Error(`Failed to list files: ${error.message}`);
	}
}

export async function renameFile(oldPath, newName) {
	try {
		const validatedOldPath = validatePath(oldPath);
		const newPath = path.join(path.dirname(validatedOldPath), newName);
		const validatedNewPath = validatePath(newPath);
		
		await fs.rename(validatedOldPath, validatedNewPath);
		return validatedNewPath;
	} catch (error) {
		throw new Error(`Failed to rename file: ${error.message}`);
	}
}

export async function copyFile(sourcePath, targetDir) {
	try {
		const validatedSourcePath = validatePath(sourcePath);
		const fileName = path.basename(validatedSourcePath);
		const targetPath = path.join(targetDir, fileName);
		const validatedTargetPath = validatePath(targetPath);
		
		await fs.copyFile(validatedSourcePath, validatedTargetPath);
		return validatedTargetPath;
	} catch (error) {
		throw new Error(`Failed to copy file: ${error.message}`);
	}
}

export async function moveFile(sourcePath, targetDir) {
	try {
		const validatedSourcePath = validatePath(sourcePath);
		const fileName = path.basename(validatedSourcePath);
		const targetPath = path.join(targetDir, fileName);
		const validatedTargetPath = validatePath(targetPath);
		
		await fs.rename(validatedSourcePath, validatedTargetPath);
		return validatedTargetPath;
	} catch (error) {
		throw new Error(`Failed to move file: ${error.message}`);
	}
}

export async function deleteFile(filePath) {
	try {
		const validatedPath = validatePath(filePath);
		const stats = await fs.stat(validatedPath);
		
		if (stats.isDirectory()) {
			await fs.rmdir(validatedPath, { recursive: true });
		} else {
			await fs.unlink(validatedPath);
		}
	} catch (error) {
		throw new Error(`Failed to delete file: ${error.message}`);
	}
}

export function getMediaDir() {
	return MEDIA_DIR;
}