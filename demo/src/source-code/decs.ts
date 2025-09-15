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
    targetUserId?: string; // Specific target user for P2P
    callToUserIds?: string[]; // Multiple target users
    callToRoomId?: string; // Room-based routing
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
}

export interface CreateRoomData {
    roomName: string;
    roomId?: string;
    maxParticipants?: number;
    isPrivate?: boolean;
    creatorUserId: string;
}

export interface JoinRoomData {
    roomId: string;
    userId: string;
}

export interface LeaveRoomData {
    roomId: string;
    userId: string;
}

// Room-specific WebRTC events
export interface RoomOfferData {
    offer: RTCSessionDescriptionInit;
    targetUserId: string;
    roomId: string;
    offererUserId: string;
}

export interface RoomAnswerData {
    answer: RTCSessionDescriptionInit;
    targetUserId: string;
    roomId: string;
    answererUserId: string;
}

export interface RoomIceCandidateData {
    candidate: RTCIceCandidate;
    targetUserId: string;
    roomId: string;
    senderUserId: string;
}

// User event data
export interface UserJoinedRoomData {
    userId: string;
    roomId: string;
}

export interface UserLeftRoomData {
    userId: string;
    roomId: string;
}

export interface RoomClosedData {
    roomId: string;
    reason?: string;
}

// Peer connection info for multi-user connections
export interface PeerConnectionInfo {
    userId: string;
    peerConnection: RTCPeerConnection;
    remoteStream: MediaStream;
    isConnected: boolean;
}

// Server response types
export interface ServerResponse<T = any> {
    success?: boolean;
    error?: string;
    data?: T;
}

export interface RoomResponse {
    roomId: string;
    roomName: string;
    maxParticipants: number;
    participants: string[];
    isPrivate?: boolean;
    creatorUserId?: string;
}

// Error class
export class RTCPeerConnectionError extends Error {
    public readonly originalError?: any;

    constructor(message: string, originalError?: any) {
        super(message);
        this.name = 'RTCPeerConnectionError';
        this.originalError = originalError;
    }
}

// Enhanced ICE candidate data with better routing support
export interface EnhancedIceCandidateData {
    iceCandidate: RTCIceCandidate;
    senderUserId: string;
    targetUserId?: string;
    roomId?: string;
    userIds?: string[];
    didIOffer: boolean;
}

// Connection state types
export type ConnectionType = 'p2p' | 'room' | 'multi-user';

export interface ConnectionContext {
    type: ConnectionType;
    roomId?: string;
    targetUserId?: string;
    userIds?: string[];
}
