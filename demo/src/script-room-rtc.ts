import { RTCUserConnectionClient, type Offer } from './source-code';
import { getUserName } from './utils/user-details';
import {
    localVideoElement,
    remoteVideoElement,
    callButtonElement,
    addAnswerElement,
    scenario,
    hangupButtonElement,
    addCallElement,
    addRemoteVideoElement,
} from './utils/elements';
import { connectSocketIO } from './utils/socket-io';
import { defaultDeviceChat } from './utils/device-media';
// import { RTCPeerConnectionClient, type Offer } from 'stream-rtc';

// @ts-ignore
window.RTCUserConnectionClient = RTCUserConnectionClient;

scenario('Multi/User Connections with video elements');
callButtonElement.remove();
remoteVideoElement.remove();

async function onClickHangoutButtonHandler(element?: HTMLButtonElement, toUserId?: string) {
    try {
        if (toUserId) {
            console.log('Disconnecting user:', toUserId);
            pc.disconnectUser(toUserId);
        } else {
            console.log('Disconnecting all users');
            pc.disconnectAll();
        }

        // Clear video elements
        if (localVideoElement) localVideoElement.srcObject = null;
        // Clear any video elements with user IDs
        const videoElements = toUserId
            ? document.querySelectorAll(`video[data-user-id="${toUserId}"]`)
            : document.querySelectorAll(`video[data-user-id]`);

        videoElements.forEach((element) => {
            if (element) {
                (element as HTMLVideoElement).srcObject = null;
                element.removeAttribute('data-user-id');
            }
        });

        if (element) {
            element.classList.remove('btn-danger');
            element.classList.add('btn-primary');
            element.innerText = `Call: ${toUserId}`;
            const elClone = element.cloneNode(true);
            element.parentNode?.replaceChild(elClone, element);

            elClone.addEventListener('click', () => {
                return onClickCallButtonHandler(elClone as HTMLButtonElement, toUserId as string);
            });
        }
    } catch (error) {
        console.error('Failed to hangup:', error);
        alert('Failed to hangup: ' + (error as Error).message);
    }
}

async function onClickCallButtonHandler(element: HTMLButtonElement, toUserId: string) {
    try {
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

        if (element) {
            element.classList.remove('btn-primary');
            element.classList.add('btn-danger');
            element.innerText = `Hangup: ${toUserId}`;
            const elClone = element.cloneNode(true);
            element.parentNode?.replaceChild(elClone, element);

            elClone.addEventListener('click', () => {
                return onClickHangoutButtonHandler(elClone as HTMLButtonElement, toUserId as string);
            });
        }
    } catch (error) {
        console.error('Failed to start call:', error);
        alert('Failed to start call: ' + (error as Error).message);
    }
}

// Initialize socket connection first
const socket = connectSocketIO((userId) => {
    console.log('Socket connected with userId:', userId);
    pc.userId = userId;
    // Update the RTCUserConnectionClient's userId if needed
});

socket.on('user-connected', (userId) => {
    console.log('User connected:', userId);
    addCallElement(userId, (element: HTMLButtonElement) => onClickCallButtonHandler(element, userId));
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
    addRemoteVideoElement(userId, stream);
    const element = document.querySelector(`button[data-user-id="${userId}"]`) as HTMLButtonElement;
    if (element) {
        element.classList.remove('btn-primary');
        element.classList.add('btn-danger');
        element.innerText = `Hangup: ${userId}`;
        const elClone = element.cloneNode(true);
        element.parentNode?.replaceChild(elClone, element);

        elClone.addEventListener('click', () => {
            return onClickHangoutButtonHandler(elClone as HTMLButtonElement, userId as string);
        });
    }
});

// Handle user disconnection
pc.onUserDisconnected((userId: string, userLogout: boolean) => {
    console.log('User disconnected:', userId);

    // Clean up video elements for disconnected user
    const videoElement = document.querySelector(`video[data-user-id="${userId}"]`);
    if (videoElement) {
        (videoElement as HTMLVideoElement).srcObject = null;
        (videoElement as HTMLVideoElement)?.remove();
    }

    const element = document.querySelector(`button[data-user-id="${userId}"]`) as HTMLButtonElement;
    if (userLogout) {
        element?.remove();
    } else {
        if (element) {
            element.classList.remove('btn-danger');
            element.classList.add('btn-primary');
            element.innerText = `Call: ${userId}`;
            const elClone = element.cloneNode(true);
            element.parentNode?.replaceChild(elClone, element);

            elClone.addEventListener('click', () => {
                return onClickCallButtonHandler(elClone as HTMLButtonElement, userId as string);
            });
        }
    }
});

// Handle hangup button click
hangupButtonElement?.addEventListener('click', async () => onClickHangoutButtonHandler());

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
