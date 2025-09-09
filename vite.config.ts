import { defineConfig } from 'vite';
import { resolve } from 'pathe'; // install for this package: npm i -D @types/node
import dts from 'vite-plugin-dts'; // install for this package: npm i -D @types/node

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
    plugins: [dts({ insertTypesEntry: true })],
    build: {
        lib: {
            entry: resolve(__dirname, 'src/index.ts'),
            name: 'StreamsRTC',
            fileName: '[name]',
            formats: ['es', 'cjs', 'umd'],
        },
        minify: mode !== 'development',
        terserOptions: {
            compress: mode !== 'development',
            mangle: mode !== 'development',
        },
    },
}));
