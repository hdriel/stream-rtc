export class RTCPeerConnectionError extends Error {
    public readonly originalError?: any;

    constructor(message: string, originalError?: any) {
        super(message);
        this.name = 'RTCPeerConnectionError';
        this.originalError = originalError;
    }
}
