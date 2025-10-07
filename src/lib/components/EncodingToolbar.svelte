<script>
    import { createEventDispatcher, onMount } from 'svelte'

    export let selectedFiles = []

    const dispatch = createEventDispatcher()

    let codec = 'x265'
    let cqValue = 28
    let isGpuAvailable = false
    let processorChoice = 'auto' // 'auto', 'gpu', 'cpu'
    let autoDelete = false

    // Resolution presets and computed sizes
    const resolutionPresets = [
        { label: 'Original', width: null },
        { label: '4K (2160p)', width: 3840 },
        { label: '1080p', width: 1920 },
        { label: '720p', width: 1280 },
        { label: '480p', width: 854 },
    ]
    let selectedPreset = resolutionPresets[0]
    let computedWidth = ''
    let computedHeight = ''

    function parseResolution(res) {
        if (!res || typeof res !== 'string') return { w: null, h: null }
        const m = res.match(/(\d+)×(\d+)/)
        if (!m) return { w: null, h: null }
        return { w: Number(m[1]), h: Number(m[2]) }
    }

    function getPrimaryVideo() {
        // Use first selected video file for preview calculations
        return selectedFiles.find((f) => f.metadata?.video_codec && f.type !== 'directory') || null
    }

    function recalcDimensions() {
        const src = getPrimaryVideo()
        const { w: srcW, h: srcH } = parseResolution(src?.metadata?.resolution)
        const targetW = selectedPreset.width || srcW || null
        if (!targetW || !srcW || !srcH) {
            computedWidth = targetW ? String(targetW) : '-'
            computedHeight = srcH ? String(srcH) : '-'
            return
        }
        // Maintain aspect ratio; compute height, round to even as required by most codecs
        const aspect = srcH / srcW
        let h = Math.round(targetW * aspect)
        if (h % 2 === 1) h += 1
        computedWidth = String(targetW)
        computedHeight = String(h)
    }

    $: selectedFiles, recalcDimensions()
    $: selectedPreset, recalcDimensions()

    onMount(async () => {
        try {
            const response = await fetch('/api/gpu-status')
            if (response.ok) {
                const data = await response.json()
                isGpuAvailable = data.available
            }
        } catch (error) {
            console.error('Failed to check GPU status:', error)
        }
    })

    async function startEncoding() {
        if (selectedFiles.length === 0) return

        const videoFiles = selectedFiles.filter((file) => file.metadata?.video_codec && file.type !== 'directory')

        if (videoFiles.length === 0) {
            alert('Please select video files to encode')
            return
        }

        try {
            const response = await fetch('/api/encode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    files: videoFiles.map((f) => f.path),
                    codec,
                    cq: cqValue,
                    forceGpu: processorChoice === 'gpu',
                    forceCpu: processorChoice === 'cpu',
                    targetWidth: selectedPreset.width || null,
                    autoDelete,
                }),
            })

            if (response.ok) {
                const result = await response.json()
                dispatch('encode-start', { jobs: result.jobs })
                // Clear selection after starting encode
                selectedFiles = []
            } else {
                const error = await response.json()
                alert('Failed to start encoding: ' + error.message)
            }
        } catch (error) {
            alert('Error starting encoding: ' + error.message)
        }
    }

    function getEstimatedProcessor() {
        if (processorChoice === 'cpu') return 'CPU'
        if (processorChoice === 'gpu' && isGpuAvailable) return 'GPU'
        if (processorChoice === 'auto' && isGpuAvailable) return 'GPU'
        return 'CPU'
    }

    function getCodecName() {
        const processor = getEstimatedProcessor()
        if (processor === 'GPU') {
            // This is an estimate for display; actual encoder chosen at runtime
            return codec === 'x264' ? 'h264_nvenc' : 'hevc_nvenc'
        } else {
            return codec === 'x264' ? 'libx264' : 'libx265'
        }
    }

    $: videoFileCount = selectedFiles.filter((f) => f.metadata?.video_codec && f.type !== 'directory').length
</script>

<div class="encoding-toolbar">
    <div class="encoding-options">
        <div class="option-row">
            <div class="option-group">
                <label for="codec">Codec:</label>
                <select
                    id="codec"
                    class="form-control"
                    bind:value={codec}
                >
                    <option value="x264">H.264</option>
                    <option value="x265">H.265</option>
                    <option value="av1">AV1</option>
                </select>
            </div>

            <div class="option-group">
                <label for="cq">CQ: <span class="cq-value">{cqValue}</span></label>
                <input
                    id="cq"
                    type="range"
                    min="18"
                    max="31"
                    step="1"
                    bind:value={cqValue}
                    class="form-control range-input"
                />
            </div>

            <div class="option-group">
                <label for="resolution">Resolution:</label>
                <select
                    id="resolution"
                    class="form-control"
                    bind:value={selectedPreset}
                >
                    {#each resolutionPresets as opt}
                        <option value={opt}>{opt.label}</option>
                    {/each}
                </select>
                <div class="dims">
                    <input
                        class="form-control"
                        value={computedWidth}
                        disabled
                    />
                    <span>×</span>
                    <input
                        class="form-control"
                        value={computedHeight}
                        disabled
                    />
                </div>
            </div>
        </div>

        <div class="option-row">
            <div class="option-group">
                <!-- svelte-ignore a11y-label-has-associated-control -->
                <label>Processor:</label>
                <div class="processor-options">
                    <label class="radio-label">
                        <input
                            type="radio"
                            bind:group={processorChoice}
                            value="auto"
                        />
                        Auto
                    </label>
                    <label
                        class="radio-label"
                        class:disabled={!isGpuAvailable}
                    >
                        <input
                            type="radio"
                            bind:group={processorChoice}
                            value="gpu"
                            disabled={!isGpuAvailable}
                        />
                        GPU
                    </label>
                    <label class="radio-label">
                        <input
                            type="radio"
                            bind:group={processorChoice}
                            value="cpu"
                        />
                        CPU
                    </label>
                </div>
            </div>

            <div
                class="option-group"
                style="align-self: center;"
            >
                <label>
                    <input
                        type="checkbox"
                        bind:checked={autoDelete}
                    />
                    Auto-delete original after success
                </label>
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

<style>
    .encoding-toolbar {
        margin-top: 0.5rem;
    }

    .encoding-options {
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 1rem;
    }

    .option-row {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        gap: 1rem;
        justify-content: space-around;
        align-items: start;
    }

    .option-group {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
        padding: 0.25rem;
    }

    .option-group label {
        font-weight: 500;
        font-size: 0.875rem;
        color: var(--muted);
        margin-bottom: 0.25rem;
    }

    .actions {
        display: flex;
        justify-content: center;
        margin-top: 0.5rem;
    }

    /* Theme-related styles moved to global app.css */

    @media (max-width: 768px) {
        .option-row {
            grid-template-columns: 1fr;
        }
    }

    .dims {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .dims input {
        width: 6rem;
        text-align: center;
    }
</style>
