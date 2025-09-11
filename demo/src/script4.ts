import { RTCPeerConnectionClient, type Offer } from './source-code';
import { getUserName, getToUserId } from './utils/user-details.ts';
import {
    localVideoElement,
    remoteVideoElement,
    callButtonElement,
    addAnswerElement,
    scenario,
    addRemoteVideoElement,
} from './utils/elements.ts';
import { connectSocketIO } from './utils/socket-io.ts';
import { defaultDeviceChat } from './utils/device-media.ts';
// import { RTCPeerConnectionClient, type Offer } from 'stream-rtc';

// @ts-ignore
window.RTCPeerConnectionClient = RTCPeerConnectionClient;

remoteVideoElement.remove(); // remove the remote video to load it dynamically
scenario('Call to userId and load the response dynamically');

const socket = connectSocketIO((userId) => pc.updateUserId(userId));
const pc = new RTCPeerConnectionClient(socket, { userId: getUserName() }, { debugMode: true });

pc.onError((err: any) => alert(JSON.stringify(err, null, 4)));
pc.onRemoteStreamAdded(addRemoteVideoElement); // add dynamically remote videos
pc.onOffersReceived((offers: Offer | Offer[]) => {
    ([] as Offer[]).concat(offers).forEach((o) => {
        addAnswerElement(o, async () => {
            const [localStream] = await pc.answerOffer(o, defaultDeviceChat);
            localVideoElement.srcObject = localStream;
        });
    });
});

callButtonElement?.addEventListener('click', async () => {
    const toUserId = getToUserId();
    const [localStream] = await pc.call({ userId: toUserId }, defaultDeviceChat);
    localVideoElement.srcObject = localStream;
});
