import { RTCPeerConnectionClient, type Offer } from './source-code';
import { getUserName, getRoomId } from './utils/user-details.ts';
import {
    localVideoElement,
    remoteVideoElement,
    callButtonElement,
    addAnswerElement,
    scenario,
    addRemoteVideoElement,
    joinRoomElement,
} from './utils/elements.ts';
import { connectSocketIO } from './utils/socket-io.ts';
import { defaultDeviceChat } from './utils/device-media.ts';
// import { RTCPeerConnectionClient, type Offer } from 'stream-rtc';

// @ts-ignore
window.RTCPeerConnectionClient = RTCPeerConnectionClient;

remoteVideoElement.remove(); // remove the remote video to load it dynamically
joinRoomElement.removeAttribute('hidden');
scenario('Call to all user in specific room');
getRoomId();

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

joinRoomElement?.addEventListener('click', async () => {
    socket.emit('join-room', getRoomId());
    scenario('Call to all user in room: ' + getRoomId());
    joinRoomElement.remove();
});
callButtonElement?.addEventListener('click', async () => {
    const roomId = getRoomId();
    const [localStream] = await pc.callToRoomId(roomId, defaultDeviceChat);
    localVideoElement.srcObject = localStream;
});
