import { Socket as SocketIO } from 'socket.io';
import { Socket } from 'socket.io-client';
import { v4 as uuid } from 'uuid';

type EVENT_NAME =
    | 'newOffer'
    | 'newAnswer'
    | 'sendIceCandidateToSignalingServer'
    | 'receivedIceCandidateFromServer'
    | 'newOfferAwaiting'
    | 'answerResponse'
    | 'availableOffers';

type SocketEventType = Record<EVENT_NAME, string>;
const SOCKET_EVENTS: SocketEventType = {
    newOffer: 'newOffer',
    newAnswer: 'newAnswer',
    sendIceCandidateToSignalingServer: 'sendIceCandidateToSignalingServer',
    receivedIceCandidateFromServer: 'receivedIceCandidateFromServer',
    newOfferAwaiting: 'newOfferAwaiting',
    answerResponse: 'answerResponse',
    availableOffers: 'availableOffers',
};
export interface Offer {
    offererUserName: string;
    offer: RTCSessionDescriptionInit;
    offerIceCandidates: any[];
    answererUserName: string;
    answer: null | RTCSessionDescriptionInit;
    answererIceCandidates: any[];
}

const PEER_CONFIGURATION: RTCConfiguration = {
    iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
};

export class RTCPeerConnectionClient {
    public localStream: MediaStream | null = null;
    public remoteStream: MediaStream | null = null; //a var to hold the remote video stream
    public peerConnection: RTCPeerConnection | null = null; //the peerConnection that the two clients use to talk
    private readonly socketEventsMapper: SocketEventType;
    private readonly peerConfiguration: RTCConfiguration;
    private readonly localVideoEl: HTMLVideoElement;
    private readonly remoteVideoEl: HTMLVideoElement;
    public didIOffer: boolean = false;
    public userName: string = '';

    constructor(
        private readonly socket: Socket,
        elements: { localVideoEl: HTMLVideoElement; remoteVideoEl: HTMLVideoElement },
        options: {
            userName?: string;
            createOfferCB?: (offers: Offer[]) => void;
            socketEventsMapper?: SocketEventType;
            peerConfiguration?: RTCConfiguration;
        } = { socketEventsMapper: SOCKET_EVENTS, peerConfiguration: PEER_CONFIGURATION }
    ) {
        this.userName = options.userName ?? uuid();
        this.localVideoEl = elements.localVideoEl;
        this.remoteVideoEl = elements.remoteVideoEl;
        this.socketEventsMapper = options.socketEventsMapper || SOCKET_EVENTS;
        this.peerConfiguration = options.peerConfiguration || PEER_CONFIGURATION;

        this.init(options.createOfferCB);
    }

    async call() {
        try {
            await this.fetchUserMedia();

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

    async answerOffer(offerObj: Offer) {
        await this.fetchUserMedia();
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

    async addAnswer(offerObj: Offer) {
        //addAnswer is called in socketListeners when an answerResponse is emitted.
        //at this point, the offer and answer have been exchanged!
        //now CLIENT1 needs to set the remote
        await this.peerConnection?.setRemoteDescription(offerObj.answer as RTCSessionDescriptionInit);
        // console.log(peerConnection.signalingState)
    }

    async fetchUserMedia(
        constraints: MediaStreamConstraints = {
            video: true,
            // audio: true,
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

    async createPeerConnection(offerObj?: Offer) {
        return new Promise<void>(async (resolve, reject) => {
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
                        iceUserName: this.userName,
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

    async addNewIceCandidate(iceCandidate: RTCIceCandidate) {
        await this.peerConnection?.addIceCandidate(iceCandidate);
        console.log('======Added Ice Candidate======');
    }

    init(createOfferCB?: (offers: Offer[]) => void) {
        this.socket.on('answerResponse', async (offerObj: Offer) => {
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
        this.socket.on('availableOffers', (offers: Offer[]) => {
            console.log(offers);
            createOfferCB?.(offers);
        });

        //someone just made a new offer and we're already here - call createOfferEls
        this.socket.on('newOfferAwaiting', (offers: Offer[]) => {
            createOfferCB?.(offers);
        });
    }
}

export class RTCPeerConnectionServer {
    //offers will contain {}
    private static readonly offers: Offer[] = [];
    private static connectedSockets: Array<{ userName: string; socketId: string }> = [];
    private readonly userName: string = '';
    private readonly socketEventsMapper: SocketEventType;

    constructor(
        private socket: SocketIO,
        options: { socketEventsMapper?: SocketEventType } = { socketEventsMapper: SOCKET_EVENTS }
    ) {
        this.userName = socket.handshake.auth.userName;
        this.socketEventsMapper = options.socketEventsMapper || SOCKET_EVENTS;
        RTCPeerConnectionServer.connectedSockets.push({
            socketId: socket.id,
            userName: this.userName,
        });

        if (RTCPeerConnectionServer.offers.length) {
            socket.emit(this.socketEventsMapper.availableOffers, RTCPeerConnectionServer.offers);
        }
    }

    init() {
        this.socket.on(this.socketEventsMapper.newOffer, (newOffer) => {
            RTCPeerConnectionServer.offers.push({
                offererUserName: this.userName,
                offer: newOffer,
                offerIceCandidates: [],
                answererUserName: '',
                answer: null,
                answererIceCandidates: [],
            });
            // console.log(newOffer.sdp.slice(50))
            //send out to all connected sockets EXCEPT the caller
            this.socket.broadcast.emit(
                this.socketEventsMapper.newOfferAwaiting,
                RTCPeerConnectionServer.offers.slice(-1)
            );
        });

        this.socket.on(this.socketEventsMapper.newAnswer, (offerObj, ackFunction) => {
            console.log(offerObj);
            //emit this answer (offerObj) back to CLIENT1
            //in order to do that, we need CLIENT1's socketid
            const socketToAnswer = RTCPeerConnectionServer.connectedSockets.find(
                (s) => s.userName === offerObj.offererUserName
            );
            if (!socketToAnswer) {
                console.log('No matching socket');
                return;
            }
            //we found the matching socket, so we can emit to it!
            const socketIdToAnswer = socketToAnswer.socketId;
            //we find the offer to update so we can emit it
            const offerToUpdate = RTCPeerConnectionServer.offers.find(
                (o) => o.offererUserName === offerObj.offererUserName
            );
            if (!offerToUpdate) {
                console.log('No OfferToUpdate');
                return;
            }
            //send back to the answerer all the iceCandidates we have already collected
            ackFunction(offerToUpdate.offerIceCandidates);
            offerToUpdate.answer = offerObj.answer;
            offerToUpdate.answererUserName = this.userName;
            //socket has a .to() which allows emiting to a "room"
            //every socket has it's own room
            this.socket.to(socketIdToAnswer).emit(this.socketEventsMapper.answerResponse, offerToUpdate);
        });

        this.socket.on(this.socketEventsMapper.sendIceCandidateToSignalingServer, (iceCandidateObj) => {
            const { didIOffer, iceUserName, iceCandidate } = iceCandidateObj;
            // console.log(iceCandidate);
            if (didIOffer) {
                //this ice is coming from the offerer. Send to the answerer
                const offerInOffers = RTCPeerConnectionServer.offers.find((o) => o.offererUserName === iceUserName);
                if (offerInOffers) {
                    offerInOffers.offerIceCandidates.push(iceCandidate);
                    // 1. When the answerer answers, all existing ice candidates are sent
                    // 2. Any candidates that come in after the offer has been answered, will be passed through
                    if (offerInOffers.answererUserName) {
                        //pass it through to the other socket
                        const socketToSendTo = RTCPeerConnectionServer.connectedSockets.find(
                            (s) => s.userName === offerInOffers.answererUserName
                        );
                        if (socketToSendTo) {
                            this.socket
                                .to(socketToSendTo.socketId)
                                .emit(this.socketEventsMapper.receivedIceCandidateFromServer, iceCandidate);
                        } else {
                            console.log('Ice candidate recieved but could not find answere');
                        }
                    }
                }
            } else {
                //this ice is coming from the answerer. Send to the offerer
                //pass it through to the other socket
                const offerInOffers = RTCPeerConnectionServer.offers.find((o) => o.answererUserName === iceUserName);
                const socketToSendTo = RTCPeerConnectionServer.connectedSockets.find(
                    (s) => s.userName === offerInOffers?.offererUserName
                );
                if (socketToSendTo) {
                    this.socket
                        .to(socketToSendTo.socketId)
                        .emit(this.socketEventsMapper.receivedIceCandidateFromServer, iceCandidate);
                } else {
                    console.log('Ice candidate received but could not find offerer');
                }
            }
        });
    }
}
