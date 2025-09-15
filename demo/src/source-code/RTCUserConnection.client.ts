import type { Socket } from 'socket.io-client';
import { type Offer, RTCPeerConnectionError, type SocketEventType } from './decs.ts';
import { PEER_CONFIGURATION, SOCKET_EVENTS } from './consts.ts';

export class RTCUserConnectionClient {
    private readonly socket: Socket;
    public localStream: MediaStream | null = null;
    public remoteStream: MediaStream | null = null;
    public peerConnection: RTCPeerConnection | null = null;
    private readonly DEFAULT_CONSTRAINTS: MediaStreamConstraints = { video: true, audio: true };
    private readonly socketEventsMapper: SocketEventType;
    private readonly peerConfiguration: RTCConfiguration;
    private readonly localVideoEl?: HTMLVideoElement;
    private readonly localVideoQuerySelector?: string;
    private readonly remoteVideoEl?: HTMLVideoElement;
    private readonly remoteVideoQuerySelector?: string;
    private readonly offerCallBacks: Set<(offer: Offer) => void>;
    private readonly errorCallBacks: Set<(error: any | RTCPeerConnectionError) => void>;
    private readonly remoteStreamAddedCallBacks: Set<(remoteStream: MediaStream) => void>;
    public didIOffer: boolean = false;
    public readonly userId: string;
    public targetUserId: string | null = null; // המשתמש שאיתו אנחנו מתחברים
    private readonly debugMode: boolean;

    constructor(
        socket: Socket,
        elements: {
            userId: string;
            localVideoEl?: HTMLVideoElement;
            localVideoQuerySelector?: string;
            remoteVideoEl?: HTMLVideoElement;
            remoteVideoQuerySelector?: string;
        },
        options: {
            debugMode?: boolean;
            socketEventsMapper?: SocketEventType;
            peerConfiguration?: RTCConfiguration;
        } = {}
    ) {
        this.socket = socket;
        this.userId = elements.userId;
        this.localVideoEl = elements.localVideoEl;
        this.localVideoQuerySelector = elements.localVideoQuerySelector;
        this.remoteVideoEl = elements.remoteVideoEl;
        this.remoteVideoQuerySelector = elements.remoteVideoQuerySelector;

        this.debugMode = options.debugMode ?? false;
        this.socketEventsMapper = options.socketEventsMapper || SOCKET_EVENTS;
        this.peerConfiguration = options.peerConfiguration || PEER_CONFIGURATION;

        this.offerCallBacks = new Set();
        this.errorCallBacks = new Set();
        this.remoteStreamAddedCallBacks = new Set();

        this.init();
    }

    public debug(...args: any[]) {
        if (!this.debugMode) return;
        console.debug(`[${this.userId}]`, ...args);
    }

    // יוצר קריאה למשתמש ספציפי
    public async callUser(
        targetUserId: string,
        constraints?: MediaStreamConstraints
    ): Promise<[MediaStream, MediaStream]> {
        if (this.targetUserId && this.targetUserId !== targetUserId) {
            throw new Error(`Already connected to user ${this.targetUserId}. Disconnect first.`);
        }

        this.targetUserId = targetUserId;

        try {
            this.debug('Starting call to user:', targetUserId);

            const localStream = await this.fetchUserMedia(constraints);
            const remoteStream = await this.createPeerConnection();

            if (!this.peerConnection) {
                throw new Error('Peer connection not found');
            }

            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            this.didIOffer = true;

            this.debug(`Sending offer to user ${targetUserId}`);
            this.socket.emit(this.socketEventsMapper.newOffer, offer, { targetUserId });

            return [localStream, remoteStream];
        } catch (err: any) {
            this.debug('Error in callUser:', err);
            this.handleError(err);
            throw err;
        }
    }

    public async answerOffer(
        offerObj: Offer,
        constraints?: MediaStreamConstraints
    ): Promise<[MediaStream, MediaStream]> {
        if (this.targetUserId && this.targetUserId !== offerObj.offererUserId) {
            throw new Error(`Already connected to different user`);
        }

        this.targetUserId = offerObj.offererUserId;

        try {
            this.debug('Answering offer from user:', this.targetUserId);

            const localStream = await this.fetchUserMedia(constraints);
            const remoteStream = await this.createPeerConnection(offerObj);

            if (!this.peerConnection) {
                throw new Error('Peer connection not found');
            }

            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            offerObj.answer = answer;
            offerObj.answererUserId = this.userId;

            this.debug('Sending answer to signaling server');
            const offerIceCandidates = await this.socket.emitWithAck(this.socketEventsMapper.newAnswer, offerObj);

            offerIceCandidates?.forEach((candidate: RTCIceCandidate) => {
                this.peerConnection?.addIceCandidate(candidate);
                this.debug('Added ICE candidate:', candidate);
            });

            return [localStream, remoteStream];
        } catch (err: any) {
            this.debug('Error in answerOffer:', err);
            this.handleError(err);
            throw err;
        }
    }

    private async addAnswer(offerObj: Offer) {
        if (!this.peerConnection || !offerObj.answer) return;

        this.debug('Adding answer from user:', offerObj.answererUserId);
        await this.peerConnection.setRemoteDescription(offerObj.answer as RTCSessionDescriptionInit);

        // להודיע שהחיבור מוכן
        if (this.remoteStream) {
            this.triggerRemoteStreamAdded(this.remoteStream);
        }
    }

    private async fetchUserMedia(constraints: MediaStreamConstraints = this.DEFAULT_CONSTRAINTS): Promise<MediaStream> {
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
        if (this.localVideoEl) {
            this.localVideoEl.srcObject = stream;
        } else if (this.localVideoQuerySelector) {
            const localVideoEl = document.querySelector(this.localVideoQuerySelector) as HTMLVideoElement;
            if (localVideoEl) {
                localVideoEl.srcObject = stream;
            } else {
                console.warn(`Local video element not found: ${this.localVideoQuerySelector}`);
            }
        }
    }

    private async createPeerConnection(offerObj?: Offer): Promise<MediaStream> {
        this.debug('Creating peer connection with configuration:', this.peerConfiguration);

        this.peerConnection = new RTCPeerConnection(this.peerConfiguration);
        this.remoteStream = new MediaStream();

        this.attachRemoteStream(this.remoteStream);
        this.setupPeerConnectionHandlers();

        // הוספת local tracks
        this.localStream?.getTracks().forEach((track) => {
            this.peerConnection!.addTrack(track, this.localStream as MediaStream);
        });

        // אם יש offer, צריך לעשות setRemoteDescription
        if (offerObj) {
            await this.peerConnection.setRemoteDescription(offerObj.offer as RTCSessionDescriptionInit);
        }

        return this.remoteStream;
    }

    private attachRemoteStream(stream: MediaStream) {
        if (this.remoteVideoEl) {
            this.remoteVideoEl.srcObject = stream;
        } else if (this.remoteVideoQuerySelector) {
            const remoteVideoEl = document.querySelector(this.remoteVideoQuerySelector) as HTMLVideoElement;
            if (remoteVideoEl) {
                remoteVideoEl.srcObject = stream;
            } else {
                console.warn(`Remote video element not found: ${this.remoteVideoQuerySelector}`);
            }
        }
    }

    private setupPeerConnectionHandlers() {
        if (!this.peerConnection) return;

        this.peerConnection.addEventListener('icecandidate', (event) => {
            if (event.candidate && this.targetUserId) {
                this.debug('Sending ICE candidate');
                this.socket.emit(this.socketEventsMapper.sendIceCandidateToSignalingServer, {
                    iceCandidate: event.candidate,
                    iceUserId: this.userId,
                    targetUserId: this.targetUserId,
                    didIOffer: this.didIOffer,
                });
            }
        });

        this.peerConnection.addEventListener('track', (trackEvent) => {
            this.debug('Received track from peer');
            trackEvent.streams[0]?.getTracks().forEach((track) => {
                this.remoteStream?.addTrack(track);
            });
        });

        this.peerConnection.addEventListener('signalingstatechange', () => {
            this.debug('Signaling state changed:', this.peerConnection?.signalingState);
        });

        this.peerConnection.addEventListener('connectionstatechange', () => {
            this.debug('Connection state changed:', this.peerConnection?.connectionState);
            if (this.peerConnection?.connectionState === 'failed') {
                this.handleError(new Error('Connection failed'));
            }
        });
    }

    private async addNewIceCandidate(iceCandidate: RTCIceCandidate) {
        if (this.peerConnection) {
            await this.peerConnection.addIceCandidate(iceCandidate);
            this.debug('Added ICE candidate:', iceCandidate);
        }
    }

    private handleError(error: any) {
        this.debug('Error occurred:', error);
        for (const cb of this.errorCallBacks) {
            try {
                cb(error);
            } catch (cbError) {
                console.error('Error in error callback:', cbError);
            }
        }
    }

    private triggerRemoteStreamAdded(stream: MediaStream) {
        for (const cb of this.remoteStreamAddedCallBacks) {
            try {
                cb(stream);
            } catch (cbError) {
                console.error('Error in remote stream callback:', cbError);
            }
        }
    }

    // Event listeners
    public onError(cb: (error: any | RTCPeerConnectionError) => void) {
        this.errorCallBacks.add(cb);
    }

    public offError(cb: (error: any | RTCPeerConnectionError) => void) {
        this.errorCallBacks.delete(cb);
    }

    public onOffersReceived(cb: (offer: Offer) => void) {
        this.offerCallBacks.add(cb);
    }

    public offOffersReceived(cb: (offer: Offer) => void) {
        this.offerCallBacks.delete(cb);
    }

    public onRemoteStreamAdded(cb: (remoteStream: MediaStream) => void) {
        this.remoteStreamAddedCallBacks.add(cb);
    }

    public offRemoteStreamAdded(cb: (remoteStream: MediaStream) => void) {
        this.remoteStreamAddedCallBacks.delete(cb);
    }

    // ניתוק
    public disconnect() {
        this.debug('Disconnecting from user:', this.targetUserId);

        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        if (this.localStream) {
            this.localStream.getTracks().forEach((track) => track.stop());
            this.localStream = null;
        }

        this.remoteStream = null;
        this.targetUserId = null;
        this.didIOffer = false;

        // לנקות את video elements
        if (this.localVideoEl) this.localVideoEl.srcObject = null;
        if (this.remoteVideoEl) this.remoteVideoEl.srcObject = null;
    }

    public get isConnected(): boolean {
        return this.peerConnection?.connectionState === 'connected';
    }

    public get connectionState(): RTCPeerConnectionState | null {
        return this.peerConnection?.connectionState || null;
    }

    private init() {
        this.socket.on(this.socketEventsMapper.answerResponse, async (offerObj: Offer) => {
            this.debug('Received answer response');
            await this.addAnswer(offerObj);
        });

        this.socket.on(
            this.socketEventsMapper.receivedIceCandidateFromServer,
            async (iceCandidate: RTCIceCandidate) => {
                this.debug('Received ICE candidate from server');
                await this.addNewIceCandidate(iceCandidate);
            }
        );

        this.socket.on(this.socketEventsMapper.availableOffers, (offers: Offer[]) => {
            this.debug('Received available offers:', offers.length);
            // מפעיל callbacks עבור כל offer בנפרד
            offers.forEach((offer) => {
                for (const cb of this.offerCallBacks) {
                    cb(offer);
                }
            });
        });

        this.socket.on(this.socketEventsMapper.newOfferAwaiting, (offers: Offer[]) => {
            this.debug('Received new offer waiting:', offers.length);
            // מפעיל callbacks עבור כל offer בנפרד
            offers.forEach((offer) => {
                for (const cb of this.offerCallBacks) {
                    cb(offer);
                }
            });
        });
    }
}
