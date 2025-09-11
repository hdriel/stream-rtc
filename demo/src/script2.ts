import { RTCPeerConnectionClient, type Offer } from './source-code';
import { getUserName, getToUserId } from './utils/user-details.ts';
import {
    localVideoQuerySelector,
    remoteVideoQuerySelector,
    callButtonElement,
    addAnswerElement,
    scenario,
} from './utils/elements.ts';
import { connectSocketIO } from './utils/socket-io.ts';
// import { RTCPeerConnectionClient, type Offer } from 'stream-rtc';

// @ts-ignore
window.RTCPeerConnectionClient = RTCPeerConnectionClient;

scenario('Call to userId with video element selectors');

const socket = connectSocketIO((userId) => pc.updateUserId(userId));
const pc = new RTCPeerConnectionClient(
    socket,
    {
        localVideoQuerySelector: localVideoQuerySelector,
        remoteVideoElementsQuerySelector: remoteVideoQuerySelector,
        userId: getUserName(),
    },
    { debugMode: true }
);

pc.onError((err: any) => alert(JSON.stringify(err, null, 4)));
pc.onOffersReceived((offers: Offer[]) => {
    offers.forEach((o) => {
        addAnswerElement(o, () => pc.answerOffer(o, { video: false, audio: true }));
    });
});

callButtonElement?.addEventListener('click', async () => {
    const toUserId = getToUserId();
    return pc.callToUserId(toUserId, { video: false, audio: true });
});
