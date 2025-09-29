<script>
  import { onMount } from 'svelte';
  import FileManager from '$lib/components/FileManager.svelte';
  import JobManager from '$lib/components/JobManager.svelte';
  import EncodingToolbar from '$lib/components/EncodingToolbar.svelte';

  let files = [];
  let jobs = [];
  let selectedFiles = [];
  let currentPath = '/media';

  onMount(async () => {
    await loadFiles();
    await loadJobs();
    // Start job polling
    setInterval(loadJobs, 2000);
  });

  async function loadFiles() {
    try {
      const response = await fetch(`/api/files?path=${encodeURIComponent(currentPath)}`);
      if (response.ok) {
        files = await response.json();
      }
    } catch (error) {
      console.error('Failed to load files:', error);
    }
  }

  async function loadJobs() {
    try {
      const response = await fetch('/api/jobs');
      if (response.ok) {
        jobs = await response.json();
      }
    } catch (error) {
      console.error('Failed to load jobs:', error);
    }
  }

  function handlePathChange(event) {
    currentPath = event.detail.path;
    loadFiles();
  }

  function handleFileSelect(event) {
    selectedFiles = event.detail.files;
  }
</script>

<svelte:head>
  <title>Transcodarr - Media Manager</title>
</svelte:head>

<div class="app">
  <header>
    <h1>transcodarr</h1>
    <nav class="breadcrumb">
      {#each currentPath.split('/').filter(part => part) as part, index}
        {#if index > 0}<span class="breadcrumb-separator">/</span>{/if}
        <span class="breadcrumb-item">{part}</span>
      {/each}
    </nav>
  </header>

  <div class="main-content">
    <div class="file-section">
      <FileManager 
        bind:files
        bind:currentPath
        bind:selectedFiles
        on:pathchange={handlePathChange}
        on:fileselect={handleFileSelect}
        on:refresh={loadFiles}
      />
      
      {#if selectedFiles.length > 0}
        <EncodingToolbar 
          {selectedFiles}
          on:encode-start={loadJobs}
        />
      {/if}
    </div>

    <div class="job-section">
      <JobManager 
        {jobs}
        on:job-update={loadJobs}
      />
    </div>
  </div>
</div>

<style>
  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  header {
    background: #1f2937;
    color: #f9fafb;
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
    border-bottom: 2px solid #374151;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  header h1 {
    margin: 0;
    color: #f9fafb;
    font-size: 1.25rem;
    font-weight: 500;
  }

  .breadcrumb {
    display: flex;
    align-items: center;
    font-size: 0.875rem;
    color: #9ca3af;
    font-family: ui-monospace, SFMono-Regular, "Cascadia Code", Consolas, "Liberation Mono", Menlo, monospace;
  }

  .breadcrumb-item {
    color: #d1d5db;
  }

  .breadcrumb-separator {
    margin: 0 0.5rem;
    color: #6b7280;
  }

  .main-content {
    display: grid;
    grid-template-columns: 1fr 400px;
    gap: 1rem;
    flex: 1;
  }

  .file-section {
    min-height: 0;
  }

  .job-section {
    border-left: 2px solid #4b5563;
    padding-left: 1rem;
  }

  @media (max-width: 768px) {
    .main-content {
      grid-template-columns: 1fr;
    }
    
    .job-section {
      border-left: none;
      border-top: 2px solid #4b5563;
      padding-left: 0;
      padding-top: 1rem;
    }
  }
</style>