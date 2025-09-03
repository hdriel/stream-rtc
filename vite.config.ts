import { defineConfig } from 'vite';
import { resolve } from 'path'; // install for this package: npm i -D @types/node

// https://vite.dev/config/
export default defineConfig({
    plugins: [],
    build: {
        target: 'esnext', // for dynamic module imports, if not need to dynamic module import remove this
        rollupOptions: {
            // for multiple routes
            input: {
                index: resolve(__dirname, 'src/index.ts'),
                client: resolve(__dirname, 'src/RTCPeerConnection.client.ts'),
                server: resolve(__dirname, 'src/RTCPeerConnection.server.ts'),
            },
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules')) {
                        return id.split('node_modules/')[1].split('/')[0];
                    }
                },
            },
        },
    },
});
