import * as io from 'socket.io-client';
import { RTCPeerConnectionClient, type Offer } from 'stream-rtc';

const userName = 'Rob-' + Math.floor(Math.random() * 100000);
const password = 'x';

const userNameEl = document.querySelector('#user-name') as Element;
userNameEl.innerHTML = userName;

// @ts-ignore
const host = import.meta.env.VITE_SERVER_HOST;
// @ts-ignore
const port = import.meta.env.VITE_SERVER_PORT;
const url = `https://${host}:${port}/`;
const socket = io.connect(url, { auth: { userName, password } });
console.log('socket connecting on url:', url);

const localVideoEl = document.querySelector('#local-video') as HTMLVideoElement;
console.log('localVideoEl', localVideoEl);

const videosElement = document.querySelector('#videos') as HTMLVideoElement;
console.log('videosElement', videosElement);

const remoteVideoEl = document.querySelector('#remote-video') as HTMLVideoElement;
remoteVideoEl.remove();

function errorCallBack(err: any) {
    alert(JSON.stringify(err, null, 4));
}

const pc = new RTCPeerConnectionClient(socket, { userId: userName });
pc.onOffersReceived(createOffersCB);
pc.onRemoteStreamAdded((remoteStream) => {
    const newRemoteVideo = document.createElement('video');
    newRemoteVideo.srcObject = remoteStream;
    videosElement.appendChild(newRemoteVideo);
});
pc.onError(errorCallBack);

document.querySelector('#call')?.addEventListener('click', async () => {
    const [localStream] = await pc.call();
    localVideoEl.srcObject = localStream;
});

function createOffersCB(offers: Offer[]) {
    //make green answer button for this new offer
    const answerEl = document.querySelector('#answer');
    offers.forEach((o) => {
        console.log(o);
        const newOfferEl = document.createElement('div');
        newOfferEl.innerHTML = `<button class="btn btn-success col-1">Answer ${o.offererUserName}</button>`;
        newOfferEl.addEventListener('click', async () => {
            const [localStream, remoteStream] = await pc.answerOffer(o);
            localVideoEl.srcObject = localStream;
            remoteVideoEl.srcObject = remoteStream;
        });
        answerEl?.appendChild(newOfferEl);
    });
}
