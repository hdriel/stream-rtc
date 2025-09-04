import * as io from 'socket.io-client';
import { RTCPeerConnectionClient, type Offer } from 'simple-rtc-peer-connection';

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

const remoteVideoEl = document.querySelector('#remote-video') as HTMLVideoElement;
console.log('remoteVideoEl', localVideoEl);

const pc = new RTCPeerConnectionClient(socket, { localVideoEl, remoteVideoEl, userId: userName });
pc.onOffersReceived(createOffersCB);
const errorCallBack = (err: any) => {
    alert(JSON.stringify(err, null, 4));
};
pc.onError(errorCallBack);

document.querySelector('#call')?.addEventListener('click', async () => pc.call());

function createOffersCB(offers: Offer[]) {
    //make green answer button for this new offer
    const answerEl = document.querySelector('#answer');
    offers.forEach((o) => {
        console.log(o);
        const newOfferEl = document.createElement('div');
        newOfferEl.innerHTML = `<button class="btn btn-success col-1">Answer ${o.offererUserName}</button>`;
        newOfferEl.addEventListener('click', () => pc.answerOffer(o));
        answerEl?.appendChild(newOfferEl);
    });
}
