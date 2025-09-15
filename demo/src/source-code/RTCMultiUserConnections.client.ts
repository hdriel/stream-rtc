import type { Socket } from 'socket.io-client';
import { type Offer, RTCPeerConnectionError, type SocketEventType } from './decs.ts';
import { PEER_CONFIGURATION, SOCKET_EVENTS } from './consts.ts';

interface PeerConnectionInfo {
    userId: string;
    peerConnection: RTCPeerConnection;
    remoteStream: MediaStream;
    isConnected: boolean;
}

export class RTCMultiUserConnectionsClient {
    private readonly socket: Socket;
    public localStream: MediaStream | null = null;
    private readonly peerConnections: Map<string, PeerConnectionInfo> = new Map();
    private readonly DEFAULT_CONSTRAINTS: MediaStreamConstraints = { video: true, audio: true };
    private readonly socketEventsMapper: SocketEventType;
    private readonly peerConfiguration: RTCConfiguration;
    private readonly localVideoElement?: HTMLVideoElement;
    private readonly localVideoQuerySelector?: string;
    private readonly remoteVideoElements?: HTMLVideoElement[];
    private readonly remoteVideoQuerySelector?: string;
    private readonly offerCallBacks: Set<(offers: Offer[]) => void>;
    private readonly errorCallBacks: Set<(error: Error, userId?: string) => void>;
    private readonly remoteStreamAddedCallBacks: Set<(remoteStream: MediaStream, userId: string) => void>;
    private readonly userDisconnectedCallBacks: Set<(userId: string) => void>;
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

        this.offerCallBacks = new Set();
        this.errorCallBacks = new Set();
        this.remoteStreamAddedCallBacks = new Set();
        this.userDisconnectedCallBacks = new Set();

        this.init();
    }

    public debug(...args: any[]) {
        if (!this.debugMode) return;
        console.debug(`[MultiPeer-${this.userId}]`, ...args);
    }

    // יצירת קריאה למשתמשים מרובים
    public async callUsers(
        userIds: string[],
        constraints?: MediaStreamConstraints
    ): Promise<{
        localStream: MediaStream;
        remoteStreams: Map<string, MediaStream>;
        errors: Map<string, Error>;
    }> {
        this.debug('Starting calls to users:', userIds);

        const localStream = await this.fetchUserMedia(constraints);
        const remoteStreams = new Map<string, MediaStream>();
        const errors = new Map<string, Error>();

        // יצירת peer connections בבאצ'ים
        const connectionPromises = userIds.map(async (userId) => {
            try {
                const remoteStream = await this.createOfferConnection(userId);
                remoteStreams.set(userId, remoteStream);
            } catch (error) {
                this.debug(`Failed to create connection with user ${userId}:`, error);
                errors.set(userId, error as Error);
                this.handleError(error as Error, userId);
            }
        });

        await Promise.allSettled(connectionPromises);

        return { localStream, remoteStreams, errors };
    }

    // מענה למספר offers
    public async answerOffers(
        offers: Offer[],
        constraints?: MediaStreamConstraints
    ): Promise<{
        localStream: MediaStream;
        remoteStreams: Map<string, MediaStream>;
        errors: Map<string, Error>;
    }> {
        this.debug(
            'Answering offers from users:',
            offers.map((o) => o.offererUserId)
        );

        const localStream = await this.fetchUserMedia(constraints);
        const remoteStreams = new Map<string, MediaStream>();
        const errors = new Map<string, Error>();

        // מענה לכל ה-offers בבאצ'ים
        const answerPromises = offers.map(async (offer) => {
            try {
                const remoteStream = await this.answerSingleOffer(offer);
                remoteStreams.set(offer.offererUserId, remoteStream);
            } catch (error) {
                this.debug(`Failed to answer offer from user ${offer.offererUserId}:`, error);
                errors.set(offer.offererUserId, error as Error);
                this.handleError(error as Error, offer.offererUserId);
            }
        });

        await Promise.allSettled(answerPromises);

        return { localStream, remoteStreams, errors };
    }

    private async createOfferConnection(userId: string): Promise<MediaStream> {
        if (this.peerConnections.has(userId)) {
            throw new Error(`Connection with user ${userId} already exists`);
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
        this.localStream?.getTracks().forEach((track) => {
            peerConnection.addTrack(track, this.localStream as MediaStream);
        });

        // יצירת offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        this.debug(`Sending offer to user ${userId}`);
        this.socket.emit(this.socketEventsMapper.newOffer, offer, { targetUserId: userId });

        return remoteStream;
    }

    private async answerSingleOffer(offerObj: Offer): Promise<MediaStream> {
        const userId = offerObj.offererUserId;

        if (this.peerConnections.has(userId)) {
            throw new Error(`Connection with user ${userId} already exists`);
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
        this.localStream?.getTracks().forEach((track) => {
            peerConnection.addTrack(track, this.localStream as MediaStream);
        });

        // הגדרת remote description
        await peerConnection.setRemoteDescription(offerObj.offer as RTCSessionDescriptionInit);

        // יצירת answer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        offerObj.answer = answer;
        offerObj.answererUserId = this.userId;

        this.debug(`Sending answer to user ${userId}`);
        const offerIceCandidates = await this.socket.emitWithAck(this.socketEventsMapper.newAnswer, offerObj);

        // הוספת ICE candidates
        offerIceCandidates?.forEach((candidate: RTCIceCandidate) => {
            peerConnection.addIceCandidate(candidate);
            this.debug(`Added ICE candidate for user ${userId}`);
        });

        return remoteStream;
    }

    private attachRemoteStreamToVideo(stream: MediaStream, userId: string) {
        // מציאת אלמנט וידיאו פנוי
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
                console.warn(`No available video element for user ${userId}`);
            }
        }
    }

    private setupPeerConnectionHandlers(userId: string, peerConnection: RTCPeerConnection) {
        peerConnection.addEventListener('icecandidate', (event) => {
            if (event.candidate) {
                this.debug(`Sending ICE candidate for user ${userId}`);
                this.socket.emit(this.socketEventsMapper.sendIceCandidateToSignalingServer, {
                    iceCandidate: event.candidate,
                    iceUserId: this.userId,
                    targetUserId: userId,
                    didIOffer: true, // במקרה של multi-peer connection, אנחנו תמיד callers
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
                peerInfo.isConnected = state === 'connected';

                if (state === 'connected') {
                    this.triggerRemoteStreamAdded(peerInfo.remoteStream, userId);
                } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
                    this.handleUserDisconnected(userId);
                }
            }
        });

        peerConnection.addEventListener('signalingstatechange', () => {
            this.debug(`Signaling state with user ${userId} changed:`, peerConnection.signalingState);
        });
    }

    private async fetchUserMedia(constraints: MediaStreamConstraints = this.DEFAULT_CONSTRAINTS): Promise<MediaStream> {
        if (this.localStream) {
            return this.localStream; // כבר יש לנו stream
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.debug('Got user media permissions');
            this.localStream = stream;
            this.attachLocalStream(stream);
            return stream;
        } catch (err: any) {
            this.debug('User rejected media permissions');
            throw new RTCPeerConnectionError('Failed to get user media', err);
        }
    }

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

    private async addAnswer(offerObj: Offer) {
        const userId = offerObj.answererUserId;
        const peerInfo = this.peerConnections.get(userId);

        if (!peerInfo || !offerObj.answer) return;

        this.debug(`Adding answer from user ${userId}`);
        await peerInfo.peerConnection.setRemoteDescription(offerObj.answer as RTCSessionDescriptionInit);
    }

    private async addNewIceCandidate(iceCandidate: RTCIceCandidate, targetUserId?: string) {
        if (targetUserId) {
            const peerInfo = this.peerConnections.get(targetUserId);
            if (peerInfo) {
                await peerInfo.peerConnection.addIceCandidate(iceCandidate);
                this.debug(`Added ICE candidate for user ${targetUserId}`);
            }
        } else {
            // אם אין target ספציפי, מוסיף לכל הקשרים (backward compatibility)
            const promises = Array.from(this.peerConnections.values()).map(async (peerInfo) => {
                await peerInfo.peerConnection.addIceCandidate(iceCandidate);
            });
            await Promise.allSettled(promises);
            this.debug('Added ICE candidate to all connections');
        }
    }

    private handleError(error: any, userId?: string) {
        this.debug('Error occurred:', error, userId ? `for user ${userId}` : '');
        for (const cb of this.errorCallBacks) {
            try {
                cb(error, userId);
            } catch (cbError) {
                console.error('Error in error callback:', cbError);
            }
        }
    }

    private triggerRemoteStreamAdded(stream: MediaStream, userId: string) {
        for (const cb of this.remoteStreamAddedCallBacks) {
            try {
                cb(stream, userId);
            } catch (cbError) {
                console.error('Error in remote stream callback:', cbError);
            }
        }
    }

    private handleUserDisconnected(userId: string) {
        this.debug(`User ${userId} disconnected`);
        for (const cb of this.userDisconnectedCallBacks) {
            try {
                cb(userId);
            } catch (cbError) {
                console.error('Error in user disconnected callback:', cbError);
            }
        }
    }

    // ניהול קשרים
    public disconnectUser(userId: string) {
        const peerInfo = this.peerConnections.get(userId);
        if (peerInfo) {
            this.debug(`Disconnecting user ${userId}`);
            peerInfo.peerConnection.close();
            this.peerConnections.delete(userId);

            // ניקוי video element
            const videoElements = document.querySelectorAll(`[data-user-id="${userId}"]`);
            videoElements.forEach((el) => {
                (el as HTMLVideoElement).srcObject = null;
                el.removeAttribute('data-user-id');
            });
        }
    }

    public disconnectAll() {
        this.debug('Disconnecting all users');

        for (const [_userId, peerInfo] of this.peerConnections) {
            peerInfo.peerConnection.close();
        }

        this.peerConnections.clear();

        if (this.localStream) {
            this.localStream.getTracks().forEach((track) => track.stop());
            this.localStream = null;
        }

        // ניקוי כל video elements
        if (this.localVideoElement) this.localVideoElement.srcObject = null;
        if (this.remoteVideoElements) {
            this.remoteVideoElements.forEach((el) => {
                el.srcObject = null;
                el.removeAttribute('data-user-id');
            });
        }
    }

    // גישה למידע
    public getConnectedUsers(): string[] {
        return Array.from(this.peerConnections.keys()).filter(
            (userId) => this.peerConnections.get(userId)?.isConnected
        );
    }

    public getConnectionState(userId: string): RTCPeerConnectionState | null {
        return this.peerConnections.get(userId)?.peerConnection.connectionState || null;
    }

    public isUserConnected(userId: string): boolean {
        return this.peerConnections.get(userId)?.isConnected || false;
    }

    public getTotalConnections(): number {
        return this.peerConnections.size;
    }

    public getRemoteStream(userId: string): MediaStream | null {
        return this.peerConnections.get(userId)?.remoteStream || null;
    }

    // Event listeners
    public onError(cb: (error: Error, userId?: string) => void) {
        this.errorCallBacks.add(cb);
    }

    public offError(cb: (error: Error, userId?: string) => void) {
        this.errorCallBacks.delete(cb);
    }

    public onOffersReceived(cb: (offers: Offer[]) => void) {
        this.offerCallBacks.add(cb);
    }

    public offOffersReceived(cb: (offers: Offer[]) => void) {
        this.offerCallBacks.delete(cb);
    }

    public onRemoteStreamAdded(cb: (remoteStream: MediaStream, userId: string) => void) {
        this.remoteStreamAddedCallBacks.add(cb);
    }

    public offRemoteStreamAdded(cb: (remoteStream: MediaStream, userId: string) => void) {
        this.remoteStreamAddedCallBacks.delete(cb);
    }

    public onUserDisconnected(cb: (userId: string) => void) {
        this.userDisconnectedCallBacks.add(cb);
    }

    public offUserDisconnected(cb: (userId: string) => void) {
        this.userDisconnectedCallBacks.delete(cb);
    }

    private init() {
        this.socket.on(this.socketEventsMapper.answerResponse, async (offerObj: Offer) => {
            this.debug('Received answer response from user:', offerObj.answererUserId);
            await this.addAnswer(offerObj);
        });

        this.socket.on(
            this.socketEventsMapper.receivedIceCandidateFromServer,
            async (data: { iceCandidate: RTCIceCandidate; targetUserId?: string }) => {
                this.debug('Received ICE candidate from server');
                await this.addNewIceCandidate(data.iceCandidate, data.targetUserId);
            }
        );

        this.socket.on(this.socketEventsMapper.availableOffers, (offers: Offer[]) => {
            this.debug('Received available offers:', offers.length);
            for (const cb of this.offerCallBacks) {
                cb(offers);
            }
        });

        this.socket.on(this.socketEventsMapper.newOfferAwaiting, (offers: Offer[]) => {
            this.debug('Received new offer waiting:', offers.length);
            for (const cb of this.offerCallBacks) {
                cb(offers);
            }
        });

        // טיפול במשתמשים שמתנתקים
        this.socket.on('userDisconnected', (userId: string) => {
            this.debug('User disconnected:', userId);
            this.disconnectUser(userId);
            this.handleUserDisconnected(userId);
        });
    }
}
