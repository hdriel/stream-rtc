import { RTCPeerConnectionClient, type Offer } from './source-code';
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
window.RTCPeerConnectionClient = RTCPeerConnectionClient;

scenario('Call to userId with video elements');

const socket = connectSocketIO((userId) => pc.updateUserId(userId));
const pc = new RTCPeerConnectionClient(
    socket,
    { localVideoElement, remoteVideoElement, userId: getUserName() },
    { debugMode: true }
);

pc.onError((err: any) => alert(JSON.stringify(err, null, 4)));
pc.onOffersReceived((offers: Offer | Offer[]) => {
    ([] as Offer[]).concat(offers).forEach((o) => {
        addAnswerElement(o, () => pc.answerOffer(o, defaultDeviceChat));
    });
});

callButtonElement?.addEventListener('click', async () => {
    const toUserId = getToUserId();
    return pc.callToUserId(toUserId, defaultDeviceChat);
});

hangupButtonElement?.addEventListener('click', async () => {
    // const toUserId = getToUserId();
    // return pc.closeConnection(toUserId);
});
