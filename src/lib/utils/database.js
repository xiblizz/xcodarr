import Database from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

let db = null;

function getDatabase() {
	if (!db) {
		// Ensure data directory exists
		const dataDir = '/data';
		if (!fs.existsSync(dataDir)) {
			fs.mkdirSync(dataDir, { recursive: true });
		}
		
		const dbPath = path.join(dataDir, 'transcodarr.db');
		db = new Database.Database(dbPath);
		
		// Promisify database methods
		db.run = promisify(db.run.bind(db));
		db.get = promisify(db.get.bind(db));
		db.all = promisify(db.all.bind(db));
		
		// Initialize tables
		initializeTables();
	}
	return db;
}

async function initializeTables() {
	const database = getDatabase();
	
	// Create jobs table
	await database.run(`
		CREATE TABLE IF NOT EXISTS jobs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			filename TEXT NOT NULL,
			input_path TEXT NOT NULL,
			output_path TEXT,
			codec TEXT NOT NULL,
			cq INTEGER NOT NULL,
			using_gpu BOOLEAN NOT NULL DEFAULT 0,
			status TEXT NOT NULL DEFAULT 'queued',
			progress REAL DEFAULT 0,
			input_size INTEGER,
			output_size INTEGER,
			error_message TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			started_at DATETIME,
			completed_at DATETIME
		)
	`);
	
	console.log('Database initialized');
}

// Job management functions
export async function createJob(jobData) {
	const database = getDatabase();
	const result = await database.run(`
		INSERT INTO jobs (filename, input_path, output_path, codec, cq, using_gpu, status, input_size)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, [
		jobData.filename,
		jobData.input_path,
		jobData.output_path,
		jobData.codec,
		jobData.cq,
		jobData.using_gpu ? 1 : 0,
		jobData.status || 'queued',
		jobData.input_size || null
	]);
	
	return result.lastID;
}

export async function getAllJobs() {
	const database = getDatabase();
	const jobs = await database.all(`
		SELECT * FROM jobs 
		ORDER BY created_at DESC
	`);
	
	return jobs.map(job => ({
		...job,
		using_gpu: Boolean(job.using_gpu)
	}));
}

export async function getJob(id) {
	const database = getDatabase();
	const job = await database.get('SELECT * FROM jobs WHERE id = ?', [id]);
	
	if (job) {
		job.using_gpu = Boolean(job.using_gpu);
	}
	
	return job;
}

export async function updateJob(id, updates) {
	const database = getDatabase();
	const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
	const values = Object.values(updates);
	values.push(id);
	
	await database.run(`UPDATE jobs SET ${setClause} WHERE id = ?`, values);
}

export async function deleteJob(id) {
	const database = getDatabase();
	await database.run('DELETE FROM jobs WHERE id = ?', [id]);
}

export async function getNextQueuedJob() {
	const database = getDatabase();
	return await database.get(`
		SELECT * FROM jobs 
		WHERE status = 'queued' 
		ORDER BY created_at ASC 
		LIMIT 1
	`);
}

export async function getRunningJobs() {
	const database = getDatabase();
	const jobs = await database.all(`
		SELECT * FROM jobs 
		WHERE status = 'running'
	`);
	
	return jobs.map(job => ({
		...job,
		using_gpu: Boolean(job.using_gpu)
	}));
}