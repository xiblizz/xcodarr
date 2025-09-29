<script>
  import { createEventDispatcher } from 'svelte';
  
  export let files = [];
  export let currentPath = '/media';
  export let selectedFiles = [];

  const dispatch = createEventDispatcher();

  let clipboard = null;
  let clipboardOperation = null; // 'cut' or 'copy'
  let showContextMenu = false;
  let contextMenuX = 0;
  let contextMenuY = 0;
  let contextMenuFile = null;
  let renameFile = null;
  let renameValue = '';

  function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function formatDuration(seconds) {
    if (!seconds) return '-';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function handleFileClick(file, event) {
    if (event.ctrlKey || event.metaKey) {
      // Multi-select with Ctrl/Cmd
      if (selectedFiles.includes(file)) {
        selectedFiles = selectedFiles.filter(f => f !== file);
      } else {
        selectedFiles = [...selectedFiles, file];
      }
    } else if (event.shiftKey && selectedFiles.length > 0) {
      // Range select with Shift
      const lastSelectedFile = selectedFiles[selectedFiles.length - 1];
      const lastIndex = files.indexOf(lastSelectedFile);
      const currentIndex = files.indexOf(file);
      
      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        const rangeFiles = files.slice(start, end + 1);
        
        // Merge with existing selection
        const newSelection = [...selectedFiles];
        rangeFiles.forEach(rangeFile => {
          if (!newSelection.includes(rangeFile)) {
            newSelection.push(rangeFile);
          }
        });
        selectedFiles = newSelection;
      }
    } else {
      // Single select
      selectedFiles = [file];
    }
    dispatch('fileselect', { files: selectedFiles });
  }

  function handleDoubleClick(file) {
    if (file.type === 'directory') {
      navigateTo(file.path);
    }
  }

  function navigateTo(path) {
    currentPath = path;
    selectedFiles = [];
    dispatch('pathchange', { path });
  }

  function navigateUp() {
    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/media';
    navigateTo(parentPath);
  }

  function handleContextMenu(event, file) {
    event.preventDefault();
    contextMenuFile = file;
    contextMenuX = event.clientX;
    contextMenuY = event.clientY;
    showContextMenu = true;
  }

  function closeContextMenu() {
    showContextMenu = false;
    contextMenuFile = null;
  }

  function startRename(file) {
    renameFile = file;
    renameValue = file.name;
    closeContextMenu();
  }

  async function confirmRename() {
    if (!renameFile || !renameValue.trim()) return;
    
    try {
      const response = await fetch('/api/files/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oldPath: renameFile.path,
          newName: renameValue.trim()
        })
      });
      
      if (response.ok) {
        dispatch('refresh');
      } else {
        alert('Failed to rename file');
      }
    } catch (error) {
      alert('Error renaming file: ' + error.message);
    }
    
    renameFile = null;
    renameValue = '';
  }

  function cancelRename() {
    renameFile = null;
    renameValue = '';
  }

  function copyFile(file) {
    clipboard = file;
    clipboardOperation = 'copy';
    closeContextMenu();
  }

  function cutFile(file) {
    clipboard = file;
    clipboardOperation = 'cut';
    closeContextMenu();
  }

  async function pasteFile() {
    if (!clipboard || !clipboardOperation) return;
    
    try {
      const response = await fetch('/api/files/paste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePath: clipboard.path,
          targetDir: currentPath,
          operation: clipboardOperation
        })
      });
      
      if (response.ok) {
        dispatch('refresh');
        clipboard = null;
        clipboardOperation = null;
      } else {
        alert('Failed to paste file');
      }
    } catch (error) {
      alert('Error pasting file: ' + error.message);
    }
    closeContextMenu();
  }

  async function deleteFile(file) {
    if (!confirm(`Are you sure you want to delete "${file.name}"?`)) return;
    
    try {
      const response = await fetch('/api/files/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: file.path })
      });
      
      if (response.ok) {
        dispatch('refresh');
      } else {
        alert('Failed to delete file');
      }
    } catch (error) {
      alert('Error deleting file: ' + error.message);
    }
    closeContextMenu();
  }

  // Close context menu when clicking outside
  function handleClick() {
    if (showContextMenu) {
      closeContextMenu();
    }
  }

  function selectAllFiles() {
    selectedFiles = [...files];
    dispatch('fileselect', { files: selectedFiles });
  }

  function clearSelection() {
    selectedFiles = [];
    dispatch('fileselect', { files: selectedFiles });
  }

  function selectVideoFiles() {
    selectedFiles = files.filter(file => file.metadata?.video_codec && file.type !== 'directory');
    dispatch('fileselect', { files: selectedFiles });
  }
</script>

<svelte:window on:click={handleClick} />

<div class="file-manager">
  <div class="toolbar">
    <button class="btn btn-secondary" on:click={navigateUp} disabled={currentPath === '/media'}>
      ← Up
    </button>
    <button class="btn btn-secondary" on:click={() => dispatch('refresh')}>
      🔄 Refresh
    </button>
    
    <div class="selection-controls">
      <button class="btn btn-secondary btn-sm" on:click={selectAllFiles}>
        Select All
      </button>
      <button class="btn btn-secondary btn-sm" on:click={selectVideoFiles}>
        Select Videos
      </button>
      <button class="btn btn-secondary btn-sm" on:click={clearSelection} disabled={selectedFiles.length === 0}>
        Clear ({selectedFiles.length})
      </button>
    </div>
    
    {#if clipboard && clipboardOperation}
      <button class="btn btn-primary" on:click={pasteFile}>
        📋 Paste ({clipboardOperation})
      </button>
    {/if}
    <span class="file-count">{files.length} items</span>
  </div>

  <div class="file-list">
    <table class="table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Size</th>
          <th>Duration</th>
          <th>Video Codec</th>
          <th>Resolution</th>
        </tr>
      </thead>
      <tbody>
        {#each files as file}
          <tr 
            class="file-row" 
            class:selected={selectedFiles.includes(file)}
            on:click={(e) => handleFileClick(file, e)}
            on:dblclick={() => handleDoubleClick(file)}
            on:contextmenu={(e) => handleContextMenu(e, file)}
          >
            <td class="file-name">
              <span class="file-icon">
                {#if file.type === 'directory'}
                  📁
                {:else if file.metadata?.video_codec}
                  🎬
                {:else}
                  📄
                {/if}
              </span>
              {#if renameFile === file}
                <input 
                  class="form-control rename-input"
                  bind:value={renameValue}
                  on:keydown={(e) => {
                    if (e.key === 'Enter') confirmRename();
                    if (e.key === 'Escape') cancelRename();
                  }}
                  on:blur={confirmRename}
                  autofocus
                />
              {:else}
                {file.name}
              {/if}
            </td>
            <td>{file.type === 'directory' ? '-' : formatFileSize(file.size)}</td>
            <td>{formatDuration(file.metadata?.duration)}</td>
            <td>{file.metadata?.video_codec || '-'}</td>
            <td>{file.metadata?.resolution || '-'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

{#if showContextMenu}
  <div class="context-menu" style="left: {contextMenuX}px; top: {contextMenuY}px;">
    <div class="context-menu-item" on:click={() => startRename(contextMenuFile)}>
      Rename
    </div>
    <div class="context-menu-item" on:click={() => copyFile(contextMenuFile)}>
      Copy
    </div>
    <div class="context-menu-item" on:click={() => cutFile(contextMenuFile)}>
      Cut
    </div>
    <div class="context-menu-divider"></div>
    <div class="context-menu-item danger" on:click={() => deleteFile(contextMenuFile)}>
      Delete
    </div>
  </div>
{/if}

<style>
  .file-manager {
    background: #2d3748;
    border-radius: 4px;
    box-shadow: 0 4px 8px rgba(0,0,0,0.3);
    overflow: hidden;
  }

  .toolbar {
    padding: 1rem;
    border-bottom: 1px solid #495057;
    display: flex;
    gap: 0.5rem;
    align-items: center;
    background: #374151;
    flex-wrap: wrap;
  }

  .selection-controls {
    display: flex;
    gap: 0.25rem;
    margin-left: 0.5rem;
  }

  .btn-sm {
    padding: 0.25rem 0.5rem;
    font-size: 0.8rem;
  }

  .file-count {
    margin-left: auto;
    color: #a0aec0;
    font-size: 0.9rem;
  }

  .file-list {
    max-height: 60vh;
    overflow-y: auto;
  }

  .file-row {
    cursor: pointer;
  }

  .file-row:hover {
    background: #f8f9fa;
  }

  .file-row.selected {
    background: #1e3a8a !important;
  }

  .file-name {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .file-icon {
    font-size: 1.2rem;
  }

  .rename-input {
    min-width: 200px;
    background: #374151;
    color: #e0e0e0;
    border: 1px solid #4b5563;
  }

  .context-menu {
    position: fixed;
    background: #374151;
    border: 1px solid #4b5563;
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    z-index: 1000;
    min-width: 120px;
  }

  .context-menu-item {
    padding: 0.5rem 1rem;
    cursor: pointer;
    font-size: 0.9rem;
    color: #e0e0e0;
  }

  .context-menu-item:hover {
    background: #4b5563;
  }

  .context-menu-item.danger {
    color: #f87171;
  }

  .context-menu-divider {
    height: 1px;
    background: #4b5563;
    margin: 0.25rem 0;
  }
</style>