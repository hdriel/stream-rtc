import { Socket as SocketIO } from 'socket.io';
import type { Offer } from '../RTCPeerConnection.class.ts';
import type { SocketEventType } from './decs.ts';
import { SOCKET_EVENTS } from './consts.ts';

export class RTCPeerConnectionServer {
    //offers will contain {}
    private socket: SocketIO;
    private static readonly offers: Offer[] = [];
    private static connectedSockets: Array<{ userName: string; socketId: string }> = [];
    private readonly userName: string = '';
    private readonly socketEventsMapper: SocketEventType;

    constructor(
        socket: SocketIO,
        userName: string,
        options: { socketEventsMapper?: SocketEventType } = { socketEventsMapper: SOCKET_EVENTS }
    ) {
        this.socket = socket;
        this.userName = userName; // socket.handshake.auth.userName;
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
