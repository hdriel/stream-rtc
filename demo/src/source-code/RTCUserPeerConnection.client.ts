import type { Socket } from 'socket.io-client';
import { type Offer, RTCPeerConnectionError, type SocketEventType } from './decs.ts';
import { PEER_CONFIGURATION, SOCKET_EVENTS } from './consts.ts';

export class RTCUserPeerConnectionClient {
    private readonly socket: Socket;
    public localStream: MediaStream | null = null;
    public remoteStream: MediaStream | null = null; //a var to hold the remote video stream
    public peerConnection: RTCPeerConnection | null = null; //the peerConnection that the two clients use to talk
    private readonly DEFAULT_CONSTRAINTS: MediaStreamConstraints = { video: true, audio: false };
    private readonly socketEventsMapper: SocketEventType;
    private readonly peerConfiguration: RTCConfiguration;
    private readonly localVideoEl?: HTMLVideoElement;
    private readonly localVideoQuerySelector?: string;
    private readonly remoteVideoEl?: HTMLVideoElement;
    private readonly remoteVideoQuerySelector?: string;
    private readonly offerCallBacks: Set<(offers: Offer[]) => void>;
    private readonly errorCallBacks: Set<(offers: Offer[]) => void>;
    public didIOffer: boolean = false;
    public userId: string = '';
    private readonly debugMode: any;

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
        } = { debugMode: false, socketEventsMapper: SOCKET_EVENTS, peerConfiguration: PEER_CONFIGURATION }
    ) {
        this.socket = socket;
        this.userId = elements.userId;
        this.localVideoEl = elements.localVideoEl;
        this.localVideoQuerySelector = elements.localVideoQuerySelector;
        this.remoteVideoEl = elements.remoteVideoEl;
        this.remoteVideoQuerySelector = elements.remoteVideoQuerySelector;

        this.debugMode = options.debugMode;
        this.socketEventsMapper = options.socketEventsMapper || SOCKET_EVENTS;
        this.peerConfiguration = options.peerConfiguration || PEER_CONFIGURATION;

        this.offerCallBacks = new Set();
        this.errorCallBacks = new Set();

        this.init();
    }

    public debug(...args: any[]) {
        if (!this.debugMode) return;
        console.debug(...args);
    }

    public async call(constraints?: MediaStreamConstraints): Promise<[MediaStream, MediaStream]> {
        try {
            this.debug(
                'request for user permission to access for constraints:',
                constraints ?? this.DEFAULT_CONSTRAINTS
            );
            const localStream = await this.fetchUserMedia(constraints);

            this.debug('Create RTC Peer Connection');
            const remoteStream = await this.createPeerConnection();
            this.debug('peerConnection is all set with our STUN servers sent over');
            if (!this.peerConnection) {
                throw new Error('Peer connection not found');
            }

            this.debug('call creating offer...');
            const offer = await this.peerConnection.createOffer();
            this.debug('call offer', offer);

            this.debug('peerConnection.setLocalDescription', offer);
            await this.peerConnection.setLocalDescription(offer);
            this.didIOffer = true;

            this.debug(`socket.emit(${this.socketEventsMapper.newOffer})`, offer);
            this.socket.emit(this.socketEventsMapper.newOffer, offer);

            return [localStream, remoteStream];
        } catch (err: any) {
            console.error(err);
            throw err;
        }
    }

    public async answerOffer(
        offerObj: Offer,
        constraints?: MediaStreamConstraints
    ): Promise<[MediaStream, MediaStream]> {
        this.debug(
            'Answer offer! request for user permission to access for constraints:',
            constraints ?? this.DEFAULT_CONSTRAINTS
        );
        const localStream = await this.fetchUserMedia(constraints);

        this.debug('Create RTC Peer Connection - for answer with offer to setRemoteDescription');
        const removeStream = await this.createPeerConnection(offerObj);

        if (!this.peerConnection) {
            throw new Error('Peer connection not found');
        }

        const answer = await this.peerConnection.createAnswer({}); // empty object param just to make the docs happy
        this.debug('this is CLIENT2, and CLIENT2 uses the answer as the setLocalDescription');
        this.debug(
            `peerConnection.signalingState = ${this.peerConnection.signalingState}, if it's equal to 'have-local-pranswer' it's because CLIENT2 has set its setLocalDescription to it's answer`
        );
        await this.peerConnection.setLocalDescription(answer);
        this.debug('peerConnection.signalingState', this.peerConnection.signalingState);

        this.debug('add the answer to the offerObj so the server knows which offer this is related to');
        offerObj.answer = answer;

        this.debug(
            'emit the answer to the signaling server, so it can emit to CLIENT1 expect a response from the server with the already existing ICE candidates'
        );
        this.debug(`socket.emitWithAck(${this.socketEventsMapper.newAnswer}) offerObj=`, offerObj);
        const offerIceCandidates = await this.socket.emitWithAck(this.socketEventsMapper.newAnswer, offerObj);

        offerIceCandidates?.forEach((c: RTCIceCandidate) => {
            this.peerConnection?.addIceCandidate(c);
            this.debug('======Added Ice Candidate======', c);
        });

        this.debug('offerIceCandidates', offerIceCandidates);

        return [localStream, removeStream];
    }

    private async addAnswer(offerObj: Offer) {
        this.debug('addAnswer is called and at this point, the offer and answer have been exchanged');
        this.debug('now CLIENT1/Caller here needs to set the remote local string');
        this.debug('peerConnection.signalingState', this.peerConnection?.signalingState);
        await this.peerConnection?.setRemoteDescription(offerObj.answer as RTCSessionDescriptionInit);
        this.debug('peerConnection.signalingState', this.peerConnection?.signalingState);
    }

    private async fetchUserMedia(constraints: MediaStreamConstraints = this.DEFAULT_CONSTRAINTS) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.debug('got user permissions for access media devices');

            this.localStream = stream;

            if (this.localVideoEl) {
                this.localVideoEl.srcObject = stream;
            } else if (this.localVideoQuerySelector) {
                const localVideoEl: HTMLVideoElement | null = document.querySelector(this.localVideoQuerySelector);
                if (localVideoEl) {
                    localVideoEl.srcObject = stream;
                } else {
                    console.warn(
                        `NOTE: document.querySelector(${this.localVideoQuerySelector}) => null, video element not found!`
                    );
                    this.debug(
                        `NOTE: document.querySelector(${this.localVideoQuerySelector}) => null, video element not found!`
                    );
                }
            } else {
                this.debug(
                    `localVideoEl/localVideoQuerySelector element not set and not connecting to steam video tag element!`
                );
                console.warn(
                    `NOTE: The you dont provide any local stream elements, please make sure you connect the streams that returned form this function`
                );
            }

            return stream;
        } catch (err) {
            this.debug('user rejected permissions for access media devices');
            throw [RTCPeerConnectionError.fetchUserMedia, err];
        }
    }

    private async createPeerConnection(offerObj?: Offer) {
        this.debug('peerConnection fetch us ICE candidates with peerConfiguration:', this.peerConfiguration);
        this.peerConnection = new RTCPeerConnection(this.peerConfiguration);
        const peerConnection = this.peerConnection as RTCPeerConnection;
        this.debug('peerConnection initialized:', peerConnection.signalingState);

        this.remoteStream = new MediaStream();
        if (this.remoteVideoEl) this.remoteVideoEl.srcObject = this.remoteStream;
        else if (this.remoteVideoQuerySelector) {
            const remoteVideoEl: HTMLVideoElement | null = document.querySelector(this.remoteVideoQuerySelector);
            if (remoteVideoEl) {
                remoteVideoEl.srcObject = this.remoteStream;
            } else {
                console.warn(
                    `NOTE: document.querySelector(${this.remoteVideoQuerySelector}) => null, video element not found!`
                );
                this.debug(
                    `NOTE: document.querySelector(${this.remoteVideoQuerySelector}) => null, video element not found!`
                );
            }
        } else {
            this.debug(
                `remoteVideoEl/remoteVideoQuerySelector element not set and not connecting to steam video tag element!`
            );
            console.warn(
                `NOTE: The you dont provide any local stream elements, please make sure you connect the streams that returned form this function`
            );
        }

        this.localStream?.getTracks().forEach((track) => {
            // add local tracks so that they can be sent once the connection is established
            this.debug(`add local tracks so that they can be sent once the connection is established:`, track);
            peerConnection.addTrack(track, this.localStream as MediaStream);
        });

        peerConnection.addEventListener('signalingstatechange', () => {
            this.debug('peerConnection.signalingState:', peerConnection.signalingState);
        });

        this.peerConnection.addEventListener('icecandidate', (event) => {
            this.debug('........Ice candidate found!......');
            if (event.candidate) {
                this.debug(
                    `socket.emit(${this.socketEventsMapper.sendIceCandidateToSignalingServer}) [peerConnection.signalingState=${peerConnection.signalingState}]`
                );
                this.socket.emit(this.socketEventsMapper.sendIceCandidateToSignalingServer, {
                    iceCandidate: event.candidate,
                    iceUserName: this.userId,
                    didIOffer: this.didIOffer,
                });
            }
        });

        this.peerConnection.addEventListener('track', (trackEvent) => {
            this.debug('Got a track from the other peer!', trackEvent);
            trackEvent.streams[0].getTracks().forEach((track) => {
                this.remoteStream?.addTrack(track);
                this.debug('see something track data on remote stream video!!', track);
            });
        });

        if (offerObj) {
            this.debug('peerConnection.setRemoteDescription - will be set when we call from answerOffer');
            await peerConnection.setRemoteDescription(offerObj.offer as RTCSessionDescriptionInit);
            if (peerConnection.signalingState !== 'stable') {
                this.debug('peerConnection.signalingState', peerConnection.signalingState);
                this.debug('should be have-remote-offer, because client2 has setRemoteDesc on the offer');
            }
        }

        this.debug('peerConnection is all set with our STUN servers sent over');
        return this.remoteStream;
    }

    private async addNewIceCandidate(iceCandidate: RTCIceCandidate) {
        await this.peerConnection?.addIceCandidate(iceCandidate);
        this.debug('======Added Ice Candidate======', iceCandidate);
    }

    public onError(cb: (error: any | RTCPeerConnectionError) => void) {
        this.errorCallBacks.add(cb);
        this.debug('onError function callback added:', cb.name);
    }
    public offError(cb: (error: any | RTCPeerConnectionError) => void) {
        this.errorCallBacks.delete(cb);
        this.debug('onError function callback removed:', cb.name);
    }

    public onOffersReceived(cb: (offers: Offer[]) => void) {
        this.offerCallBacks.add(cb);
        this.debug('onOffersReceived function callback added to handle answerer for caller:', cb.name);
    }
    public offOffersReceived(cb: (offers: Offer[]) => void) {
        this.offerCallBacks.delete(cb);
        this.debug('onOffersReceived function callback removed:', cb.name);
    }

    private init() {
        this.socket.on(this.socketEventsMapper.answerResponse, async (offerObj: Offer) => {
            this.debug(`socket.on(${this.socketEventsMapper.answerResponse}) offerObj =`, offerObj);
            await this.addAnswer(offerObj);
        });

        this.socket.on(
            this.socketEventsMapper.receivedIceCandidateFromServer,
            async (iceCandidate: RTCIceCandidate) => {
                this.debug(
                    `socket.on(${this.socketEventsMapper.receivedIceCandidateFromServer}) iceCandidate =`,
                    iceCandidate
                );
                await this.addNewIceCandidate(iceCandidate);
            }
        );

        // on connection get all available offers and call createOfferEls
        this.socket.on(this.socketEventsMapper.availableOffers, (offers: Offer[]) => {
            this.debug(`socket.on(${this.socketEventsMapper.availableOffers}) offers =`, offers);
            this.debug(`on connection get all available offers and waiting for user to make call to answerOffer`);
            for (const cb of [...this.offerCallBacks]) {
                if (typeof cb === 'function') {
                    this.debug(
                        `socket.on(${this.socketEventsMapper.availableOffers}) fire onOffersReceived cb function`,
                        cb.name
                    );
                    cb?.(offers);
                }
            }
        });

        // someone just made a new offer and we're already here - call createOfferEls
        this.socket.on(this.socketEventsMapper.newOfferAwaiting, (offers: Offer[]) => {
            this.debug(`socket.on(${this.socketEventsMapper.newOfferAwaiting}) offers =`, offers);
            this.debug(
                `someone just made a new offer and we're already here, waiting for user to make call to answerOffer`
            );
            for (const cb of [...this.offerCallBacks]) {
                if (typeof cb === 'function') {
                    this.debug(
                        `socket.on(${this.socketEventsMapper.newOfferAwaiting}) fire onOffersReceived cb function`,
                        cb.name
                    );
                    cb?.(offers);
                }
            }
        });
    }
}
