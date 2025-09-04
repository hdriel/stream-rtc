
# RTC Peer Connection implementation

Implement simple RTC peer connection to handle only what we need without to enter the details like STUN SDP ICE and so on...
Enjoy 

# CODE USAGE

## client side script: 
```typescript

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
console.log('remoteVideoEl', remoteVideoEl);

const pc = new RTCPeerConnectionClient(socket, { localVideoEl, remoteVideoEl, userId: userName });
pc.onOffersReceivedCB(createOffersCB);

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
```
in client side import the RTC peer connection client class
```typescript
import * as io from 'socket.io-client';
import { RTCPeerConnectionClient, type Offer } from 'simple-rtc-peer-connection';
```

creating new instance of RTC peer connection with the socket and 2 video elements and unique userId 
```typescript
const socket = io.connect(url, { auth: { userName, password } });
const pc = new RTCPeerConnectionClient(socket, { localVideoEl, remoteVideoEl, userId: userName });
```

now can make a call first (the caller/CLIENT 1)
```typescript
document.querySelector('#call')?.addEventListener('click', async () => pc.call());
```

the client 2 will waiting for the offers 
```typescript
pc.onOffersReceivedCB(createOffersCB);
```

on offer received will load them as button to UI for click on get answer on offer
```typescript
newOfferEl.addEventListener('click', () => pc.answerOffer(o));
```


## server side script
```typescript
import fs from 'node:fs';
import path from 'node:path';
import https from 'https';
import express from 'express';
import { Server as SocketIO } from 'socket.io';
import { RTCPeerConnectionServer } from 'simple-rtc-peer-connection';

const __dirname = import.meta.dirname;
console.log('__dirname', __dirname);
const app = express();

app.use(express.static(path.resolve(__dirname, '../dist')));

//we need a key and cert to run https
//we generated them with mkcert
// $ mkcert create-ca
// $ mkcert create-cert
const key = fs.readFileSync(path.resolve(__dirname, 'cert.key'));
const cert = fs.readFileSync(path.resolve(__dirname, 'cert.crt'));

//we changed our express setup so we can use https
//pass the key and cert to createServer on https
const expressServer = https.createServer({ key, cert }, app);
//create our socket.io server... it will listen to our express port
const io = new SocketIO(expressServer);
expressServer.listen(8181); // https://localhost:8181

console.log('Listening on port 8181');
console.log('open url: https://localhost:8181');

io.on('connection', (socket) => {
    // console.log("Someone has connected");
    const password = socket.handshake.auth.password;

    if (password !== 'x') {
        socket.disconnect(true);
        return;
    }

    new RTCPeerConnectionServer(socket, socket.handshake.auth.userName);
});
```

in server side import the RTC peer connection server class
```typescript
import { Server as SocketIO } from 'socket.io';
import { RTCPeerConnectionServer } from 'simple-rtc-peer-connection';
```

after socket connected init instance with socket and userId
```typescript
new RTCPeerConnectionServer(socket, socket.handshake.auth.userName);
```

that it! the server singling working to connect the offers and ice candidates between 2 clients

Notice: the rtc peer connection must running on https server so we init that on express with some certificates that we make locally
```typescript
import https from 'https';
import express from 'express';

const key = fs.readFileSync(path.resolve(__dirname, 'cert.key'));
const cert = fs.readFileSync(path.resolve(__dirname, 'cert.crt'));

const expressServer = https.createServer({ key, cert }, app);

const io = new SocketIO(expressServer);
expressServer.listen(8181); // https://localhost:8181

```

# Running directory of DEMO app

run the express https server by

```
npm start
```

the certificates that runs on this https is made from the following commands, therefore the browser will show warnings about not secure certificates because it not known certifications
```
npm run ca
npm run cert
```

to check locally changes you can run yalc commands to include the files locally as node_module package
```
npm run yalc:publish
npm run yalc:attach
```

now: open on OPERA browser with 2 incognito pages, make the call and answer on the second page
Note: Opera because in chrome it's make a lot of warning and crashing like:
* Failed to load resource: net::ERR_CONNECTION_REFUSED

# Need to improve 
* sending to specific unique user like by userId
* add debug info logs

### Author 
Hadriel Benjo