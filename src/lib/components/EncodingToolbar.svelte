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
        <div class="option-row">
          <div class="option-group">
            <label for="codec">Codec:</label>
            <select id="codec" class="form-control" bind:value={codec}>
              <option value="x264">H.264</option>
              <option value="x265">H.265</option>
            </select>
          </div>

          <div class="option-group">
            <label for="cq">CQ: <span class="cq-value">{cqValue}</span></label>
            <input 
              id="cq" 
              type="range" 
              min="18" 
              max="28" 
              step="1" 
              bind:value={cqValue}
              class="form-control range-input"
            />
          </div>

          <div class="option-group">
            <label>Processor:</label>
            <div class="processor-options">
              <label class="radio-label">
                <input type="radio" bind:group={processorChoice} value="auto" />
                Auto
              </label>
              <label class="radio-label" class:disabled={!isGpuAvailable}>
                <input type="radio" bind:group={processorChoice} value="gpu" disabled={!isGpuAvailable} />
                GPU
              </label>
              <label class="radio-label">
                <input type="radio" bind:group={processorChoice} value="cpu" />
                CPU
              </label>
            </div>
          </div>
        </div>

        <div class="actions">
          <button 
            class="btn btn-ghost encode-btn"
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
    font-size: 1rem;
    font-weight: 500;
  }

  .encoding-options {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .option-row {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 1rem;
    align-items: start;
  }

  .option-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .option-group label {
    font-weight: 500;
    font-size: 0.875rem;
    color: #374151;
  }

  .form-control {
    padding: 0.375rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    background-color: white;
    transition: border-color 0.15s ease-in-out;
  }

  .form-control:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .range-input {
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    cursor: pointer;
  }

  .range-input::-webkit-slider-track {
    background: #e5e7eb;
    height: 4px;
    border-radius: 2px;
  }

  .range-input::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    background: #3b82f6;
    height: 16px;
    width: 16px;
    border-radius: 50%;
    cursor: pointer;
  }

  .range-input::-moz-range-track {
    background: #e5e7eb;
    height: 4px;
    border-radius: 2px;
    border: none;
  }

  .range-input::-moz-range-thumb {
    background: #3b82f6;
    height: 16px;
    width: 16px;
    border-radius: 50%;
    cursor: pointer;
    border: none;
  }

  .cq-value {
    font-weight: 600;
    color: #3b82f6;
  }

  .processor-options {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .radio-label {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-weight: normal !important;
    cursor: pointer;
    font-size: 0.75rem !important;
    color: #6b7280 !important;
  }

  .radio-label.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .radio-label input[type="radio"] {
    margin: 0;
    cursor: pointer;
  }

  .radio-label input[type="radio"]:disabled {
    cursor: not-allowed;
  }

  .actions {
    display: flex;
    justify-content: center;
    margin-top: 0.5rem;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    font-weight: 500;
    border: 1px solid transparent;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.15s ease-in-out;
    text-decoration: none;
  }

  .btn-ghost {
    color: #374151;
    background-color: transparent;
    border-color: #d1d5db;
  }

  .btn-ghost:hover:not(:disabled) {
    background-color: #f9fafb;
    border-color: #9ca3af;
  }

  .btn-ghost:active:not(:disabled) {
    background-color: #f3f4f6;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .encode-btn {
    font-size: 0.875rem;
    padding: 0.5rem 1rem;
    font-weight: 500;
  }

  @media (max-width: 768px) {
    .option-row {
      grid-template-columns: 1fr;
    }
  }
</style>