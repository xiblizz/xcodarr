import { json } from '@sveltejs/kit'
import { checkGpuAvailability } from '$lib/utils/encodingUtils.js'

export async function GET() {
    try {
        const info = await checkGpuAvailability()

        return json({ available: Boolean(info.preferred || info.nvenc || info.videotoolbox), info })
    } catch (error) {
        console.error('Error checking GPU status:', error)
        return json({ available: false, info: null })
    }
}
