export type EVENT_NAME =
    | 'newOffer'
    | 'newAnswer'
    | 'sendIceCandidateToSignalingServer'
    | 'receivedIceCandidateFromServer'
    | 'newOfferAwaiting'
    | 'answerResponse'
    | 'cancelOffers'
    | 'availableOffers';

export type SocketEventType = Record<EVENT_NAME, string>;

export interface Offer {
    // Legacy support
    toRoomId?: string;
    toUserIds?: string[];

    // Core offer data
    offererUserId: string;
    offer: RTCSessionDescriptionInit;
    offerIceCandidates: RTCIceCandidate[];
    answererUserId: string;
    answer: null | RTCSessionDescriptionInit;
    answererIceCandidates: RTCIceCandidate[];

    // Additional routing info
    targetUserId?: string; // For P2P connections
    roomId?: string; // For room-based connections
    userIds?: string[]; // For multi-user connections
}

export interface IceCandidateOffer {
    didIOffer: boolean;
    iceUserId: string;
    iceCandidate: RTCIceCandidate;

    // Routing information
    targetUserId: string;
    roomId?: string;
    senderUserId: string;
}

// Room-related interfaces
export interface RoomInfo {
    roomId: string;
    roomName: string;
    isPrivate: boolean;
    maxParticipants: number;
    participants: string[];
    creatorUserId: string;
    createdAt: Date;
    isHost: boolean;
}

// Peer connection info for multi-user connections
export interface PeerConnectionInfo {
    userId: string;
    peerConnection: RTCPeerConnection;
    remoteStream: MediaStream;
    isConnected: boolean;
    didIOffer: boolean; // Track who initiated the connection
    pendingIceCandidates?: RTCIceCandidate[]; // Add this line
}
