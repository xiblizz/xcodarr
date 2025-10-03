// Run with: bun test-env.js
console.log('cwd:', process.cwd())
console.log('process.env.NODE_ENV:', process.env.NODE_ENV)
console.log('process.env.TEST:', process.env.TEST)
console.log('process.env.MEDIA_DIR:', process.env.MEDIA_DIR)

// Bun exposes Bun.env; check safely so this file also runs under node
if (typeof Bun !== 'undefined') {
    console.log('Bun.env.TEST:', Bun.env.TEST)
} else {
    console.log('Bun is not defined in this runtime.')
}
