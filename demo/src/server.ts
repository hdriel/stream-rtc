import fs from 'node:fs';
import path from 'node:path';
import https from 'https';
import express, { type Request, type Response } from 'express';
import { Server as SocketIO } from 'socket.io';
import { RTCPeerConnectionServer } from './source-code';
// import { RTCPeerConnectionServer } from 'stream-rtc';

const __dirname = import.meta.dirname;
console.log('__dirname', __dirname);
const app = express();

app.use(express.static(path.resolve(__dirname, '../dist')));

// We need a key and cert to run https
// Generated with mkcert: $ mkcert create-ca && mkcert create-cert
const key = fs.readFileSync(path.resolve(__dirname, 'cert.key'));
const cert = fs.readFileSync(path.resolve(__dirname, 'cert.crt'));

// Create HTTPS server with express
const expressServer = https.createServer({ key, cert }, app);

// Create socket.io server with CORS configuration
const io = new SocketIO(expressServer, {
    cors: {
        origin: '*', // Configure this properly for production
        methods: ['GET', 'POST'],
    },
});

const PORT = 8181;
expressServer.listen(PORT);

console.log(`Listening on port ${PORT}`);
console.log(`Open URL: https://localhost:${PORT}`);

// Track connected users and their RTC servers
const connectedUsers: Record<string, { userId: string; rtcServer: RTCPeerConnectionServer }> = {};

io.on('connection', (socket) => {
    console.log('New connection:', socket.id);

    // Validate authentication
    const password = socket.handshake.auth.password;
    if (password !== 'x') {
        console.log('Authentication failed for socket:', socket.id);
        socket.disconnect(true);
        return;
    }

    // Generate or get userId
    const userId = socket.handshake.auth.userId || 'User-' + Math.floor(Math.random() * 100000);

    // Update handshake auth with userId
    socket.handshake.auth.userId = userId;

    // Check if user is already connected (handle reconnections)
    const existingConnection = Object.values(connectedUsers).find((conn) => conn.userId === userId);
    if (existingConnection) {
        console.log('User reconnecting:', userId);
        // Update socket ID for existing user
        existingConnection.rtcServer.updateSocketId(userId);
    }

    // Create RTC server instance with debug mode
    const rtcServer = new RTCPeerConnectionServer(socket, userId, {
        debugMode: true, // Enable debug mode
    });

    // Store connection info
    connectedUsers[socket.id] = { userId, rtcServer };

    console.log('User connected:', userId);

    // Notify client of successful connection
    socket.emit('connected', userId);

    // Notify other users about new connection
    socket.broadcast.emit('user-connected', userId);

    // Send list of currently connected users to the new user
    const currentUsers = Object.values(connectedUsers)
        .map((conn) => conn.userId)
        .filter((id) => id !== userId);

    currentUsers.forEach((id) => {
        socket.emit('user-connected', id);
    });

    // Handle legacy room joining (if still needed)
    socket.on('join-room', (roomId: string) => {
        console.log(`User ${userId} joining room:`, roomId);
        socket.join(roomId);
        socket.broadcast.to(roomId).emit('user-joined-room', { userId, roomId });
    });

    // Handle leaving legacy rooms
    socket.on('leave-room', (roomId: string) => {
        console.log(`User ${userId} leaving room:`, roomId);
        socket.leave(roomId);
        socket.broadcast.to(roomId).emit('user-left-room', { userId, roomId });
    });

    // Handle manual user disconnect event
    socket.on('user-disconnect-manual', () => {
        console.log('User manually disconnecting:', userId);
        handleUserDisconnection(socket.id, userId);
    });

    // Handle socket disconnection
    socket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', socket.id, 'reason:', reason);
        handleUserDisconnection(socket.id, userId);
    });

    // Handle connection errors
    socket.on('connect_error', (error) => {
        console.error('Connection error for socket:', socket.id, error);
    });

    // Send current server stats to new user (optional)
    socket.emit('server-stats', {
        connectedUsers: Object.keys(connectedUsers).length,
        availableRooms: RTCPeerConnectionServer.getAllRooms().length,
        activeOffers: RTCPeerConnectionServer.getActiveOffersCount(),
    });
});

// Helper function to handle user disconnection cleanup
function handleUserDisconnection(socketId: string, userId: string) {
    const userConnection = connectedUsers[socketId];

    if (!userConnection) return;

    // Clean up RTC server resources
    userConnection.rtcServer.removeSocketId(userId);

    // Remove from connected users
    delete connectedUsers[socketId];

    // Notify other users about disconnection
    io.emit('user-disconnected', userId);

    console.log('User disconnected and cleaned up:', userId);

    // Log current stats
    console.log('Current stats:', {
        connectedUsers: Object.keys(connectedUsers).length,
        connectedUserIds: Object.values(connectedUsers).map((conn) => conn.userId),
        totalRooms: RTCPeerConnectionServer.getAllRooms().length,
        activeOffers: RTCPeerConnectionServer.getActiveOffersCount(),
    });
}

// Error handling for the server
expressServer.on('error', (error) => {
    console.error('Server error:', error);
});

// Graceful shutdown handling
process.on('SIGINT', async () => {
    console.log('Shutting down server gracefully...');

    // Close all socket connections
    await io.close();

    // Close HTTPS server
    expressServer.close(() => {
        console.log('Server closed successfully');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down...');
    expressServer.close(() => {
        process.exit(0);
    });
});

// Optional: Add health check endpoint
app.get('/health', (_req: Request, res: Response) => {
    res.json({
        status: 'OK',
        connectedUsers: Object.keys(connectedUsers).length,
        rooms: RTCPeerConnectionServer.getAllRooms().length,
        activeOffers: RTCPeerConnectionServer.getActiveOffersCount(),
        uptime: process.uptime(),
    });
});

// Optional: Add API endpoint to get server stats
app.get('/api/stats', (_req: Request, res: Response) => {
    res.json({
        connectedUsers: Object.values(connectedUsers).map((conn) => conn.userId),
        rooms: RTCPeerConnectionServer.getAllRooms(),
        totalConnections: Object.keys(connectedUsers).length,
    });
});
