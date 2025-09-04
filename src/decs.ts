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
    offererUserName: string;
    offer: RTCSessionDescriptionInit;
    offerIceCandidates: any[];
    answererUserName: string;
    answer: null | RTCSessionDescriptionInit;
    answererIceCandidates: any[];
}

// @ts-ignore
export enum RTCPeerConnectionError {
    fetchUserMedia,
}
