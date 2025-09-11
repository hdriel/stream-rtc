import type { Offer } from '../source-code';

export const localVideoQuerySelector = '#local-video';
export const localVideoElement = document.querySelector(localVideoQuerySelector) as HTMLVideoElement;

export const remoteVideoQuerySelector = '#remote-video';
export const remoteVideoElement = document.querySelector(remoteVideoQuerySelector) as HTMLVideoElement;

const videosElement = document.querySelector('#videos') as HTMLVideoElement;
export const callButtonElement = document.querySelector('#call') as HTMLVideoElement;

const answerEl = document.querySelector('#answer');

const title = document.querySelector('#use-case') as Element;

export function scenario(text: string) {
    title.innerHTML = text;
}

export function addRemoteVideoElement(remoteStream: MediaStream) {
    const newRemoteVideo = document.createElement('video');
    newRemoteVideo.className = 'video-player';
    newRemoteVideo.id = 'remote-video';
    newRemoteVideo.autoplay = true;
    newRemoteVideo.playsInline = true;

    newRemoteVideo.srcObject = remoteStream;
    videosElement.appendChild(newRemoteVideo);
}

export function addAnswerElement(offer: Offer, cb: () => void) {
    const newOfferEl = document.createElement('div');
    newOfferEl.innerHTML = `<button class="btn btn-success col-1">Answer ${offer.offererUserId}</button>`;
    newOfferEl.addEventListener('click', cb);
    answerEl?.appendChild(newOfferEl);
}
