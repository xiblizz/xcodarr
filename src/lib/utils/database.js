import Database from 'sqlite3'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'

let db = null

function getDatabase() {
    if (!db) {
        // Ensure data directory exists. Respect DATA_DIR env var (loaded from .env when running locally).
        const dataDir = process.env.DATA_DIR || path.resolve(process.cwd(), 'data')
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true })
        }

        const dbPath = path.join(dataDir, 'transcodarr.db')
        db = new Database.Database(dbPath)

        // Preserve the original callback-based run for access to this.lastID
        // and add promisified variants without overwriting core methods.
        db._run = db.run.bind(db)
        db.runAsync = promisify(db._run)
        db.get = promisify(db.get.bind(db))
        db.all = promisify(db.all.bind(db))

        // Initialize tables
        initializeTables()
    }
    return db
}

async function initializeTables() {
    const database = getDatabase()

    // Create jobs table
    await database.runAsync(`
		CREATE TABLE IF NOT EXISTS jobs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			filename TEXT NOT NULL,
			input_path TEXT NOT NULL,
            output_path TEXT,
			codec TEXT NOT NULL,
			cq INTEGER NOT NULL,
			using_gpu BOOLEAN NOT NULL DEFAULT 0,
            auto_delete BOOLEAN NOT NULL DEFAULT 0,
			status TEXT NOT NULL DEFAULT 'queued',
			progress REAL DEFAULT 0,
			input_size INTEGER,
			output_size INTEGER,
			error_message TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			started_at DATETIME,
			completed_at DATETIME
		)
	`)

    // Ensure 'auto_delete' column exists for older databases
    try {
        const cols = await database.all(`PRAGMA table_info(jobs)`)
        const hasAutoDelete = cols.some((c) => c.name === 'auto_delete')
        if (!hasAutoDelete) {
            console.log("Migrating database: adding 'auto_delete' column to jobs table")
            await database.runAsync(`ALTER TABLE jobs ADD COLUMN auto_delete BOOLEAN NOT NULL DEFAULT 0`)
        }
    } catch (err) {
        console.error('Error ensuring auto_delete column exists:', err)
    }

    console.log('Database initialized')
}

// Job management functions
export async function createJob(jobData) {
    const database = getDatabase()
    // Use the original callback-style run to access this.lastID reliably
    const lastId = await new Promise((resolve, reject) => {
        database._run(
            `
            INSERT INTO jobs (filename, input_path, output_path, codec, cq, using_gpu, auto_delete, status, input_size)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			`,
            [
                jobData.filename,
                jobData.input_path,
                jobData.output_path,
                jobData.codec,
                jobData.cq,
                jobData.using_gpu ? 1 : 0,
                jobData.auto_delete ? 1 : 0,
                jobData.status || 'queued',
                jobData.input_size || null,
            ],
            function (err) {
                if (err) return reject(err)
                resolve(this.lastID)
            }
        )
    })

    return lastId
}

export async function getAllJobs() {
    const database = getDatabase()
    const jobs = await database.all(`
        SELECT * FROM jobs 
        ORDER BY id DESC
    `)

    return jobs.map((job) => ({
        ...job,
        using_gpu: Boolean(job.using_gpu),
        auto_delete: Boolean(job.auto_delete),
        progress: job.progress === null || job.progress === undefined ? 0 : Number(job.progress),
    }))
}

export async function getJob(id) {
    const database = getDatabase()
    const job = await database.get('SELECT * FROM jobs WHERE id = ?', [id])

    if (job) {
        job.using_gpu = Boolean(job.using_gpu)
        job.auto_delete = Boolean(job.auto_delete)
        job.progress = job.progress === null || job.progress === undefined ? 0 : Number(job.progress)
    }

    return job
}

export async function updateJob(id, updates) {
    const database = getDatabase()
    const setClause = Object.keys(updates)
        .map((key) => `${key} = ?`)
        .join(', ')
    const values = Object.values(updates)
    values.push(id)

    await database.runAsync(`UPDATE jobs SET ${setClause} WHERE id = ?`, values)
    // Debug: log progress/state updates to help trace Windows/SQLite behavior
    if (updates.progress !== undefined) {
        console.debug(`DB: updated job ${id} progress -> ${updates.progress}`)
    } else if (updates.status) {
        console.debug(`DB: updated job ${id} status -> ${updates.status}`)
    }
}

export async function deleteJob(id) {
    const database = getDatabase()
    await database.runAsync('DELETE FROM jobs WHERE id = ?', [id])
}

export async function getNextQueuedJob() {
    const database = getDatabase()
    return await database.get(`
		SELECT * FROM jobs 
		WHERE status = 'queued' 
		ORDER BY created_at ASC 
		LIMIT 1
	`)
}

export async function getRunningJobs() {
    const database = getDatabase()
    const jobs = await database.all(`
		SELECT * FROM jobs 
		WHERE status = 'running'
	`)

    return jobs.map((job) => ({
        ...job,
        using_gpu: Boolean(job.using_gpu),
        auto_delete: Boolean(job.auto_delete),
    }))
}
