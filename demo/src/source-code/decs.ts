export type EVENT_NAME =
    | 'newOffer'
    | 'newAnswer'
    | 'sendIceCandidateToSignalingServer'
    | 'receivedIceCandidateFromServer'
    | 'newOfferAwaiting'
    | 'answerResponse'
    | 'availableOffers';

export type SocketEventType = Record<EVENT_NAME, string>;

export interface Offer {
    toRoomId?: string;
    toUserIds?: string[];
    offererUserId: string;
    offer: RTCSessionDescriptionInit;
    offerIceCandidates: RTCIceCandidate[];
    answererUserId: string;
    answer: null | RTCSessionDescriptionInit;
    answererIceCandidates: RTCIceCandidate[];
}

export interface IceCandidateOffer {
    didIOffer: boolean;
    iceUserId: string;
    iceCandidate: RTCIceCandidate;
    callToUserIds?: string[];
    callToRoomId?: string;
}

// @ts-ignore
export enum RTCPeerConnectionError {
    fetchUserMedia,
}
