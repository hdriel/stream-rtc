import type { Offer } from '../source-code';

export const localVideoQuerySelector = '#local-video';
export const localVideoElement = document.querySelector(localVideoQuerySelector) as HTMLVideoElement;

const actionsElement = document.querySelector('#actions') as HTMLDivElement;
const videosElement = document.querySelector('#videos') as HTMLVideoElement;
export const hangupButtonElement = document.querySelector('#hangup') as HTMLVideoElement;
const answerEl = document.querySelector('#answer');
const title = document.querySelector('#use-case') as Element;
export const joinRoomElement = document.querySelector('#join-room') as Element;

export function scenario(text: string) {
    title.innerHTML = text;
}

export function addRemoteVideoElement(userId: string, remoteStream: MediaStream) {
    const newRemoteVideo = document.createElement('video');
    newRemoteVideo.className = 'video-player remote-video labeled';
    newRemoteVideo.autoplay = true;
    newRemoteVideo.playsInline = true;
    newRemoteVideo.setAttribute('data-user-id', userId);
    newRemoteVideo.srcObject = remoteStream;

    const newRemoteVideoWrapper = document.createElement('div');
    newRemoteVideoWrapper.style.display = 'block';
    newRemoteVideoWrapper.className = 'video-container';
    newRemoteVideoWrapper.setAttribute('data-user-id', userId);
    newRemoteVideoWrapper.appendChild(newRemoteVideo);

    const label = document.createElement('div');
    label.className = 'video-label';
    label.textContent = `👤 ${userId}`;
    label.style.cssText = `
            text-align: center;
            margin-top: 10px;
            padding: 8px 16px;
            background-color: #4CAF50;
            color: white;
            border-radius: 5px;
            font-size: 14px;
            font-weight: bold;
            width: fit-content;
            margin-left: auto;
            margin-right: auto;
        `;
    newRemoteVideoWrapper.appendChild(label);

    videosElement.appendChild(newRemoteVideoWrapper);
}

export function removeRemoteVideoElement(userId: string) {
    document.querySelector(`.video-container[data-user-id="${userId}"]`)?.remove();
}

export function addAnswerElement(offer: Offer, answerCB: () => void, cancelCB: () => void) {
    const newOfferEl = document.createElement('div');
    newOfferEl.innerHTML = `
        <button class="btn btn-success col-12 mb-3 d-flex justify-content-between">
            <span class="d-flex align-items-center">Answer ${offer.offererUserId}</span>
        </button>
    `;
    newOfferEl.addEventListener('click', () => {
        answerCB?.();
        newOfferEl.remove();
    });

    const cancelOfferEl = document.createElement('button');
    cancelOfferEl.className = 'cancel-offer btn btn-danger';
    cancelOfferEl.textContent = 'Cancel';
    cancelOfferEl.addEventListener('click', (e) => {
        e.stopPropagation();
        cancelCB?.();
        newOfferEl.remove();
    });

    newOfferEl.children[0].appendChild(cancelOfferEl);

    answerEl?.appendChild(newOfferEl);
}

export function addCallElement(userId: string, cb: (element: HTMLButtonElement) => Promise<void>) {
    const newCallEl = document.createElement('button');
    newCallEl.setAttribute('data-user-id', userId);
    newCallEl.classList.add(...'btn btn-primary col-1'.split(' '));
    newCallEl.innerText = `Call: ${userId}`;
    newCallEl.addEventListener('click', () => cb(newCallEl));
    actionsElement?.appendChild(newCallEl);
}
