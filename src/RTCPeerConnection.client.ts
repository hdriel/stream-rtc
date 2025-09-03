import type { Socket } from 'socket.io-client';
import type { Offer, SocketEventType } from './decs.ts';
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
    public didIOffer: boolean = false;
    public userId: string = '';

    constructor(
        socket: Socket,
        elements: { userId: string; localVideoEl: HTMLVideoElement; remoteVideoEl: HTMLVideoElement },
        options: {
            socketEventsMapper?: SocketEventType;
            peerConfiguration?: RTCConfiguration;
        } = { socketEventsMapper: SOCKET_EVENTS, peerConfiguration: PEER_CONFIGURATION }
    ) {
        this.socket = socket;
        this.userId = elements.userId;
        this.localVideoEl = elements.localVideoEl;
        this.remoteVideoEl = elements.remoteVideoEl;
        this.socketEventsMapper = options.socketEventsMapper || SOCKET_EVENTS;
        this.peerConfiguration = options.peerConfiguration || PEER_CONFIGURATION;
        this.offerCallBacks = new Set();

        this.init();
    }

    async call(constraints?: MediaStreamConstraints) {
        try {
            await this.fetchUserMedia(constraints);

            // peerConnection is all set with our STUN servers sent over
            await this.createPeerConnection();
            if (!this.peerConnection) throw new Error('Peer connection not found');

            console.log('Creating offer...');
            const offer = await this.peerConnection.createOffer();
            console.log(offer);

            await this.peerConnection.setLocalDescription(offer);
            this.didIOffer = true;

            this.socket.emit(this.socketEventsMapper.newOffer, offer); //send offer to signalingServer
        } catch (err) {
            console.log(err);
        }
    }

    async answerOffer(offerObj: Offer, constraints?: MediaStreamConstraints) {
        await this.fetchUserMedia(constraints);
        await this.createPeerConnection(offerObj);
        if (!this.peerConnection) throw new Error('Peer connection not found');

        const answer = await this.peerConnection.createAnswer({}); //just to make the docs happy
        await this.peerConnection.setLocalDescription(answer); //this is CLIENT2, and CLIENT2 uses the answer as the localDesc

        console.log(offerObj);
        console.log(answer);

        // console.log(peerConnection.signalingState) //should be have-local-pranswer because CLIENT2 has set its local desc to it's answer (but it won't be)
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
        // console.log(peerConnection.signalingState)
    }

    private async fetchUserMedia(
        constraints: MediaStreamConstraints = {
            video: true, // audio: true,
        }
    ) {
        return new Promise<void>(async (resolve, reject) => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                this.localVideoEl.srcObject = stream;
                this.localStream = stream;

                resolve();
            } catch (err) {
                console.log(err);
                reject();
            }
        });
    }

    private async createPeerConnection(offerObj?: Offer) {
        return new Promise<void>(async (resolve) => {
            //RTCPeerConnection is the thing that creates the connection
            //we can pass a config object, and that config object can contain stun servers
            //which will fetch us ICE candidates
            this.peerConnection = await new RTCPeerConnection(this.peerConfiguration);
            const peerConnection = this.peerConnection as RTCPeerConnection;

            this.remoteStream = new MediaStream();
            this.remoteVideoEl.srcObject = this.remoteStream;

            this.localStream?.getTracks().forEach((track) => {
                //add localtracks so that they can be sent once the connection is established
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
                // console.log(peerConnection.signalingState) //should be stable because no setDesc has been run yet
                await peerConnection.setRemoteDescription(offerObj.offer as RTCSessionDescriptionInit);
                // console.log(peerConnection.signalingState) //should be have-remote-offer, because client2 has setRemoteDesc on the offer
            }

            resolve();
        });
    }

    private async addNewIceCandidate(iceCandidate: RTCIceCandidate) {
        await this.peerConnection?.addIceCandidate(iceCandidate);
        console.log('======Added Ice Candidate======');
    }

    onOffersReceivedCB(cb: (offers: Offer[]) => void) {
        this.offerCallBacks.add(cb);
    }

    offOffersReceivedCB(cb: (offers: Offer[]) => void) {
        this.offerCallBacks.delete(cb);
    }

    private init() {
        this.socket.on(this.socketEventsMapper.answerResponse, async (offerObj: Offer) => {
            console.log(offerObj);
            await this.addAnswer(offerObj);
        });

        this.socket.on(
            this.socketEventsMapper.receivedIceCandidateFromServer,
            async (iceCandidate: RTCIceCandidate) => {
                await this.addNewIceCandidate(iceCandidate);
                console.log(iceCandidate);
            }
        );

        //on connection get all available offers and call createOfferEls
        this.socket.on(this.socketEventsMapper.availableOffers, (offers: Offer[]) => {
            console.log(offers);
            for (const cb of [...this.offerCallBacks]) {
                cb?.(offers);
            }
        });

        //someone just made a new offer and we're already here - call createOfferEls
        this.socket.on(this.socketEventsMapper.newOfferAwaiting, (offers: Offer[]) => {
            for (const cb of [...this.offerCallBacks]) {
                cb?.(offers);
            }
        });
    }
}
