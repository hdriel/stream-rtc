import { RTCUserConnectionClient, type Offer } from './source-code';
import { getUserName, getToUserId } from './utils/user-details';
import {
    localVideoElement,
    remoteVideoElement,
    callButtonElement,
    addAnswerElement,
    scenario,
    hangupButtonElement,
} from './utils/elements';
import { connectSocketIO } from './utils/socket-io';
import { defaultDeviceChat } from './utils/device-media';
// import { RTCPeerConnectionClient, type Offer } from 'stream-rtc';

// @ts-ignore
window.RTCUserConnectionClient = RTCUserConnectionClient;

scenario('Multi/User Connections with video elements');

// Initialize socket connection first
const socket = connectSocketIO((userId) => {
    console.log('Socket connected with userId:', userId);
    pc.userId = userId;
    // Update the RTCUserConnectionClient's userId if needed
});

// Create RTCUserConnectionClient instance
const pc = new RTCUserConnectionClient(socket, { userId: getUserName(), localVideoElement }, { debugMode: true });

// Set up error handling
pc.onError((err: Error, userId?: string) => {
    console.error('RTC Error:', err, userId ? `for user ${userId}` : '');
    alert(`RTC Error${userId ? ` for user ${userId}` : ''}: ${err.message}`);
});

// Handle incoming offers
pc.onOffersReceived((offers: Offer[]) => {
    console.log('Received offers:', offers);

    offers.forEach((offer) => {
        console.log('Processing offer from:', offer.offererUserId);

        // Add answer button for each offer
        addAnswerElement(offer, async () => {
            try {
                console.log('Answering offer from:', offer.offererUserId);
                const result = await pc.answerOffers([offer], defaultDeviceChat);
                console.log('Answer result:', result);

                if (result.errors.size > 0) {
                    console.error('Errors in answering:', Array.from(result.errors.entries()));
                }
            } catch (error) {
                console.error('Failed to answer offer:', error);
                alert('Failed to answer call: ' + (error as Error).message);
            }
        });
    });
});

// Handle remote stream added
pc.onRemoteStreamAdded((stream: MediaStream, userId: string) => {
    console.log('Remote stream added for user:', userId);

    // If using multiple video elements, you might want to handle this differently
    if (remoteVideoElement) {
        remoteVideoElement.srcObject = stream;
        remoteVideoElement.setAttribute('data-user-id', userId);
    }
});

// Handle user disconnection
pc.onUserDisconnected((userId: string) => {
    console.log('User disconnected:', userId);

    // Clean up video elements for disconnected user
    const videoElements = document.querySelectorAll(`[data-user-id="${userId}"]`);
    videoElements.forEach((element) => {
        (element as HTMLVideoElement).srcObject = null;
        element.removeAttribute('data-user-id');
    });
});

// Handle call button click
callButtonElement?.addEventListener('click', async () => {
    try {
        const toUserId = getToUserId();
        if (!toUserId) {
            alert('Please enter a user ID to call');
            return;
        }

        console.log('Starting call to user:', toUserId);

        // Call multiple users (you can modify this to call multiple users)
        const result = await pc.callUser(toUserId, defaultDeviceChat);

        console.log('Call result:', result);

        if (result.errors.size > 0) {
            console.error('Call errors:', Array.from(result.errors.entries()));
            const errorMessages = Array.from(result.errors.entries())
                .map(([userId, error]) => `${userId}: ${error.message}`)
                .join('\n');
            alert('Call errors:\n' + errorMessages);
        }

        if (result.remoteStreams.size > 0) {
            console.log('Successfully connected to users:', Array.from(result.remoteStreams.keys()));
            remoteVideoElement.srcObject = result.remoteStream;
            remoteVideoElement.setAttribute('data-user-id', toUserId);
        }
    } catch (error) {
        console.error('Failed to start call:', error);
        alert('Failed to start call: ' + (error as Error).message);
    }
});

// Handle hangup button click
hangupButtonElement?.addEventListener('click', async () => {
    try {
        const toUserId = getToUserId();

        if (toUserId) {
            console.log('Disconnecting user:', toUserId);
            pc.disconnectUser(toUserId);
        } else {
            console.log('Disconnecting all users');
            pc.disconnectAll();
        }

        // Clear video elements
        if (localVideoElement) localVideoElement.srcObject = null;
        if (remoteVideoElement) remoteVideoElement.srcObject = null;

        // Clear any video elements with user IDs
        const videoElements = document.querySelectorAll('[data-user-id]');
        videoElements.forEach((element) => {
            (element as HTMLVideoElement).srcObject = null;
            element.removeAttribute('data-user-id');
        });
    } catch (error) {
        console.error('Failed to hangup:', error);
        alert('Failed to hangup: ' + (error as Error).message);
    }
});

// Add some utility functions for debugging
// @ts-ignore
window.pcDebug = {
    getConnectedUsers: () => pc.getConnectedUsers(),
    getTotalConnections: () => pc.getTotalConnections(),
    getConnectionState: (userId: string) => pc.getConnectionState(userId),
    isUserConnected: (userId: string) => pc.isUserConnected(userId),
    disconnectUser: (userId: string) => pc.disconnectUser(userId),
    disconnectAll: () => pc.disconnectAll(),
};

console.log('Multi-User RTC Client initialized. Debug functions available at window.pcDebug');
