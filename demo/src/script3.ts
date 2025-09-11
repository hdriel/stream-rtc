import { RTCPeerConnectionClient, type Offer } from './source-code';
import { getUserName, getToUserId } from './utils/user-details.ts';
import {
    localVideoElement,
    remoteVideoElement,
    callButtonElement,
    addAnswerElement,
    scenario,
} from './utils/elements.ts';
import { connectSocketIO } from './utils/socket-io.ts';
// import { RTCPeerConnectionClient, type Offer } from 'stream-rtc';

// @ts-ignore
window.RTCPeerConnectionClient = RTCPeerConnectionClient;

scenario('Call to userId with video streams response');

const socket = connectSocketIO((userId) => pc.updateUserId(userId));
const pc = new RTCPeerConnectionClient(socket, { userId: getUserName() }, { debugMode: true });

pc.onError((err: any) => alert(JSON.stringify(err, null, 4)));
pc.onOffersReceived((offers: Offer[]) => {
    offers.forEach((o) => {
        addAnswerElement(o, async () => {
            const [localStream, remoteStream] = await pc.answerOffer(o);
            localVideoElement.srcObject = localStream;
            remoteVideoElement.srcObject = remoteStream;
        });
    });
});

callButtonElement?.addEventListener('click', async () => {
    const toUserId = getToUserId();
    const [localStream, remoteStream] = await pc.call({ userId: toUserId });
    localVideoElement.srcObject = localStream;
    remoteVideoElement.srcObject = remoteStream;
});
