import type { Socket as SocketIO } from 'socket.io';
import type { SocketEventType, Offer, IceCandidateOffer } from './decs.ts';
import { SOCKET_EVENTS } from './consts.ts';

interface RoomInfo {
    roomId: string;
    roomName: string;
    isPrivate: boolean;
    maxParticipants: number;
    participants: string[];
    creatorUserId: string;
    createdAt: Date;
}

export class RTCPeerConnectionServer {
    private socket: SocketIO;
    private static readonly offers: Offer[] = [];
    private static connectedSockets: Record<string, string> = {};
    private static rooms: Map<string, RoomInfo> = new Map();
    private readonly userId: string = '';
    private readonly socketEventsMapper: SocketEventType;
    private readonly debugMode: boolean;

    constructor(
        socket: SocketIO,
        userId: string,
        options: {
            socketEventsMapper?: SocketEventType;
            debugMode?: boolean;
        } = {}
    ) {
        this.socket = socket;
        this.userId = userId;
        this.socketEventsMapper = options.socketEventsMapper || SOCKET_EVENTS;
        this.debugMode = options.debugMode ?? false;

        RTCPeerConnectionServer.connectedSockets[this.userId] = socket.id;

        // Send existing offers to the newly connected user
        if (RTCPeerConnectionServer.offers.length) {
            socket.emit(this.socketEventsMapper.availableOffers, RTCPeerConnectionServer.offers);
        }

        this.debug('User connected:', this.userId);
        this.init();
    }

    private debug(...args: any[]) {
        if (!this.debugMode) return;
        console.debug(`[Server-${this.userId}]`, ...args);
    }

    updateSocketId(userId: string): void {
        RTCPeerConnectionServer.connectedSockets[userId] = this.socket.id;
        this.debug('Updated socket ID for user:', userId);
    }

    removeSocketId(userId: string): void {
        delete RTCPeerConnectionServer.connectedSockets[userId];
        this.debug('Removed socket ID for user:', userId);
    }

    private init() {
        // Handle new offers - supports both P2P and room-based connections
        this.socket.on(
            this.socketEventsMapper.newOffer,
            (
                newOffer: RTCSessionDescriptionInit,
                data: {
                    targetUserId?: string;
                    userIds?: string[];
                    roomId?: string;
                } = {}
            ) => {
                this.handleNewOffer(newOffer, data);
            }
        );

        // Handle room offers specifically
        this.socket.on(
            'roomOffer',
            (offerData: {
                offer: RTCSessionDescriptionInit;
                targetUserId: string;
                roomId: string;
                offererUserId: string;
            }) => {
                this.handleRoomOffer(offerData);
            }
        );

        // Handle new answers
        this.socket.on(
            this.socketEventsMapper.newAnswer,
            (offerObj: Offer, ackFunction?: (iceCandidates: RTCIceCandidate[]) => void) => {
                this.handleNewAnswer(offerObj, ackFunction);
            }
        );

        // Handle room answers specifically
        this.socket.on(
            'roomAnswer',
            (answerData: {
                answer: RTCSessionDescriptionInit;
                targetUserId: string;
                roomId: string;
                answererUserId: string;
            }) => {
                this.handleRoomAnswer(answerData);
            }
        );

        // Handle ICE candidates
        this.socket.on(
            this.socketEventsMapper.sendIceCandidateToSignalingServer,
            (iceCandidateObj: IceCandidateOffer) => {
                this.handleIceCandidate(iceCandidateObj);
            }
        );

        // Handle room ICE candidates specifically
        this.socket.on(
            'roomIceCandidate',
            (candidateData: {
                candidate: RTCIceCandidate;
                targetUserId: string;
                roomId: string;
                senderUserId: string;
            }) => {
                this.handleRoomIceCandidate(candidateData);
            }
        );

        // Room management events
        this.socket.on(
            'createRoom',
            async (
                roomData: {
                    roomName: string;
                    roomId?: string;
                    maxParticipants?: number;
                    isPrivate?: boolean;
                    creatorUserId: string;
                },
                ackFunction: (response: any) => void
            ) => {
                this.handleCreateRoom(roomData, ackFunction);
            }
        );

        this.socket.on(
            'joinRoom',
            async (
                data: {
                    roomId: string;
                    userId: string;
                },
                ackFunction: (response: any) => void
            ) => {
                this.handleJoinRoom(data, ackFunction);
            }
        );

        this.socket.on(
            'leaveRoom',
            async (
                data: {
                    roomId: string;
                    userId: string;
                },
                ackFunction?: (response: any) => void
            ) => {
                this.handleLeaveRoom(data, ackFunction);
            }
        );

        this.socket.on('getAvailableRooms', (ackFunction: (rooms: RoomInfo[]) => void) => {
            this.handleGetAvailableRooms(ackFunction);
        });

        // Handle disconnection
        this.socket.on('disconnect', () => {
            this.handleDisconnect();
        });
    }

    private handleNewOffer(
        newOffer: RTCSessionDescriptionInit,
        data: {
            targetUserId?: string;
            userIds?: string[];
            roomId?: string;
        }
    ) {
        const offer: Offer = {
            offererUserId: this.userId,
            offer: newOffer,
            offerIceCandidates: [],
            answererUserId: '',
            answer: null,
            answererIceCandidates: [],
        };

        RTCPeerConnectionServer.offers.push(offer);
        this.debug('New offer created:', { offererUserId: this.userId, targetUserId: data.targetUserId });

        if (data.targetUserId) {
            // Single user P2P connection
            const targetSocketId = RTCPeerConnectionServer.connectedSockets[data.targetUserId];
            if (targetSocketId) {
                this.socket.to(targetSocketId).emit(this.socketEventsMapper.newOfferAwaiting, [offer]);
            }
        } else if (data.roomId) {
            // Room-based connection
            this.socket.broadcast.to(data.roomId).emit(this.socketEventsMapper.newOfferAwaiting, [offer]);
        } else if (data.userIds?.length) {
            // Multi-user connections
            data.userIds.forEach((userId) => {
                if (userId !== this.userId) {
                    const userSocketId = RTCPeerConnectionServer.connectedSockets[userId];
                    if (userSocketId) {
                        this.socket.to(userSocketId).emit(this.socketEventsMapper.newOfferAwaiting, [offer]);
                    }
                }
            });
        } else {
            // Broadcast to all users
            this.socket.broadcast.emit(this.socketEventsMapper.newOfferAwaiting, [offer]);
        }
    }

    private handleRoomOffer(offerData: {
        offer: RTCSessionDescriptionInit;
        targetUserId: string;
        roomId: string;
        offererUserId: string;
    }) {
        this.debug('Room offer received:', offerData);

        const room = RTCPeerConnectionServer.rooms.get(offerData.roomId);
        if (!room || !room.participants.includes(offerData.targetUserId)) {
            this.debug('Room not found or target user not in room');
            return;
        }

        const targetSocketId = RTCPeerConnectionServer.connectedSockets[offerData.targetUserId];
        if (targetSocketId) {
            this.socket.to(targetSocketId).emit('roomOffer', offerData);
        }
    }

    private handleNewAnswer(offerObj: Offer, ackFunction?: (iceCandidates: RTCIceCandidate[]) => void) {
        const socketIdToAnswer = RTCPeerConnectionServer.connectedSockets[offerObj.offererUserId];
        if (!socketIdToAnswer) {
            this.debug('No matching socket for offerer:', offerObj.offererUserId);
            return;
        }

        const offerToUpdate = RTCPeerConnectionServer.offers.find((o) => o.offererUserId === offerObj.offererUserId);
        if (!offerToUpdate) {
            this.debug('No offer to update found');
            return;
        }

        // Send back ICE candidates collected so far
        if (ackFunction) {
            ackFunction(offerToUpdate.offerIceCandidates);
        }

        offerToUpdate.answer = offerObj.answer;
        offerToUpdate.answererUserId = this.userId;

        // Send answer back to offerer
        this.socket.to(socketIdToAnswer).emit(this.socketEventsMapper.answerResponse, offerToUpdate);

        // Create reciprocal offer for bidirectional communication
        const answererOffer: Offer = {
            offererUserId: offerToUpdate.answererUserId,
            offer: offerToUpdate.answer as RTCSessionDescriptionInit,
            offerIceCandidates: offerToUpdate.answererIceCandidates,
            answererUserId: offerToUpdate.offererUserId,
            answer: offerToUpdate.offer,
            answererIceCandidates: offerToUpdate.offerIceCandidates,
        };

        this.socket.emit(this.socketEventsMapper.answerResponse, answererOffer);
        this.debug('Answer processed and sent');
    }

    private handleRoomAnswer(answerData: {
        answer: RTCSessionDescriptionInit;
        targetUserId: string;
        roomId: string;
        answererUserId: string;
    }) {
        this.debug('Room answer received:', answerData);

        const room = RTCPeerConnectionServer.rooms.get(answerData.roomId);
        if (!room || !room.participants.includes(answerData.targetUserId)) {
            this.debug('Room not found or target user not in room');
            return;
        }

        const targetSocketId = RTCPeerConnectionServer.connectedSockets[answerData.targetUserId];
        if (targetSocketId) {
            this.socket.to(targetSocketId).emit('roomAnswer', answerData);
        }
    }

    private handleIceCandidate(iceCandidateObj: IceCandidateOffer) {
        const { didIOffer, iceUserId, iceCandidate, targetUserId, roomId, senderUserId } = iceCandidateObj;

        this.debug('ICE candidate received:', {
            iceUserId,
            targetUserId,
            roomId,
            senderUserId,
            didIOffer,
        });

        // Priority 1: Direct targetUserId (P2P connection)
        if (targetUserId) {
            const targetSocketId = RTCPeerConnectionServer.connectedSockets[targetUserId];
            if (targetSocketId) {
                this.socket.to(targetSocketId).emit(this.socketEventsMapper.receivedIceCandidateFromServer, {
                    iceCandidate,
                    targetUserId: iceUserId,
                });
                this.debug('ICE candidate sent to specific user:', targetUserId);
                return;
            }
        }

        // Priority 2: Room-based routing (from iceCandidateObj or data)
        if (roomId) {
            const room = RTCPeerConnectionServer.rooms.get(roomId);
            if (room && room.participants.includes(iceUserId)) {
                // Send to all other participants in the room
                room.participants
                    .filter((userId) => userId !== iceUserId)
                    .forEach((userId) => {
                        const socketId = RTCPeerConnectionServer.connectedSockets[userId];
                        if (socketId) {
                            this.socket.to(socketId).emit(this.socketEventsMapper.receivedIceCandidateFromServer, {
                                iceCandidate,
                                targetUserId: iceUserId,
                            });
                        }
                    });
                this.debug('ICE candidate sent to room participants:', roomId);
                return;
            }
        }

        // Priority 3: Multi-user routing (from iceCandidateObj or data)
        if (targetUserId) {
            const socketId = RTCPeerConnectionServer.connectedSockets[targetUserId];
            if (socketId) {
                this.socket.to(socketId).emit(this.socketEventsMapper.receivedIceCandidateFromServer, {
                    iceCandidate,
                    targetUserId: iceUserId,
                });
            }
            this.debug('ICE candidate sent to specific users:', targetUserId);
            return;
        }

        // Fallback: Legacy offer-based routing
        if (didIOffer) {
            // From offerer to answerer
            const offerInOffers = RTCPeerConnectionServer.offers.find((o) => o.offererUserId === iceUserId);
            if (offerInOffers) {
                offerInOffers.offerIceCandidates.push(iceCandidate);

                if (offerInOffers.answererUserId) {
                    const socketIdToSendTo = RTCPeerConnectionServer.connectedSockets[offerInOffers.answererUserId];
                    if (socketIdToSendTo) {
                        this.socket
                            .to(socketIdToSendTo)
                            .emit(this.socketEventsMapper.receivedIceCandidateFromServer, iceCandidate);
                        this.debug('ICE candidate sent via legacy offer routing (offerer->answerer)');
                    }
                }
            }
        } else {
            // From answerer to offerer
            const offerInOffers = RTCPeerConnectionServer.offers.find((o) => o.answererUserId === iceUserId);
            if (offerInOffers?.offererUserId) {
                const socketIdToSendTo = RTCPeerConnectionServer.connectedSockets[offerInOffers.offererUserId];
                if (socketIdToSendTo) {
                    this.socket
                        .to(socketIdToSendTo)
                        .emit(this.socketEventsMapper.receivedIceCandidateFromServer, iceCandidate);
                    this.debug('ICE candidate sent via legacy offer routing (answerer->offerer)');
                }
            }
        }
    }

    private handleRoomIceCandidate(candidateData: {
        candidate: RTCIceCandidate;
        targetUserId: string;
        roomId: string;
        senderUserId: string;
    }) {
        this.debug('Room ICE candidate received:', candidateData);

        const room = RTCPeerConnectionServer.rooms.get(candidateData.roomId);
        if (!room || !room.participants.includes(candidateData.targetUserId)) {
            this.debug('Room not found or target user not in room');
            return;
        }

        const targetSocketId = RTCPeerConnectionServer.connectedSockets[candidateData.targetUserId];
        if (targetSocketId) {
            this.socket.to(targetSocketId).emit('roomIceCandidate', candidateData);
        }
    }

    private handleCreateRoom(
        roomData: {
            roomName: string;
            roomId?: string;
            maxParticipants?: number;
            isPrivate?: boolean;
            creatorUserId: string;
        },
        ackFunction: (response: any) => void
    ) {
        const roomId = roomData.roomId || this.generateRoomId();

        // Check if room already exists
        if (RTCPeerConnectionServer.rooms.has(roomId)) {
            ackFunction({ error: 'Room ID already exists' });
            return;
        }

        const room: RoomInfo = {
            roomId,
            roomName: roomData.roomName,
            isPrivate: roomData.isPrivate ?? false,
            maxParticipants: roomData.maxParticipants ?? 10,
            participants: [roomData.creatorUserId],
            creatorUserId: roomData.creatorUserId,
            createdAt: new Date(),
        };

        RTCPeerConnectionServer.rooms.set(roomId, room);

        // Join the socket to the room
        this.socket.join(roomId);

        this.debug('Room created:', roomId);
        ackFunction({
            roomId: room.roomId,
            roomName: room.roomName,
            maxParticipants: room.maxParticipants,
            participants: room.participants,
        });

        // Broadcast room list update
        this.broadcastRoomListUpdate();
    }

    private handleJoinRoom(data: { roomId: string; userId: string }, ackFunction: (response: any) => void) {
        const room = RTCPeerConnectionServer.rooms.get(data.roomId);

        if (!room) {
            ackFunction({ error: 'Room not found' });
            return;
        }

        if (room.participants.length >= room.maxParticipants) {
            ackFunction({ error: 'Room is full' });
            return;
        }

        if (room.participants.includes(data.userId)) {
            ackFunction({ error: 'User already in room' });
            return;
        }

        // Add user to room
        room.participants.push(data.userId);
        this.socket.join(data.roomId);

        this.debug('User joined room:', { userId: data.userId, roomId: data.roomId });

        ackFunction({
            roomId: room.roomId,
            roomName: room.roomName,
            maxParticipants: room.maxParticipants,
            participants: room.participants,
        });

        // Notify other participants
        this.socket.broadcast.to(data.roomId).emit('userJoinedRoom', {
            userId: data.userId,
            roomId: data.roomId,
        });

        // Broadcast room list update
        this.broadcastRoomListUpdate();
    }

    private handleLeaveRoom(data: { roomId: string; userId: string }, ackFunction?: (response: any) => void) {
        const room = RTCPeerConnectionServer.rooms.get(data.roomId);

        if (!room) {
            if (ackFunction) ackFunction({ error: 'Room not found' });
            return;
        }

        // Remove user from room
        const userIndex = room.participants.indexOf(data.userId);
        if (userIndex > -1) {
            room.participants.splice(userIndex, 1);
        }

        this.socket.leave(data.roomId);

        // If room is empty or creator left, delete the room
        if (room.participants.length === 0 || room.creatorUserId === data.userId) {
            RTCPeerConnectionServer.rooms.delete(data.roomId);
            this.socket.broadcast.to(data.roomId).emit('roomClosed', {
                roomId: data.roomId,
                reason: room.creatorUserId === data.userId ? 'Host left' : 'Room empty',
            });
        } else {
            // Notify other participants
            this.socket.broadcast.to(data.roomId).emit('userLeftRoom', {
                userId: data.userId,
                roomId: data.roomId,
            });
        }

        this.debug('User left room:', { userId: data.userId, roomId: data.roomId });

        if (ackFunction) {
            ackFunction({ success: true });
        }

        // Broadcast room list update
        this.broadcastRoomListUpdate();
    }

    private handleGetAvailableRooms(ackFunction: (rooms: RoomInfo[]) => void) {
        const publicRooms = Array.from(RTCPeerConnectionServer.rooms.values())
            .filter((room) => !room.isPrivate)
            .map((room) => ({
                roomId: room.roomId,
                roomName: room.roomName,
                isPrivate: room.isPrivate,
                maxParticipants: room.maxParticipants,
                participants: room.participants,
                creatorUserId: room.creatorUserId,
                createdAt: room.createdAt,
            }));

        ackFunction(publicRooms);
    }

    private handleDisconnect() {
        this.debug('User disconnecting:', this.userId);

        // Remove user from connected sockets
        this.removeSocketId(this.userId);

        // Remove user's offers
        const userOfferIndex = RTCPeerConnectionServer.offers.findIndex(
            (offer: Offer) => offer.offererUserId === this.userId
        );
        if (userOfferIndex >= 0) {
            RTCPeerConnectionServer.offers.splice(userOfferIndex, 1);
        }

        // Remove user from all rooms
        for (const [roomId, room] of RTCPeerConnectionServer.rooms.entries()) {
            const userIndex = room.participants.indexOf(this.userId);
            if (userIndex > -1) {
                this.handleLeaveRoom({ roomId, userId: this.userId });
            }
        }

        // Notify other users about disconnection
        this.socket.broadcast.emit('userDisconnected', this.userId);
    }

    private generateRoomId(): string {
        return Math.random().toString(36).substring(2, 9);
    }

    private broadcastRoomListUpdate() {
        const publicRooms = Array.from(RTCPeerConnectionServer.rooms.values()).filter((room) => !room.isPrivate);

        this.socket.broadcast.emit('availableRoomsUpdated', publicRooms);
    }

    // Static methods for server management
    static getAllConnectedUsers(): string[] {
        return Object.keys(RTCPeerConnectionServer.connectedSockets);
    }

    static getUserSocketId(userId: string): string | undefined {
        return RTCPeerConnectionServer.connectedSockets[userId];
    }

    static getAllRooms(): RoomInfo[] {
        return Array.from(RTCPeerConnectionServer.rooms.values());
    }

    static getRoom(roomId: string): RoomInfo | undefined {
        return RTCPeerConnectionServer.rooms.get(roomId);
    }

    static closeRoom(roomId: string): boolean {
        return RTCPeerConnectionServer.rooms.delete(roomId);
    }

    static getActiveOffersCount(): number {
        return RTCPeerConnectionServer.offers.length;
    }
}
