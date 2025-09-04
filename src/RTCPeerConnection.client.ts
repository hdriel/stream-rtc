import type { Socket } from 'socket.io-client';
import { type Offer, RTCPeerConnectionError, type SocketEventType } from './decs.ts';
import { PEER_CONFIGURATION, SOCKET_EVENTS } from './consts.ts';

export class RTCPeerConnectionClient {
    private readonly socket: Socket;
    public localStream: MediaStream | null = null;
    public remoteStream: MediaStream | null = null; //a var to hold the remote video stream
    public peerConnection: RTCPeerConnection | null = null; //the peerConnection that the two clients use to talk
    private readonly socketEventsMapper: SocketEventType;
    private readonly peerConfiguration: RTCConfiguration;
    private readonly localVideoEl: HTMLVideoElement;
    private readonly remoteVideoEl: HTMLVideoElement;
    private readonly offerCallBacks: Set<(offers: Offer[]) => void>;
    private readonly errorCallBacks: Set<(offers: Offer[]) => void>;
    public didIOffer: boolean = false;
    public userId: string = '';
    private readonly debugMode: any;

    constructor(
        socket: Socket,
        elements: { userId: string; localVideoEl: HTMLVideoElement; remoteVideoEl: HTMLVideoElement },
        options: {
            debugMode?: boolean;
            socketEventsMapper?: SocketEventType;
            peerConfiguration?: RTCConfiguration;
        } = { debugMode: false, socketEventsMapper: SOCKET_EVENTS, peerConfiguration: PEER_CONFIGURATION }
    ) {
        this.socket = socket;
        this.debugMode = options.debugMode;
        this.userId = elements.userId;
        this.localVideoEl = elements.localVideoEl;
        this.remoteVideoEl = elements.remoteVideoEl;
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

    public async call(constraints?: MediaStreamConstraints) {
        try {
            const stream = await this.fetchUserMedia(constraints);

            // peerConnection is all set with our STUN servers sent over
            await this.createPeerConnection();
            if (!this.peerConnection) throw new Error('Peer connection not found');

            this.debug('call creating offer...');
            const offer = await this.peerConnection.createOffer();
            this.debug('call offer', offer);

            this.debug('peerConnection.setLocalDescription', offer);
            await this.peerConnection.setLocalDescription(offer);
            this.didIOffer = true;

            this.debug(`socket.emit(${this.socketEventsMapper.newOffer})`, offer);
            this.socket.emit(this.socketEventsMapper.newOffer, offer);

            return stream;
        } catch (err: any) {
            console.error(err);
            throw err;
        }
    }

    public async answerOffer(offerObj: Offer, constraints?: MediaStreamConstraints) {
        await this.fetchUserMedia(constraints);

        await this.createPeerConnection(offerObj);
        if (!this.peerConnection) throw new Error('Peer connection not found');

        const answer = await this.peerConnection.createAnswer({}); //just to make the docs happy
        await this.peerConnection.setLocalDescription(answer); //this is CLIENT2, and CLIENT2 uses the answer as the localDesc

        console.log(offerObj);
        console.log(answer);

        // this.log(peerConnection.signalingState) //should be have-local-pranswer because CLIENT2 has set its local desc to it's answer (but it won't be)
        //add the answer to the offerObj so the server knows which offer this is related to

        offerObj.answer = answer;

        //emit the answer to the signaling server, so it can emit to CLIENT1
        //expect a response from the server with the already existing ICE candidates
        const offerIceCandidates = await this.socket.emitWithAck(this.socketEventsMapper.newAnswer, offerObj);

        offerIceCandidates?.forEach((c: RTCIceCandidate) => {
            this.peerConnection?.addIceCandidate(c);
            console.log('======Added Ice Candidate======');
        });

        console.log(offerIceCandidates);
    }

    private async addAnswer(offerObj: Offer) {
        //addAnswer is called in socketListeners when an answerResponse is emitted.
        //at this point, the offer and answer have been exchanged!
        //now CLIENT1 needs to set the remote
        await this.peerConnection?.setRemoteDescription(offerObj.answer as RTCSessionDescriptionInit);
        // this.log(peerConnection.signalingState)
    }

    private async fetchUserMedia(
        constraints: MediaStreamConstraints = {
            video: true, // audio: true,
        }
    ) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.localVideoEl.srcObject = stream;
            this.localStream = stream;

            return stream;
        } catch (err) {
            throw [RTCPeerConnectionError.fetchUserMedia, err];
        }
    }

    private async createPeerConnection(offerObj?: Offer) {
        return new Promise<void>(async (resolve) => {
            //RTCPeerConnection is the thing that creates the connection
            //we can pass a config object, and that config object can contain stun servers
            //which will fetch us ICE candidates
            this.peerConnection = new RTCPeerConnection(this.peerConfiguration);
            const peerConnection = this.peerConnection as RTCPeerConnection;

            this.remoteStream = new MediaStream();
            this.remoteVideoEl.srcObject = this.remoteStream;

            this.localStream?.getTracks().forEach((track) => {
                //add local tracks so that they can be sent once the connection is established
                peerConnection.addTrack(track, this.localStream as MediaStream);
            });

            peerConnection.addEventListener('signalingstatechange', (event) => {
                console.log(event);
                console.log(peerConnection.signalingState);
            });

            this.peerConnection.addEventListener('icecandidate', (e) => {
                console.log('........Ice candidate found!......');
                console.log(e);
                if (e.candidate) {
                    this.socket.emit(this.socketEventsMapper.sendIceCandidateToSignalingServer, {
                        iceCandidate: e.candidate,
                        iceUserName: this.userId,
                        didIOffer: this.didIOffer,
                    });
                }
            });

            this.peerConnection.addEventListener('track', (e) => {
                console.log('Got a track from the other peer!! How excting');
                console.log(e);
                e.streams[0].getTracks().forEach((track) => {
                    this.remoteStream?.addTrack(track);
                    console.log("Here's an exciting moment... fingers cross");
                });
            });

            if (offerObj) {
                //this won't be set when called from call();
                //will be set when we call from answerOffer()
                // this.log(peerConnection.signalingState) //should be stable because no setDesc has been run yet
                await peerConnection.setRemoteDescription(offerObj.offer as RTCSessionDescriptionInit);
                // this.log(peerConnection.signalingState) //should be have-remote-offer, because client2 has setRemoteDesc on the offer
            }

            resolve();
        });
    }

    private async addNewIceCandidate(iceCandidate: RTCIceCandidate) {
        await this.peerConnection?.addIceCandidate(iceCandidate);
        console.log('======Added Ice Candidate======');
    }

    public onError(cb: () => RTCPeerConnectionError) {
        this.errorCallBacks.add(cb);
    }
    public offError(cb: () => RTCPeerConnectionError) {
        this.errorCallBacks.delete(cb);
    }

    public onOffersReceived(cb: (offers: Offer[]) => void) {
        this.offerCallBacks.add(cb);
    }

    public offOffersReceived(cb: (offers: Offer[]) => void) {
        this.offerCallBacks.delete(cb);
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

        //on connection get all available offers and call createOfferEls
        this.socket.on(this.socketEventsMapper.availableOffers, (offers: Offer[]) => {
            this.debug(`socket.on(${this.socketEventsMapper.availableOffers}) offers =`, offers);
            for (const cb of [...this.offerCallBacks]) {
                if (typeof cb === 'function') {
                    this.debug(`socket.on(${this.socketEventsMapper.availableOffers}) fire cb function`, cb.name);
                    cb?.(offers);
                }
            }
        });

        //someone just made a new offer and we're already here - call createOfferEls
        this.socket.on(this.socketEventsMapper.newOfferAwaiting, (offers: Offer[]) => {
            this.debug(`socket.on(${this.socketEventsMapper.newOfferAwaiting}) offers =`, offers);
            for (const cb of [...this.offerCallBacks]) {
                if (typeof cb === 'function') {
                    this.debug(`socket.on(${this.socketEventsMapper.newOfferAwaiting}) fire cb function`, cb.name);
                    cb?.(offers);
                }
            }
        });
    }
}
