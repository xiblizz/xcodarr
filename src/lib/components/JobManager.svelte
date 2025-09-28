<script>
  import { createEventDispatcher } from 'svelte';

  export let jobs = [];

  const dispatch = createEventDispatcher();

  function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function formatDuration(seconds) {
    if (!seconds) return '0s';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  function getStatusColor(status) {
    switch (status) {
      case 'completed': return '#28a745';
      case 'running': return '#007bff';
      case 'failed': return '#dc3545';
      case 'queued': return '#ffc107';
      case 'cancelled': return '#6c757d';
      default: return '#6c757d';
    }
  }

  async function stopJob(jobId) {
    if (!confirm('Are you sure you want to stop this job?')) return;
    
    try {
      const response = await fetch(`/api/jobs/${jobId}/stop`, {
        method: 'POST'
      });
      
      if (response.ok) {
        dispatch('job-update');
      } else {
        alert('Failed to stop job');
      }
    } catch (error) {
      alert('Error stopping job: ' + error.message);
    }
  }

  async function deleteJob(jobId) {
    if (!confirm('Are you sure you want to delete this job?')) return;
    
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        dispatch('job-update');
      } else {
        alert('Failed to delete job');
      }
    } catch (error) {
      alert('Error deleting job: ' + error.message);
    }
  }

  function getProgressPercentage(job) {
    if (job.status === 'completed') return 100;
    if (job.status === 'failed' || job.status === 'cancelled') return 0;
    return job.progress || 0;
  }

  function getETA(job) {
    if (!job.progress || job.progress <= 0 || job.status !== 'running') return null;
    
    const elapsed = Date.now() - new Date(job.started_at).getTime();
    const remaining = (elapsed / (job.progress / 100)) - elapsed;
    
    if (remaining <= 0) return null;
    
    return formatDuration(remaining / 1000);
  }

  $: runningJobs = jobs.filter(job => job.status === 'running');
  $: queuedJobs = jobs.filter(job => job.status === 'queued');
  $: completedJobs = jobs.filter(job => job.status === 'completed');
  $: failedJobs = jobs.filter(job => job.status === 'failed');
</script>

<div class="job-manager">
  <div class="card">
    <div class="card-header">
      <h3>Encoding Jobs</h3>
      <div class="job-stats">
        <span class="stat running">Running: {runningJobs.length}</span>
        <span class="stat queued">Queued: {queuedJobs.length}</span>
        <span class="stat completed">Completed: {completedJobs.length}</span>
        {#if failedJobs.length > 0}
          <span class="stat failed">Failed: {failedJobs.length}</span>
        {/if}
      </div>
    </div>
    
    <div class="card-body">
      {#if jobs.length === 0}
        <div class="no-jobs">
          <p>No encoding jobs</p>
        </div>
      {:else}
        <div class="job-list">
          {#each jobs as job (job.id)}
            <div class="job-item" class:running={job.status === 'running'}>
              <div class="job-header">
                <div class="job-title">
                  <span class="file-name">{job.filename}</span>
                  <span class="job-status" style="color: {getStatusColor(job.status)}">
                    {job.status.toUpperCase()}
                  </span>
                </div>
                <div class="job-actions">
                  {#if job.status === 'running' || job.status === 'queued'}
                    <button class="btn btn-sm btn-danger" on:click={() => stopJob(job.id)}>
                      Stop
                    </button>
                  {/if}
                  {#if job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled'}
                    <button class="btn btn-sm btn-secondary" on:click={() => deleteJob(job.id)}>
                      Delete
                    </button>
                  {/if}
                </div>
              </div>

              <div class="job-details">
                <div class="job-info">
                  <span><strong>Codec:</strong> {job.codec}</span>
                  <span><strong>CQ:</strong> {job.cq}</span>
                  <span><strong>Processor:</strong> 
                    <span class="processor-badge" class:gpu={job.using_gpu}>
                      {job.using_gpu ? 'GPU' : 'CPU'}
                    </span>
                  </span>
                  {#if job.input_size}
                    <span><strong>Size:</strong> {formatFileSize(job.input_size)}</span>
                  {/if}
                </div>

                {#if job.status === 'running' || job.status === 'completed'}
                  <div class="progress-section">
                    <div class="progress">
                      <div 
                        class="progress-bar" 
                        style="width: {getProgressPercentage(job)}%; background-color: {getStatusColor(job.status)}"
                      ></div>
                    </div>
                    <div class="progress-info">
                      <span>{getProgressPercentage(job).toFixed(1)}%</span>
                      {#if job.status === 'running' && getETA(job)}
                        <span>ETA: {getETA(job)}</span>
                      {/if}
                    </div>
                  </div>
                {/if}

                {#if job.status === 'completed' && job.output_size}
                  <div class="completion-info">
                    <span><strong>Output:</strong> {formatFileSize(job.output_size)}</span>
                    {#if job.input_size}
                      {@const savings = ((job.input_size - job.output_size) / job.input_size * 100)}
                      <span><strong>Space saved:</strong> {savings.toFixed(1)}%</span>
                    {/if}
                  </div>
                {/if}

                {#if job.error_message}
                  <div class="error-message">
                    <strong>Error:</strong> {job.error_message}
                  </div>
                {/if}

                <div class="job-timestamps">
                  <span class="text-small text-muted">
                    Created: {new Date(job.created_at).toLocaleString()}
                  </span>
                  {#if job.started_at}
                    <span class="text-small text-muted">
                      Started: {new Date(job.started_at).toLocaleString()}
                    </span>
                  {/if}
                  {#if job.completed_at}
                    <span class="text-small text-muted">
                      Completed: {new Date(job.completed_at).toLocaleString()}
                    </span>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .job-manager {
    height: fit-content;
  }

  .card-header {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .card-header h3 {
    margin: 0;
    font-size: 1.1rem;
  }

  .job-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    font-size: 0.85rem;
  }

  .stat {
    padding: 0.25rem 0.5rem;
    border-radius: 3px;
    font-weight: 600;
  }

  .stat.running {
    background: #d1ecf1;
    color: #0c5460;
  }

  .stat.queued {
    background: #fff3cd;
    color: #856404;
  }

  .stat.completed {
    background: #d4edda;
    color: #155724;
  }

  .stat.failed {
    background: #f8d7da;
    color: #721c24;
  }

  .no-jobs {
    text-align: center;
    color: #6c757d;
    padding: 2rem;
  }

  .job-list {
    max-height: 70vh;
    overflow-y: auto;
  }

  .job-item {
    border: 1px solid #dee2e6;
    border-radius: 4px;
    margin-bottom: 1rem;
    padding: 1rem;
    background: #f8f9fa;
  }

  .job-item.running {
    border-color: #007bff;
    background: #e3f2fd;
  }

  .job-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 0.75rem;
  }

  .job-title {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .file-name {
    font-weight: 600;
    word-break: break-all;
  }

  .job-status {
    font-size: 0.8rem;
    font-weight: 600;
  }

  .job-actions {
    display: flex;
    gap: 0.5rem;
  }

  .btn-sm {
    padding: 0.25rem 0.5rem;
    font-size: 0.8rem;
  }

  .job-details {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .job-info {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    font-size: 0.9rem;
  }

  .processor-badge {
    padding: 0.2rem 0.4rem;
    border-radius: 3px;
    font-size: 0.75rem;
    font-weight: 600;
    background: #6c757d;
    color: white;
  }

  .processor-badge.gpu {
    background: #28a745;
  }

  .progress-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .progress-info {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    color: #6c757d;
  }

  .completion-info {
    display: flex;
    gap: 1rem;
    font-size: 0.9rem;
  }

  .error-message {
    color: #dc3545;
    font-size: 0.9rem;
    background: #f8d7da;
    padding: 0.5rem;
    border-radius: 3px;
  }

  .job-timestamps {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
</style>