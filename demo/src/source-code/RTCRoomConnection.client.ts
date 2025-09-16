// RTCRoomClient.ts - Room-based WebRTC system
import type { Socket } from 'socket.io-client';
import { RTCPeerConnectionError, type SocketEventType } from './decs.ts';
import { PEER_CONFIGURATION } from './consts.ts';

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

export class RTCRoomConnectionClient {
    private readonly socket: Socket;
    public localStream: MediaStream | null = null;
    private readonly peerConnections: Map<string, PeerConnectionInfo> = new Map();
    private currentRoom: RoomInfo | null = null;

    private readonly DEFAULT_CONSTRAINTS: MediaStreamConstraints = { video: true, audio: true };
    // private readonly socketEventsMapper: SocketEventType;
    private readonly peerConfiguration: RTCConfiguration;
    private readonly localVideoElement?: HTMLVideoElement;
    private readonly localVideoQuerySelector?: string;
    // private readonly remoteVideoElements?: HTMLVideoElement[];
    // private readonly remoteVideoQuerySelector?: string;
    private readonly videosContainer?: HTMLElement;
    private readonly videosContainerQuerySelector?: string;

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
            videosContainer?: HTMLElement;
            videosContainerQuerySelector?: string;
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

        // Handle remote video elements
        this.videosContainer = elements.videosContainer;
        this.videosContainerQuerySelector = elements.videosContainerQuerySelector || '#videos';

        this.debugMode = options.debugMode ?? false;
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

    // Create new room
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

            // Get media before creating room
            await this.initializeLocalStream(options.constraints);

            // Send room creation request
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

            // Trigger callbacks
            this.triggerRoomJoined(roomInfo);

            return roomInfo;
        } catch (error) {
            this.debug('Failed to create room:', error);
            this.handleError(error as Error, 'createRoom');
            throw error;
        }
    }

    // Join existing room
    public async joinRoom(roomId: string, constraints?: MediaStreamConstraints): Promise<RoomInfo> {
        if (this.currentRoom) {
            throw new Error(`Already in room ${this.currentRoom.roomId}. Leave current room first.`);
        }

        try {
            this.debug('Joining room:', roomId);

            // Get media before joining room
            await this.initializeLocalStream(constraints);

            // Send join request
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

            // Connect to existing participants
            await this.connectToExistingParticipants(roomData.participants || []);

            // Trigger callbacks
            this.triggerRoomJoined(roomInfo);

            return roomInfo;
        } catch (error) {
            this.debug('Failed to join room:', error);
            this.handleError(error as Error, 'joinRoom');
            throw error;
        }
    }

    // Leave current room
    public async leaveRoom(): Promise<void> {
        if (!this.currentRoom) {
            this.debug('Not in any room');
            return;
        }

        const roomId = this.currentRoom.roomId;

        try {
            this.debug('Leaving room:', roomId);

            // Disconnect all peers
            this.disconnectAllPeers();

            // Notify server about leaving
            await this.socket.emitWithAck('leaveRoom', {
                roomId,
                userId: this.userId,
            });

            // Clear local state
            const leftRoomId = this.currentRoom.roomId;
            this.currentRoom = null;

            // Stop local stream
            if (this.localStream) {
                this.localStream.getTracks().forEach((track) => track.stop());
                this.localStream = null;
            }

            // Clear video elements
            this.clearVideoElements();

            this.debug('Left room successfully:', leftRoomId);
            this.triggerRoomLeft(leftRoomId);
        } catch (error) {
            this.debug('Error leaving room:', error);
            this.handleError(error as Error, 'leaveRoom');
            throw error;
        }
    }

    // Get available rooms
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

    // Initialize local stream
    private async initializeLocalStream(constraints?: MediaStreamConstraints): Promise<MediaStream> {
        if (this.localStream) {
            return this.localStream; // Already have stream
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints || this.DEFAULT_CONSTRAINTS);

            this.localStream = stream;
            this.attachLocalStream(stream);
            this.debug('Local stream initialized');

            return stream;
        } catch (error) {
            this.debug('Failed to get user media:', error);
            throw new RTCPeerConnectionError('Failed to get user media: ' + error);
        }
    }

    // Connect to existing participants in room
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

    // Create offer connection to participant
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

        // Create video element immediately when creating connection
        this.createRemoteVideoElement(userId, remoteStream);

        // Add local tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach((track) => {
                peerConnection.addTrack(track, this.localStream as MediaStream);
            });
        }

        // Create offer
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

    // Answer room offer
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

            // Create video element immediately when answering offer
            this.createRemoteVideoElement(offererUserId, remoteStream);

            // Add local tracks
            if (this.localStream) {
                this.localStream.getTracks().forEach((track) => {
                    peerConnection.addTrack(track, this.localStream as MediaStream);
                });
            }

            // Set remote description
            await peerConnection.setRemoteDescription(offer);

            // Create answer
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

    // Setup peer connection event handlers
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

                // Update video element with new tracks
                this.updateRemoteVideoElement(userId, peerInfo.remoteStream);
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
                    this.debug(`Successfully connected to user ${userId}`);
                    this.triggerRemoteStreamAdded(peerInfo.remoteStream, userId);
                } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
                    this.debug(`Connection with user ${userId} ended: ${state}`);
                    this.handleParticipantDisconnected(userId);
                }
            }
        });

        peerConnection.addEventListener('signalingstatechange', () => {
            this.debug(`Signaling state with user ${userId}:`, peerConnection.signalingState);
        });
    }

    // Attach local stream to video element
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

    // Create remote video element dynamically
    private createRemoteVideoElement(userId: string, stream: MediaStream) {
        // Check if element already exists
        const existingElement = document.querySelector(`[data-user-id="${userId}"]`);
        if (existingElement) {
            this.debug(`Video element for user ${userId} already exists`);
            return;
        }

        // Get container
        let container = this.videosContainer;
        if (!container && this.videosContainerQuerySelector) {
            container = document.querySelector(this.videosContainerQuerySelector) as HTMLElement;
        }

        if (!container) {
            console.warn('No videos container found for remote video');
            return;
        }

        // Create video container
        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-container';
        videoContainer.id = `remote-video-${userId}`;
        videoContainer.setAttribute('data-user-id', userId);

        // Create video element
        const videoElement = document.createElement('video');
        videoElement.className = 'video-player';
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        videoElement.srcObject = stream;

        // Create label
        const labelElement = document.createElement('div');
        labelElement.className = 'video-label';
        labelElement.textContent = userId;

        // Assemble elements
        videoContainer.appendChild(videoElement);
        videoContainer.appendChild(labelElement);
        container.appendChild(videoContainer);

        this.debug(`Created video element for user ${userId}`);
    }

    // Update remote video element with new stream
    private updateRemoteVideoElement(userId: string, stream: MediaStream) {
        const videoElement = document.querySelector(`#remote-video-${userId} video`) as HTMLVideoElement;
        if (videoElement) {
            videoElement.srcObject = stream;
            this.debug(`Updated video element for user ${userId}`);
        }
    }

    // Remove remote video element
    private removeRemoteVideoElement(userId: string) {
        const videoContainer = document.querySelector(`#remote-video-${userId}`);
        if (videoContainer) {
            videoContainer.remove();
            this.debug(`Removed video element for user ${userId}`);
        }
    }

    // Clear all video elements
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

        // Remove all remote video elements
        const remoteVideoContainers = document.querySelectorAll(
            '.video-container[data-user-id]:not([data-user-id="' + this.userId + '"])'
        );
        remoteVideoContainers.forEach((container) => {
            container.remove();
        });
    }

    // Disconnect all peers
    private disconnectAllPeers() {
        this.debug('Disconnecting all peers');

        for (const [userId, peerInfo] of this.peerConnections) {
            peerInfo.peerConnection.close();
            this.removeRemoteVideoElement(userId);
        }

        this.peerConnections.clear();
    }

    // Handle participant disconnected
    private handleParticipantDisconnected(userId: string) {
        this.debug(`Participant ${userId} disconnected`);

        const peerInfo = this.peerConnections.get(userId);
        if (peerInfo) {
            peerInfo.peerConnection.close();
            this.peerConnections.delete(userId);
            this.removeRemoteVideoElement(userId);

            // Update room participants list
            if (this.currentRoom) {
                this.currentRoom.participants = this.currentRoom.participants.filter((id) => id !== userId);
            }

            this.triggerUserLeftRoom(userId, this.currentRoom?.roomId || '');
        }
    }

    // Error handling
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

    // Callback triggers
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

    // Public utility methods
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

    // Event listener methods
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

    // Initialize socket event handlers
    private init() {
        // Handle room offer
        this.socket.on('roomOffer', async (offerData) => {
            this.debug('Received room offer:', offerData);
            await this.answerRoomOffer(offerData);
        });

        // Handle room answer
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

        // Handle ICE candidates
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

        // Handle new participant joined
        this.socket.on('userJoinedRoom', async (data: { userId: string; roomId: string }) => {
            this.debug('User joined room:', data);

            if (this.currentRoom?.roomId === data.roomId && data.userId !== this.userId) {
                // Update participants list
                if (!this.currentRoom.participants.includes(data.userId)) {
                    this.currentRoom.participants.push(data.userId);
                }

                // Create connection with new participant (only if we don't already have one)
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

        // Handle participant left
        this.socket.on('userLeftRoom', (data: { userId: string; roomId: string }) => {
            this.debug('User left room:', data);

            if (this.currentRoom?.roomId === data.roomId && data.userId !== this.userId) {
                this.handleParticipantDisconnected(data.userId);
            }
        });

        // Handle room closed
        this.socket.on('roomClosed', (data: { roomId: string; reason?: string }) => {
            this.debug('Room closed:', data);

            if (this.currentRoom?.roomId === data.roomId) {
                this.leaveRoom().catch((error) => {
                    this.debug('Error during forced room leave:', error);
                });
            }
        });

        // Handle room list updates
        this.socket.on('availableRoomsUpdated', (rooms: RoomInfo[]) => {
            this.debug('Available rooms updated:', rooms);
            for (const cb of this.roomListUpdatedCallBacks) {
                cb(rooms);
            }
        });

        // Handle server disconnection
        this.socket.on('disconnect', () => {
            this.debug('Disconnected from server');
            if (this.currentRoom) {
                // Clean up local state only
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
