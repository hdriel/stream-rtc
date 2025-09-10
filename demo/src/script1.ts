import * as io from 'socket.io-client';
import { RTCPeerConnectionClient, type Offer } from './source-code';
// import { RTCPeerConnectionClient, type Offer } from 'stream-rtc';

let userName = 'Rob-' + Math.floor(Math.random() * 100000);
let toUserId = '';
const password = 'x';

function updateUserName() {
    const userNameEl = document.querySelector('#user-name') as Element;
    userNameEl.innerHTML = userName;
}
updateUserName();

// @ts-ignore
const host = import.meta.env.VITE_SERVER_HOST;
// @ts-ignore
const port = import.meta.env.VITE_SERVER_PORT;
const url = `https://${host}:${port}/`;
const socket = io.connect(url, { auth: { userName, password } });
socket.on('connected', (userId) => {
    console.log('Connected to RTC', userName, userId);
    userName = userId;
    updateUserName();
});

socket.on('user-connected', (userId) => {
    console.log('other user connected to RTC', userId);
    toUserId = userId;
});

console.log('socket connecting on url:', url);

const localVideoElement = document.querySelector('#local-video') as HTMLVideoElement;
console.log('localVideoEl', localVideoElement);

const remoteVideoElement = document.querySelector('#remote-video') as HTMLVideoElement;
console.log('remoteVideoEl', remoteVideoElement);

function errorCallBack(err: any) {
    alert(JSON.stringify(err, null, 4));
}

const pc = new RTCPeerConnectionClient(
    socket,
    { localVideoElement, remoteVideoElement, userId: userName },
    { debugMode: true }
);
pc.onOffersReceived(createOffersCB);
pc.onError(errorCallBack);

document.querySelector('#call')?.addEventListener('click', async () => {
    pc.call({ userId: toUserId });
});

function createOffersCB(offers: Offer[]) {
    //make green answer button for this new offer
    const answerEl = document.querySelector('#answer');
    offers.forEach((o) => {
        console.log(o);
        const newOfferEl = document.createElement('div');
        newOfferEl.innerHTML = `<button class="btn btn-success col-1">Answer ${o.offererUserId}</button>`;
        newOfferEl.addEventListener('click', () => pc.answerOffer(o));
        answerEl?.appendChild(newOfferEl);
    });
}
