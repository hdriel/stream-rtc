import * as io from 'socket.io-client';
import { RTCPeerConnectionClient } from '../RTCPeerConnection.client';
import type { Offer } from '../decs';

debugger;
const userName = 'Rob-' + Math.floor(Math.random() * 100000);
const password = 'x';

const userNameEl = document.querySelector('#user-name') as Element;
userNameEl.innerHTML = userName;

const socket = io.connect('https://localhost:8181/', { auth: { userName, password } });

const localVideoEl = document.querySelector('#local-video') as HTMLVideoElement;
const remoteVideoEl = document.querySelector('#remote-video') as HTMLVideoElement;

const pc = new RTCPeerConnectionClient(socket, { localVideoEl, remoteVideoEl, userId: userName }, { createOfferCB });

document.querySelector('#call')?.addEventListener('click', async () => pc.call());

function createOfferCB(offers: Offer[]) {
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
