// RTCRoomClient.ts - מערכת חדרים עם WebRTC
import type { Socket } from 'socket.io-client';
import { RTCPeerConnectionError, type SocketEventType } from './decs.ts';
import { PEER_CONFIGURATION, SOCKET_EVENTS } from './consts.ts';

interface RoomInfo {
    roomId: string;
    roomName?: string;
    isHost: boolean;
    participants: string[];
    maxParticipants?: number;
}

interface PeerConnectionInfo {
    userId: string;
    peerConnection: RTCPeerConnection;
    remoteStream: MediaStream;
    isConnected: boolean;
}

export class RTCRoomClient {
    private readonly socket: Socket;
    public localStream: MediaStream | null = null;
    private readonly peerConnections: Map<string, PeerConnectionInfo> = new Map();
    private currentRoom: RoomInfo | null = null;

    private readonly DEFAULT_CONSTRAINTS: MediaStreamConstraints = { video: true, audio: true };
    // @ts-ignore
    private readonly socketEventsMapper: SocketEventType;
    private readonly peerConfiguration: RTCConfiguration;
    private readonly localVideoElement?: HTMLVideoElement;
    private readonly localVideoQuerySelector?: string;
    private readonly remoteVideoElements?: HTMLVideoElement[];
    private readonly remoteVideoQuerySelector?: string;

    // Event callbacks
    private readonly roomJoinedCallBacks: Set<(roomInfo: RoomInfo) => void>;
    private readonly roomLeftCallBacks: Set<(roomId: string) => void>;
    private readonly userJoinedRoomCallBacks: Set<(userId: string, roomId: string) => void>;
    private readonly userLeftRoomCallBacks: Set<(userId: string, roomId: string) => void>;
    private readonly remoteStreamAddedCallBacks: Set<(remoteStream: MediaStream, userId: string) => void>;
    private readonly errorCallBacks: Set<(error: Error, context?: string) => void>;
    private readonly roomListUpdatedCallBacks: Set<(rooms: RoomInfo[]) => void>;

    private readonly userId: string;
    private readonly debugMode: boolean;

    constructor(
        socket: Socket,
        elements: {
            userId: string;
            localVideoElement?: HTMLVideoElement;
            localVideoQuerySelector?: string;
            remoteVideoElement?: HTMLVideoElement | HTMLVideoElement[];
            remoteVideoElementsQuerySelector?: string;
        },
        options: {
            debugMode?: boolean;
            socketEventsMapper?: SocketEventType;
            peerConfiguration?: RTCConfiguration;
        } = {}
    ) {
        this.socket = socket;
        this.userId = elements.userId;
        this.localVideoElement = elements.localVideoElement;
        this.localVideoQuerySelector = elements.localVideoQuerySelector;

        // טיפול ב-remote video elements
        if (Array.isArray(elements.remoteVideoElement)) {
            this.remoteVideoElements = elements.remoteVideoElement;
        } else if (elements.remoteVideoElement) {
            this.remoteVideoElements = [elements.remoteVideoElement];
        } else {
            this.remoteVideoElements = [];
        }

        this.remoteVideoQuerySelector = elements.remoteVideoElementsQuerySelector;

        this.debugMode = options.debugMode ?? false;
        this.socketEventsMapper = options.socketEventsMapper || SOCKET_EVENTS;
        this.peerConfiguration = options.peerConfiguration || PEER_CONFIGURATION;

        this.roomJoinedCallBacks = new Set();
        this.roomLeftCallBacks = new Set();
        this.userJoinedRoomCallBacks = new Set();
        this.userLeftRoomCallBacks = new Set();
        this.remoteStreamAddedCallBacks = new Set();
        this.errorCallBacks = new Set();
        this.roomListUpdatedCallBacks = new Set();

        this.init();
    }

    public debug(...args: any[]) {
        if (!this.debugMode) return;
        console.debug(`[RoomClient-${this.userId}]`, ...args);
    }

    // יצירת חדר חדש
    public async createRoom(
        roomName: string,
        options: {
            maxParticipants?: number;
            roomId?: string;
            isPrivate?: boolean;
            constraints?: MediaStreamConstraints;
        } = {}
    ): Promise<RoomInfo> {
        if (this.currentRoom) {
            throw new Error(`Already in room ${this.currentRoom.roomId}. Leave current room first.`);
        }

        try {
            this.debug('Creating room:', roomName);

            // קבלת מדיה לפני יצירת החדר
            await this.initializeLocalStream(options.constraints);

            // שליחת בקשה ליצירת חדר
            const roomData = await this.socket.emitWithAck('createRoom', {
                roomName,
                roomId: options.roomId,
                maxParticipants: options.maxParticipants,
                isPrivate: options.isPrivate || false,
                creatorUserId: this.userId,
            });

            const roomInfo: RoomInfo = {
                roomId: roomData.roomId,
                roomName: roomData.roomName,
                isHost: true,
                participants: [this.userId],
                maxParticipants: roomData.maxParticipants,
            };

            this.currentRoom = roomInfo;
            this.debug('Room created successfully:', roomInfo);

            // הפעלת callbacks
            this.triggerRoomJoined(roomInfo);

            return roomInfo;
        } catch (error) {
            this.debug('Failed to create room:', error);
            this.handleError(error as Error, 'createRoom');
            throw error;
        }
    }

    // הצטרפות לחדר קיים
    public async joinRoom(roomId: string, constraints?: MediaStreamConstraints): Promise<RoomInfo> {
        if (this.currentRoom) {
            throw new Error(`Already in room ${this.currentRoom.roomId}. Leave current room first.`);
        }

        try {
            this.debug('Joining room:', roomId);

            // קבלת מדיה לפני הצטרפות לחדר
            await this.initializeLocalStream(constraints);

            // שליחת בקשה להצטרפות
            const roomData = await this.socket.emitWithAck('joinRoom', {
                roomId,
                userId: this.userId,
            });

            const roomInfo: RoomInfo = {
                roomId: roomData.roomId,
                roomName: roomData.roomName,
                isHost: false,
                participants: roomData.participants || [],
                maxParticipants: roomData.maxParticipants,
            };

            this.currentRoom = roomInfo;
            this.debug('Joined room successfully:', roomInfo);

            // יצירת קשרים עם משתתפים קיימים
            await this.connectToExistingParticipants(roomData.participants || []);

            // הפעלת callbacks
            this.triggerRoomJoined(roomInfo);

            return roomInfo;
        } catch (error) {
            this.debug('Failed to join room:', error);
            this.handleError(error as Error, 'joinRoom');
            throw error;
        }
    }

    // עזיבת חדר נוכחי
    public async leaveRoom(): Promise<void> {
        if (!this.currentRoom) {
            this.debug('Not in any room');
            return;
        }

        const roomId = this.currentRoom.roomId;

        try {
            this.debug('Leaving room:', roomId);

            // ניתוק כל הקשרים
            this.disconnectAllPeers();

            // הודעה לשרת על עזיבת החדר
            await this.socket.emitWithAck('leaveRoom', {
                roomId,
                userId: this.userId,
            });

            // ניקוי מצב מקומי
            const leftRoomId = this.currentRoom.roomId;
            this.currentRoom = null;

            // ניקוי stream מקומי
            if (this.localStream) {
                this.localStream.getTracks().forEach((track) => track.stop());
                this.localStream = null;
            }

            // ניקוי video elements
            this.clearVideoElements();

            this.debug('Left room successfully:', leftRoomId);
            this.triggerRoomLeft(leftRoomId);
        } catch (error) {
            this.debug('Error leaving room:', error);
            this.handleError(error as Error, 'leaveRoom');
            throw error;
        }
    }

    // קבלת רשימת חדרים זמינים
    public async getAvailableRooms(): Promise<RoomInfo[]> {
        try {
            const rooms = await this.socket.emitWithAck('getAvailableRooms');
            this.debug('Available rooms:', rooms);
            return rooms;
        } catch (error) {
            this.debug('Failed to get available rooms:', error);
            this.handleError(error as Error, 'getAvailableRooms');
            throw error;
        }
    }

    // אתחול stream מקומי
    private async initializeLocalStream(constraints?: MediaStreamConstraints): Promise<MediaStream> {
        if (this.localStream) {
            return this.localStream; // כבר יש stream
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints || this.DEFAULT_CONSTRAINTS);

            this.localStream = stream;
            this.attachLocalStream(stream);
            this.debug('Local stream initialized');

            return stream;
        } catch (error) {
            this.debug('Failed to get user media:', error);
            throw new RTCPeerConnectionError('Failed to get user media' + error);
        }
    }

    // התחברות למשתתפים קיימים בחדר
    private async connectToExistingParticipants(participants: string[]): Promise<void> {
        const otherParticipants = participants.filter((id) => id !== this.userId);

        this.debug('Connecting to existing participants:', otherParticipants);

        const connectionPromises = otherParticipants.map(async (userId) => {
            try {
                await this.createOfferConnection(userId);
            } catch (error) {
                this.debug(`Failed to connect to participant ${userId}:`, error);
                this.handleError(error as Error, `connectToParticipant-${userId}`);
            }
        });

        await Promise.allSettled(connectionPromises);
    }

    // יצירת offer connection למשתתף
    private async createOfferConnection(userId: string): Promise<MediaStream> {
        if (this.peerConnections.has(userId)) {
            this.debug(`Connection with user ${userId} already exists`);
            return this.peerConnections.get(userId)!.remoteStream;
        }

        const peerConnection = new RTCPeerConnection(this.peerConfiguration);
        const remoteStream = new MediaStream();

        const peerInfo: PeerConnectionInfo = {
            userId,
            peerConnection,
            remoteStream,
            isConnected: false,
        };

        this.peerConnections.set(userId, peerInfo);
        this.setupPeerConnectionHandlers(userId, peerConnection);
        this.attachRemoteStreamToVideo(remoteStream, userId);

        // הוספת local tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach((track) => {
                peerConnection.addTrack(track, this.localStream as MediaStream);
            });
        }

        // יצירת offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        this.debug(`Sending offer to user ${userId} in room ${this.currentRoom?.roomId}`);
        this.socket.emit('roomOffer', {
            offer,
            targetUserId: userId,
            roomId: this.currentRoom?.roomId,
            offererUserId: this.userId,
        });

        return remoteStream;
    }

    // מענה ל-offer מתוך חדר
    private async answerRoomOffer(offerData: {
        offer: RTCSessionDescriptionInit;
        offererUserId: string;
        roomId: string;
    }): Promise<void> {
        const { offer, offererUserId, roomId } = offerData;

        if (!this.currentRoom || this.currentRoom.roomId !== roomId) {
            this.debug(`Received offer for room ${roomId} but current room is ${this.currentRoom?.roomId}`);
            return;
        }

        if (this.peerConnections.has(offererUserId)) {
            this.debug(`Connection with user ${offererUserId} already exists`);
            return;
        }

        try {
            const peerConnection = new RTCPeerConnection(this.peerConfiguration);
            const remoteStream = new MediaStream();

            const peerInfo: PeerConnectionInfo = {
                userId: offererUserId,
                peerConnection,
                remoteStream,
                isConnected: false,
            };

            this.peerConnections.set(offererUserId, peerInfo);
            this.setupPeerConnectionHandlers(offererUserId, peerConnection);
            this.attachRemoteStreamToVideo(remoteStream, offererUserId);

            // הוספת local tracks
            if (this.localStream) {
                this.localStream.getTracks().forEach((track) => {
                    peerConnection.addTrack(track, this.localStream as MediaStream);
                });
            }

            // הגדרת remote description
            await peerConnection.setRemoteDescription(offer);

            // יצירת answer
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            this.debug(`Sending answer to user ${offererUserId} in room ${roomId}`);
            this.socket.emit('roomAnswer', {
                answer,
                targetUserId: offererUserId,
                roomId,
                answererUserId: this.userId,
            });
        } catch (error) {
            this.debug(`Failed to answer offer from user ${offererUserId}:`, error);
            this.handleError(error as Error, `answerOffer-${offererUserId}`);
        }
    }

    // התקנת handlers ל-peer connection
    private setupPeerConnectionHandlers(userId: string, peerConnection: RTCPeerConnection) {
        peerConnection.addEventListener('icecandidate', (event) => {
            if (event.candidate && this.currentRoom) {
                this.debug(`Sending ICE candidate to user ${userId} in room ${this.currentRoom.roomId}`);
                this.socket.emit('roomIceCandidate', {
                    candidate: event.candidate,
                    targetUserId: userId,
                    roomId: this.currentRoom.roomId,
                    senderUserId: this.userId,
                });
            }
        });

        peerConnection.addEventListener('track', (trackEvent) => {
            this.debug(`Received track from user ${userId}`);
            const peerInfo = this.peerConnections.get(userId);
            if (peerInfo) {
                trackEvent.streams[0]?.getTracks().forEach((track) => {
                    peerInfo.remoteStream.addTrack(track);
                });
            }
        });

        peerConnection.addEventListener('connectionstatechange', () => {
            const state = peerConnection.connectionState;
            this.debug(`Connection state with user ${userId} changed:`, state);

            const peerInfo = this.peerConnections.get(userId);
            if (peerInfo) {
                const wasConnected = peerInfo.isConnected;
                peerInfo.isConnected = state === 'connected';

                if (state === 'connected' && !wasConnected) {
                    this.triggerRemoteStreamAdded(peerInfo.remoteStream, userId);
                } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
                    this.handleParticipantDisconnected(userId);
                }
            }
        });

        peerConnection.addEventListener('signalingstatechange', () => {
            this.debug(`Signaling state with user ${userId}:`, peerConnection.signalingState);
        });
    }

    // הצמדת stream מקומי לוידאו element
    private attachLocalStream(stream: MediaStream) {
        if (this.localVideoElement) {
            this.localVideoElement.srcObject = stream;
        } else if (this.localVideoQuerySelector) {
            const localVideoEl = document.querySelector(this.localVideoQuerySelector) as HTMLVideoElement;
            if (localVideoEl) {
                localVideoEl.srcObject = stream;
            } else {
                console.warn(`Local video element not found: ${this.localVideoQuerySelector}`);
            }
        }
    }

    // הצמדת remote stream לוידאו element
    private attachRemoteStreamToVideo(stream: MediaStream, userId: string) {
        const peerIndex = Array.from(this.peerConnections.keys()).indexOf(userId);

        if (this.remoteVideoElements && this.remoteVideoElements[peerIndex]) {
            this.remoteVideoElements[peerIndex].setAttribute('data-user-id', userId);
            this.remoteVideoElements[peerIndex].srcObject = stream;
        } else if (this.remoteVideoQuerySelector) {
            const elements = document.querySelectorAll(this.remoteVideoQuerySelector);
            const videoElement = elements[peerIndex] as HTMLVideoElement;
            if (videoElement) {
                videoElement.setAttribute('data-user-id', userId);
                videoElement.srcObject = stream;
            } else {
                this.debug(`No available video element for user ${userId} at index ${peerIndex}`);
            }
        }
    }

    // ניקוי video elements
    private clearVideoElements() {
        if (this.localVideoElement) {
            this.localVideoElement.srcObject = null;
        }

        if (this.localVideoQuerySelector) {
            const localVideoEl = document.querySelector(this.localVideoQuerySelector) as HTMLVideoElement;
            if (localVideoEl) {
                localVideoEl.srcObject = null;
            }
        }

        // ניקוי remote video elements
        if (this.remoteVideoElements) {
            this.remoteVideoElements.forEach((el) => {
                el.srcObject = null;
                el.removeAttribute('data-user-id');
            });
        }

        if (this.remoteVideoQuerySelector) {
            const elements = document.querySelectorAll(this.remoteVideoQuerySelector);
            elements.forEach((el) => {
                (el as HTMLVideoElement).srcObject = null;
                el.removeAttribute('data-user-id');
            });
        }
    }

    // ניתוק כל ה-peers
    private disconnectAllPeers() {
        this.debug('Disconnecting all peers');

        for (const [_userId, peerInfo] of this.peerConnections) {
            peerInfo.peerConnection.close();
        }

        this.peerConnections.clear();
    }

    // טיפול בהתנתקות משתתף
    private handleParticipantDisconnected(userId: string) {
        this.debug(`Participant ${userId} disconnected`);

        const peerInfo = this.peerConnections.get(userId);
        if (peerInfo) {
            peerInfo.peerConnection.close();
            this.peerConnections.delete(userId);

            // ניקוי video element
            const videoElement = document.querySelector(`[data-user-id="${userId}"]`) as HTMLVideoElement;
            if (videoElement) {
                videoElement.srcObject = null;
                videoElement.removeAttribute('data-user-id');
            }

            // עדכון רשימת משתתפים
            if (this.currentRoom) {
                this.currentRoom.participants = this.currentRoom.participants.filter((id) => id !== userId);
            }

            this.triggerUserLeftRoom(userId, this.currentRoom?.roomId || '');
        }
    }

    // טיפול בשגיאות
    private handleError(error: any, context?: string) {
        this.debug('Error occurred:', error, context ? `in ${context}` : '');
        for (const cb of this.errorCallBacks) {
            try {
                cb(error, context);
            } catch (cbError) {
                console.error('Error in error callback:', cbError);
            }
        }
    }

    // הפעלת callbacks
    private triggerRoomJoined(roomInfo: RoomInfo) {
        for (const cb of this.roomJoinedCallBacks) {
            try {
                cb(roomInfo);
            } catch (error) {
                console.error('Error in room joined callback:', error);
            }
        }
    }

    private triggerRoomLeft(roomId: string) {
        for (const cb of this.roomLeftCallBacks) {
            try {
                cb(roomId);
            } catch (error) {
                console.error('Error in room left callback:', error);
            }
        }
    }

    private triggerUserJoinedRoom(userId: string, roomId: string) {
        for (const cb of this.userJoinedRoomCallBacks) {
            try {
                cb(userId, roomId);
            } catch (error) {
                console.error('Error in user joined room callback:', error);
            }
        }
    }

    private triggerUserLeftRoom(userId: string, roomId: string) {
        for (const cb of this.userLeftRoomCallBacks) {
            try {
                cb(userId, roomId);
            } catch (error) {
                console.error('Error in user left room callback:', error);
            }
        }
    }

    private triggerRemoteStreamAdded(stream: MediaStream, userId: string) {
        for (const cb of this.remoteStreamAddedCallBacks) {
            try {
                cb(stream, userId);
            } catch (error) {
                console.error('Error in remote stream callback:', error);
            }
        }
    }

    // מידע ופונקציות עזר
    public getCurrentRoom(): RoomInfo | null {
        return this.currentRoom;
    }

    public isInRoom(): boolean {
        return this.currentRoom !== null;
    }

    public getRoomParticipants(): string[] {
        return this.currentRoom?.participants || [];
    }

    public getConnectedParticipants(): string[] {
        return Array.from(this.peerConnections.values())
            .filter((peer) => peer.isConnected)
            .map((peer) => peer.userId);
    }

    public isParticipantConnected(userId: string): boolean {
        return this.peerConnections.get(userId)?.isConnected || false;
    }

    public getParticipantStream(userId: string): MediaStream | null {
        return this.peerConnections.get(userId)?.remoteStream || null;
    }

    // Event listeners
    public onRoomJoined(cb: (roomInfo: RoomInfo) => void) {
        this.roomJoinedCallBacks.add(cb);
    }

    public offRoomJoined(cb: (roomInfo: RoomInfo) => void) {
        this.roomJoinedCallBacks.delete(cb);
    }

    public onRoomLeft(cb: (roomId: string) => void) {
        this.roomLeftCallBacks.add(cb);
    }

    public offRoomLeft(cb: (roomId: string) => void) {
        this.roomLeftCallBacks.delete(cb);
    }

    public onUserJoinedRoom(cb: (userId: string, roomId: string) => void) {
        this.userJoinedRoomCallBacks.add(cb);
    }

    public offUserJoinedRoom(cb: (userId: string, roomId: string) => void) {
        this.userJoinedRoomCallBacks.delete(cb);
    }

    public onUserLeftRoom(cb: (userId: string, roomId: string) => void) {
        this.userLeftRoomCallBacks.add(cb);
    }

    public offUserLeftRoom(cb: (userId: string, roomId: string) => void) {
        this.userLeftRoomCallBacks.delete(cb);
    }

    public onRemoteStreamAdded(cb: (remoteStream: MediaStream, userId: string) => void) {
        this.remoteStreamAddedCallBacks.add(cb);
    }

    public offRemoteStreamAdded(cb: (remoteStream: MediaStream, userId: string) => void) {
        this.remoteStreamAddedCallBacks.delete(cb);
    }

    public onError(cb: (error: Error, context?: string) => void) {
        this.errorCallBacks.add(cb);
    }

    public offError(cb: (error: Error, context?: string) => void) {
        this.errorCallBacks.delete(cb);
    }

    public onRoomListUpdated(cb: (rooms: RoomInfo[]) => void) {
        this.roomListUpdatedCallBacks.add(cb);
    }

    public offRoomListUpdated(cb: (rooms: RoomInfo[]) => void) {
        this.roomListUpdatedCallBacks.delete(cb);
    }

    // אתחול event listeners
    private init() {
        // מענה ל-offer בחדר
        this.socket.on('roomOffer', async (offerData) => {
            this.debug('Received room offer:', offerData);
            await this.answerRoomOffer(offerData);
        });

        // קבלת answer לחדר
        this.socket.on(
            'roomAnswer',
            async (answerData: { answer: RTCSessionDescriptionInit; answererUserId: string; roomId: string }) => {
                this.debug('Received room answer:', answerData);
                const peerInfo = this.peerConnections.get(answerData.answererUserId);
                if (peerInfo && this.currentRoom?.roomId === answerData.roomId) {
                    await peerInfo.peerConnection.setRemoteDescription(answerData.answer);
                }
            }
        );

        // קבלת ICE candidates
        this.socket.on(
            'roomIceCandidate',
            async (candidateData: { candidate: RTCIceCandidate; senderUserId: string; roomId: string }) => {
                this.debug('Received room ICE candidate:', candidateData);
                const peerInfo = this.peerConnections.get(candidateData.senderUserId);
                if (peerInfo && this.currentRoom?.roomId === candidateData.roomId) {
                    await peerInfo.peerConnection.addIceCandidate(candidateData.candidate);
                }
            }
        );

        // משתתף חדש הצטרף לחדר
        this.socket.on('userJoinedRoom', async (data: { userId: string; roomId: string }) => {
            this.debug('User joined room:', data);

            if (this.currentRoom?.roomId === data.roomId && data.userId !== this.userId) {
                // עדכון רשימת משתתפים
                if (!this.currentRoom.participants.includes(data.userId)) {
                    this.currentRoom.participants.push(data.userId);
                }

                // יצירת חיבור עם המשתתף החדש (רק אם אנחנו לא המצטרף החדש)
                if (!this.peerConnections.has(data.userId)) {
                    try {
                        await this.createOfferConnection(data.userId);
                    } catch (error) {
                        this.debug(`Failed to connect to new participant ${data.userId}:`, error);
                    }
                }

                this.triggerUserJoinedRoom(data.userId, data.roomId);
            }
        });

        // משתתף עזב את החדר
        this.socket.on('userLeftRoom', (data: { userId: string; roomId: string }) => {
            this.debug('User left room:', data);

            if (this.currentRoom?.roomId === data.roomId && data.userId !== this.userId) {
                this.handleParticipantDisconnected(data.userId);
            }
        });

        // החדר נסגר
        this.socket.on('roomClosed', (data: { roomId: string; reason?: string }) => {
            this.debug('Room closed:', data);

            if (this.currentRoom?.roomId === data.roomId) {
                this.leaveRoom().catch((error) => {
                    this.debug('Error during forced room leave:', error);
                });
            }
        });

        // עדכון רשימת חדרים זמינים
        this.socket.on('availableRoomsUpdated', (rooms: RoomInfo[]) => {
            this.debug('Available rooms updated:', rooms);
            for (const cb of this.roomListUpdatedCallBacks) {
                cb(rooms);
            }
        });

        // טיפול בהתנתקות מהשרת
        this.socket.on('disconnect', () => {
            this.debug('Disconnected from server');
            if (this.currentRoom) {
                // ניקוי מצב מקומי בלבד
                this.disconnectAllPeers();
                this.currentRoom = null;
                if (this.localStream) {
                    this.localStream.getTracks().forEach((track) => track.stop());
                    this.localStream = null;
                }
                this.clearVideoElements();
            }
        });
    }
}
