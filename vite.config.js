import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [],
    // resolve: {
    //     alias: {
    //         '@': fileURLToPath(new URL('./src/demo', import.meta.url)),
    //     },
    // },
    // build: {
    //     brotliSize: false, // Brotli unsupported in StackBlitz
    //     rollupOptions: {
    //         input: { app: './src/demo/index.html' },
    //     },
    // },
    server: {
        open: '/src/demo/index.html',
    },
});
