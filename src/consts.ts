import type { SocketEventType } from './decs.ts';

export const SOCKET_EVENTS: SocketEventType = {
    newOffer: 'newOffer',
    newAnswer: 'newAnswer',
    sendIceCandidateToSignalingServer: 'sendIceCandidateToSignalingServer',
    receivedIceCandidateFromServer: 'receivedIceCandidateFromServer',
    newOfferAwaiting: 'newOfferAwaiting',
    answerResponse: 'answerResponse',
    availableOffers: 'availableOffers',
    cancelOffers: 'cancelOffers',
};

export const PEER_CONFIGURATION: RTCConfiguration = {
    iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
};
