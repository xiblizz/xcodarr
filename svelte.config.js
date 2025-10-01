import adapter from '@sveltejs/adapter-node'

/** @type {import('@sveltejs/kit').Config} */
const config = {
    kit: {
        adapter: adapter({
            out: 'build',
        }),
    },
    // Disable accessibility warnings
    onwarn: (warning, handler) => {
        if (warning.code.includes('a11y')) return
        handler(warning)
    },
}

export default config
