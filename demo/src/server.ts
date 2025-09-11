import fs from 'node:fs';
import path from 'node:path';
import https from 'https';
import express from 'express';
import { Server as SocketIO } from 'socket.io';
import { RTCPeerConnectionServer } from './source-code';
// import { RTCPeerConnectionServer } from 'stream-rtc';

let _roomId = 'some-room-id';
const __dirname = import.meta.dirname;
console.log('__dirname', __dirname);
const app = express();

app.use(express.static(path.resolve(__dirname, '../dist')));

//we need a key and cert to run https
//we generated them with mkcert
// $ mkcert create-ca
// $ mkcert create-cert
const key = fs.readFileSync(path.resolve(__dirname, 'cert.key'));
const cert = fs.readFileSync(path.resolve(__dirname, 'cert.crt'));

//we changed our express setup so we can use https
//pass the key and cert to createServer on https
const expressServer = https.createServer({ key, cert }, app);
//create our socket.io server... it will listen to our express port
const io = new SocketIO(expressServer);
expressServer.listen(8181); // https://localhost:8181

console.log('Listening on port 8181');
console.log('open url: https://localhost:8181');

const userIds: Record<string, string> = {};

io.on('connection', (socket) => {
    // console.log("Someone has connected");
    socket.handshake.auth.userId = userIds[socket.id] = 'Rob-' + Math.floor(Math.random() * 100000);
    const password = socket.handshake.auth.password;
    if (password !== 'x') {
        socket.disconnect(true);
        return;
    }

    socket.emit('connected', socket.handshake.auth.userId);

    socket.broadcast.emit('user-connected', socket.handshake.auth.userId);
    Object.values(userIds)
        .filter((userId) => userId !== socket.handshake.auth.userId)
        .forEach((userId) => {
            socket.emit('user-connected', userId);
        });

    const rtcserver = new RTCPeerConnectionServer(socket, socket.handshake.auth.userId);
    rtcserver.updateSocketId(socket.handshake.auth.userId);

    socket.on('disconnect', () => {
        socket.broadcast.emit('user-disconnect', userIds[socket.id]);
        delete userIds[socket.id];
    });

    socket.on('join-room', (roomId) => {
        _roomId = _roomId;
        socket.join(roomId);
    });
});
