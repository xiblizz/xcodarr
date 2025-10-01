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

  $: hasVideoSelection = selectedFiles.some(
    (f) => f && f.type !== 'directory' && f.metadata && f.metadata.video_codec
  );
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
      
      {#if hasVideoSelection}
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
    color: var(--fg);
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  header h1 { margin: 0; color: var(--fg); font-size: 1.25rem; font-weight: 600; letter-spacing: 0.2px; }

  .breadcrumb { display: flex; align-items: center; font-size: 0.875rem; color: var(--muted); font-family: ui-monospace, SFMono-Regular, "Cascadia Code", Consolas, "Liberation Mono", Menlo, monospace; }

  .breadcrumb-item { color: var(--fg); }

  .breadcrumb-separator { margin: 0 0.5rem; color: var(--muted); }

  .main-content { display: grid; grid-template-columns: 1fr 420px; gap: 1rem; flex: 1; }

  .file-section {
    min-height: 0;
  }

  .job-section { padding-left: 0; }

  @media (max-width: 768px) {
    .main-content {
      grid-template-columns: 1fr;
    }
    
    .job-section { border-left: none; border-top: 2px solid var(--border); padding-left: 0; padding-top: 1rem; }
  }
</style>