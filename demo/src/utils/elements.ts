import type { Offer } from '../source-code';

export const localVideoQuerySelector = '#local-video';
export const localVideoElement = document.querySelector(localVideoQuerySelector) as HTMLVideoElement;

export const remoteVideoQuerySelector = '#remote-video';
export const remoteVideoElement = document.querySelector(remoteVideoQuerySelector) as HTMLVideoElement;

const actionsElement = document.querySelector('#actions') as HTMLDivElement;
const videosElement = document.querySelector('#videos') as HTMLVideoElement;
export const callButtonElement = document.querySelector('#call') as HTMLVideoElement;
export const hangupButtonElement = document.querySelector('#hangup') as HTMLVideoElement;
const answerEl = document.querySelector('#answer');
const title = document.querySelector('#use-case') as Element;
export const joinRoomElement = document.querySelector('#join-room') as Element;

export function scenario(text: string) {
    title.innerHTML = text;
}

export function addRemoteVideoElement(userId: string, remoteStream: MediaStream) {
    const newRemoteVideo = document.createElement('video');
    newRemoteVideo.className = 'video-player';
    newRemoteVideo.id = 'remote-video';
    newRemoteVideo.autoplay = true;
    newRemoteVideo.playsInline = true;
    newRemoteVideo.setAttribute('data-user-id', userId);

    newRemoteVideo.srcObject = remoteStream;
    videosElement.appendChild(newRemoteVideo);
}

export function addAnswerElement(offer: Offer, cb: () => void) {
    const newOfferEl = document.createElement('div');
    newOfferEl.innerHTML = `<button class="btn btn-success col-12">Answer ${offer.offererUserId}</button>`;
    newOfferEl.addEventListener('click', () => {
        cb?.();
        newOfferEl.remove();
    });
    answerEl?.appendChild(newOfferEl);
}

export function addCallElement(userId: string, cb: () => Promise<void>) {
    const newCallEl = document.createElement('button');
    newCallEl.setAttribute('data-user-id', userId);
    newCallEl.classList.add(...'btn btn-primary col-1'.split(' '));
    newCallEl.innerText = `Call: ${userId}`;
    newCallEl.addEventListener('click', cb);
    actionsElement?.appendChild(newCallEl);
}
