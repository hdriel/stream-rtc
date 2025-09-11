import * as io from 'socket.io-client';
import { getUserName, password, updateToUserId, updateUserName } from './user-details.ts';

// @ts-ignore
const [host, port] = [import.meta.env.VITE_SERVER_HOST, import.meta.env.VITE_SERVER_PORT];
const url = `https://${host}:${port}/`;

export const connectSocketIO = (connectedCB?: (userId: string) => void) => {
    console.log('socket connecting on url:', url);
    const socket = io.connect(url, { auth: { userName: getUserName(), password } });

    socket.on('connected', (userId) => {
        console.log('Connected to RTC app', userId);
        connectedCB?.(userId);
        updateUserName(userId);
    });

    socket.on('user-connected', (userId) => {
        console.log('other user connected to RTC app', userId);
        updateToUserId(userId);
    });

    socket.on('user-disconnect', (userId) => {
        console.log('other user disconnected from RTC app', userId);
    });

    return socket;
};
