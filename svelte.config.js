import adapter from 'sveltejs/adapter-bun'

/** @type {import('@sveltejs/kit').Config} */
const config = {
    kit: {
        adapter: adapter(),
    },
    // Disable accessibility warnings
    onwarn: (warning, handler) => {
        if (warning.code.includes('a11y')) return
        handler(warning)
    },
}

export default config
