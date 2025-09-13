import type { Socket as SocketIO } from 'socket.io';
import type { SocketEventType, Offer, IceCandidateOffer } from './decs.ts';
import { SOCKET_EVENTS } from './consts.ts';

export class RTCPeerConnectionServer {
    private socket: SocketIO;
    private static readonly offers: Offer[] = [];
    private static connectedSockets: Record<string, string> = {};
    private readonly userId: string = '';
    private readonly socketEventsMapper: SocketEventType;

    constructor(
        socket: SocketIO,
        userId: string,
        options: { socketEventsMapper?: SocketEventType } = { socketEventsMapper: SOCKET_EVENTS }
    ) {
        this.socket = socket;
        this.userId = userId; // socket.handshake.auth.userName;
        this.socketEventsMapper = options.socketEventsMapper || SOCKET_EVENTS;
        RTCPeerConnectionServer.connectedSockets[this.userId] = socket.id;

        if (RTCPeerConnectionServer.offers.length) {
            socket.emit(this.socketEventsMapper.availableOffers, RTCPeerConnectionServer.offers);
        }

        this.init();
    }

    updateSocketId(userId: string): void {
        RTCPeerConnectionServer.connectedSockets[userId] = this.socket.id;
    }

    removeSocketId(userId: string): void {
        delete RTCPeerConnectionServer.connectedSockets[userId];
    }

    private init() {
        this.socket.on(
            this.socketEventsMapper.newOffer,
            (
                newOffer: RTCSessionDescriptionInit,
                { roomId, userIds }: { roomId?: string; userIds?: string[] } = {}
            ) => {
                const offer: Offer = {
                    offererUserId: this.userId,
                    offer: newOffer,
                    offerIceCandidates: [],
                    answererUserId: '',
                    answer: null,
                    answererIceCandidates: [],
                    // offerForUserIds: ([] as string[])
                    //     .concat(userIds as string[], this.userId)
                    //     .filter((item, pos, arr) => item && arr.indexOf(item) === pos),
                    // offerForRoomId: roomId,
                };
                RTCPeerConnectionServer.offers.push(offer);

                if (roomId) {
                    // send out to all connected sockets in roomId EXCEPT the caller
                    this.socket.broadcast.to(roomId).emit(this.socketEventsMapper.newOfferAwaiting, offer);
                } else if (userIds?.length) {
                    // send out to all userIds params sockets EXCEPT the caller
                    userIds
                        .map((userId) => RTCPeerConnectionServer.connectedSockets[userId])
                        .forEach((userSocketId) => {
                            this.socket.broadcast
                                .to(userSocketId)
                                .emit(this.socketEventsMapper.newOfferAwaiting, offer);
                        });
                } else {
                    // send out to all connected sockets EXCEPT the caller
                    this.socket.broadcast.emit(this.socketEventsMapper.newOfferAwaiting, offer);
                }
            }
        );

        this.socket.on(
            this.socketEventsMapper.newAnswer,
            (offerObj: Offer, ackFunction: (iceCandidates: RTCIceCandidate[]) => void) => {
                //emit this answer (offerObj) back to CLIENT1
                //in order to do that, we need CLIENT1's socketid
                const socketIdToAnswer = RTCPeerConnectionServer.connectedSockets[offerObj.offererUserId];
                if (!socketIdToAnswer) {
                    console.log('No matching socket');
                    return;
                }
                //we found the matching socket, so we can emit to it!

                //we find the offer to update so we can emit it
                const offerToUpdate = RTCPeerConnectionServer.offers.find(
                    (o) => o.offererUserId === offerObj.offererUserId
                );
                if (!offerToUpdate) {
                    console.log('No OfferToUpdate');
                    return;
                }

                //send back to the answerer all the iceCandidates we have already collected
                ackFunction(offerToUpdate.offerIceCandidates);
                offerToUpdate.answer = offerObj.answer;
                offerToUpdate.answererUserId = this.userId;
                //socket has a .to() which allows emiting to a "room"
                //every socket has it's own room
                this.socket.to(socketIdToAnswer).emit(this.socketEventsMapper.answerResponse, offerToUpdate);

                const answererOffer: Offer = {
                    offererUserId: offerToUpdate.answererUserId,
                    offer: offerToUpdate.answer as RTCSessionDescriptionInit,
                    offerIceCandidates: offerToUpdate.answererIceCandidates,
                    answererUserId: offerToUpdate.offererUserId,
                    answer: offerToUpdate.offer,
                    answererIceCandidates: offerToUpdate.offerIceCandidates,
                };
                this.socket.emit(this.socketEventsMapper.answerResponse, answererOffer);
            }
        );

        this.socket.on(
            this.socketEventsMapper.sendIceCandidateToSignalingServer,
            // @ts-ignore
            (iceCandidateObj: IceCandidateOffer, { roomId, userIds }: { roomId?: string; userIds?: string[] } = {}) => {
                // todo: check to send the emit to specific userId/roomId
                // @ts-ignore
                const { didIOffer, iceUserId, iceCandidate } = iceCandidateObj;
                // console.log(iceCandidate);
                if (didIOffer) {
                    //this ice is coming from the offerer. Send to the answerer
                    const offerInOffers = RTCPeerConnectionServer.offers.find((o) => o.offererUserId === iceUserId);

                    if (offerInOffers) {
                        offerInOffers.offerIceCandidates.push(iceCandidate);
                        // 1. When the answerer answers, all existing ice candidates are sent
                        // 2. Any candidates that come in after the offer has been answered, will be passed through
                        if (offerInOffers.answererUserId) {
                            //pass it through to the other socket
                            const socketIdToSendTo =
                                RTCPeerConnectionServer.connectedSockets[offerInOffers.answererUserId];

                            if (socketIdToSendTo) {
                                this.socket
                                    .to(socketIdToSendTo)
                                    .emit(this.socketEventsMapper.receivedIceCandidateFromServer, iceCandidate);
                            } else {
                                console.log('Ice candidate recieved but could not find answere');
                            }
                        }
                    }
                } else {
                    //this ice is coming from the answerer. Send to the offerer
                    //pass it through to the other socket
                    const offerInOffers = RTCPeerConnectionServer.offers.find((o) => o.answererUserId === iceUserId);
                    const socketIdToSendTo =
                        offerInOffers?.offererUserId &&
                        RTCPeerConnectionServer.connectedSockets[offerInOffers?.offererUserId];

                    if (socketIdToSendTo) {
                        this.socket
                            .to(socketIdToSendTo)
                            .emit(this.socketEventsMapper.receivedIceCandidateFromServer, iceCandidate);
                    } else {
                        console.log('Ice candidate received but could not find offerer');
                    }
                }
            }
        );

        this.socket.on('disconnect', () => {
            this.removeSocketId(this.userId);
            const index = RTCPeerConnectionServer.offers.findIndex(
                (offer: Offer) => offer.offererUserId === this.userId
            );

            if (index >= 0) {
                RTCPeerConnectionServer.offers.splice(index, 1);
            }
        });
    }
}
