import { defineConfig } from 'vite';
import { resolve } from 'pathe'; // install for this package: npm i -D @types/node
import dts from 'vite-plugin-dts'; // install for this package: npm i -D @types/node

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        dts({
            insertTypesEntry: true,
        }),
    ],
    build: {
        lib: {
            entry: {
                index: resolve(__dirname, 'src/index.ts'),
                client: resolve(__dirname, 'src/RTCPeerConnection.client.ts'),
                server: resolve(__dirname, 'src/RTCPeerConnection.server.ts'),
            },
            name: 'RTCPeerConnectionAuto',
            fileName: '[name]',
            formats: ['es', 'cjs'],
        },
    },
});
