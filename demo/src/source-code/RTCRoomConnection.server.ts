// @ts-nocheck
import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

interface Room {
    roomId: string;
    roomName: string;
    creatorUserId: string;
    participants: Map<string, {
        userId: string;
        socketId: string;
        joinedAt: Date;
        isConnected: boolean;
    }>;
    maxParticipants?: number;
    isPrivate: boolean;
    createdAt: Date;
    lastActivity: Date;
}

interface UserInfo {
    userId: string;
    socketId: string;
    currentRoom?: string;
    connectedAt: Date;
}

export class RoomManager {
    private rooms: Map<string, Room> = new Map();
    private users: Map<string, UserInfo> = new Map(); // socketId -> UserInfo
    private usersByUserId: Map<string, UserInfo> = new Map(); // userId -> UserInfo
    private io: Server;

    constructor(io: Server) {
        this.io = io;
        this.setupEventHandlers();
        this.startCleanupTimer();
    }

    private setupEventHandlers() {
        this.io.on('connection', (socket: Socket) => {
            console.log('New client connected:', socket.id);

            // רישום משתמש
            socket.on('registerUser', (data: { userId: string }, callback) => {
                this.registerUser(socket, data.userId, callback);
            });

            // יצירת חדר
            socket.on('createRoom', (data: {
                roomName: string;
                roomId?: string;
                maxParticipants?: number;
                isPrivate?: boolean;
                creatorUserId: string;
            }, callback) => {
                this.createRoom(socket, data, callback);
            });

            // הצטרפות לחדר
            socket.on('joinRoom', (data: {
                roomId: string;
                userId: string;
            }, callback) => {
                this.joinRoom(socket, data, callback);
            });

            // עזיבת חדר
            socket.on('leaveRoom', (data: {
                roomId: string;
                userId: string;
            }, callback) => {
                this.leaveRoom(socket, data, callback);
            });

            // קבלת רשימת חדרים זמינים
            socket.on('getAvailableRooms', (callback) => {
                this.getAvailableRooms(socket, callback);
            });

            // WebRTC signaling - Offer
            socket.on('roomOffer', (data: {
                offer: RTCSessionDescriptionInit;
                targetUserId: string;
                roomId: string;
                offererUserId: string;
            }) => {
                this.handleRoomOffer(socket, data);
            });

            // WebRTC signaling - Answer
            socket.on('roomAnswer', (data: {
                answer: RTCSessionDescriptionInit;
                target