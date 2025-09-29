<script>
  import { createEventDispatcher } from 'svelte';

  export let selectedFiles = [];

  const dispatch = createEventDispatcher();

  let codec = 'x264';
  let cqValue = 23;
  let isGpuAvailable = false;
  let processorChoice = 'auto'; // 'auto', 'gpu', 'cpu'

  // Check GPU availability on mount
  import { onMount } from 'svelte';
  
  onMount(async () => {
    try {
      const response = await fetch('/api/gpu-status');
      if (response.ok) {
        const data = await response.json();
        isGpuAvailable = data.available;
      }
    } catch (error) {
      console.error('Failed to check GPU status:', error);
    }
  });

  async function startEncoding() {
    if (selectedFiles.length === 0) return;

    const videoFiles = selectedFiles.filter(file => 
      file.metadata?.video_codec && file.type !== 'directory'
    );

    if (videoFiles.length === 0) {
      alert('Please select video files to encode');
      return;
    }

    try {
      const response = await fetch('/api/encode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: videoFiles.map(f => f.path),
          codec,
          cq: cqValue,
          forceGpu: processorChoice === 'gpu',
          forceCpu: processorChoice === 'cpu'
        })
      });

      if (response.ok) {
        const result = await response.json();
        dispatch('encode-start', { jobs: result.jobs });
        // Clear selection after starting encode
        selectedFiles = [];
      } else {
        const error = await response.json();
        alert('Failed to start encoding: ' + error.message);
      }
    } catch (error) {
      alert('Error starting encoding: ' + error.message);
    }
  }

  function getEstimatedProcessor() {
    if (processorChoice === 'cpu') return 'CPU';
    if (processorChoice === 'gpu' && isGpuAvailable) return 'GPU';
    if (processorChoice === 'auto' && isGpuAvailable) return 'GPU';
    return 'CPU';
  }

  function getCodecName() {
    const processor = getEstimatedProcessor();
    if (processor === 'GPU') {
      return codec === 'x264' ? 'h264_nvenc' : 'hevc_nvenc';
    } else {
      return codec === 'x264' ? 'libx264' : 'libx265';
    }
  }

  $: videoFileCount = selectedFiles.filter(f => f.metadata?.video_codec && f.type !== 'directory').length;
</script>

<div class="encoding-toolbar">
  <div class="card">
    <div class="card-header">
      <h3>Encoding Options</h3>
      <span class="text-muted">
        {videoFileCount} video file{videoFileCount !== 1 ? 's' : ''} selected
      </span>
    </div>
    
    <div class="card-body">
      <div class="encoding-options">
        <div class="option-group">
          <label for="codec">Video Codec:</label>
          <select id="codec" class="form-control" bind:value={codec}>
            <option value="x264">H.264 (x264)</option>
            <option value="x265">H.265 (x265)</option>
          </select>
        </div>

        <div class="option-group">
          <label for="cq">CQ Value:</label>
          <input 
            id="cq" 
            type="range" 
            min="18" 
            max="28" 
            step="1" 
            bind:value={cqValue}
            class="form-control range-input"
          />
          <span class="cq-value">{cqValue}</span>
        </div>

        <div class="option-group">
          <label>Processor:</label>
          <div class="processor-options">
            <label class="radio-label">
              <input type="radio" bind:group={processorChoice} value="auto" />
              Auto (Use GPU if available)
            </label>
            <label class="radio-label" class:disabled={!isGpuAvailable}>
              <input type="radio" bind:group={processorChoice} value="gpu" disabled={!isGpuAvailable} />
              Force GPU {isGpuAvailable ? '(Available)' : '(Not Available)'}
            </label>
            <label class="radio-label">
              <input type="radio" bind:group={processorChoice} value="cpu" />
              Force CPU
            </label>
          </div>
        </div>

        <div class="encoding-preview">
          <div class="preview-item">
            <strong>Estimated Processor:</strong> 
            <span class="processor-badge" class:gpu={getEstimatedProcessor() === 'GPU'}>
              {getEstimatedProcessor()}
            </span>
          </div>
          <div class="preview-item">
            <strong>Codec:</strong> {getCodecName()}
          </div>
          <div class="preview-item">
            <strong>Output Format:</strong> MKV (with -map 0, -c:a copy, -c:s copy)
          </div>
        </div>

        <div class="actions">
          <button 
            class="btn btn-primary encode-btn"
            on:click={startEncoding}
            disabled={videoFileCount === 0}
          >
            🎬 Start Encoding ({videoFileCount} file{videoFileCount !== 1 ? 's' : ''})
          </button>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .encoding-toolbar {
    margin-top: 1rem;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .card-header h3 {
    margin: 0;
    font-size: 1.1rem;
  }

  .encoding-options {
    display: grid;
    gap: 1rem;
  }

  .option-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .option-group label {
    font-weight: 600;
    font-size: 0.9rem;
  }

  .range-input {
    width: 100%;
  }

  .cq-value {
    font-weight: 600;
    color: #007bff;
    font-size: 1.1rem;
  }

  .processor-options {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .radio-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: normal;
    cursor: pointer;
  }

  .radio-label.disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .radio-label input[type="radio"]:disabled {
    cursor: not-allowed;
  }

  .encoding-preview {
    background: #374151;
    padding: 1rem;
    border-radius: 4px;
    border: 1px solid #4b5563;
  }

  .preview-item {
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
    color: #e0e0e0;
  }

  .preview-item:last-child {
    margin-bottom: 0;
  }

  .processor-badge {
    padding: 0.25rem 0.5rem;
    border-radius: 3px;
    font-size: 0.8rem;
    font-weight: 600;
    background: #6b7280;
    color: white;
  }

  .processor-badge.gpu {
    background: #059669;
  }

  .actions {
    display: flex;
    justify-content: center;
  }

  .encode-btn {
    font-size: 1rem;
    padding: 0.75rem 1.5rem;
    font-weight: 600;
  }

  .encode-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>