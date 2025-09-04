# WebRTC PeerConnection Signaling Suite

A robust TypeScript signaling solution for WebRTC applications using Socket.io as the signaling mechanism. The package provides an extensible and simple API for both server-side (signaling server) and client-side (browser/app) logic, enabling fast development of peer-to-peer video, audio, or data channels.

***

## Features

- **Written in TypeScript** for type safety and clarity.
- **Signaling server** fully decoupled from client logic.
- **Client helper class** for easy WebRTC peer connections and ICE negotiation.
- **Customizable event mapping**, STUN server configuration, and media constraints.
- **Extensible** for custom events or authentication flows.

***

## Project Structure

```
src/
├── RTCPeerConnection.server.ts    # Signaling server logic (Socket.io)
├── RTCPeerConnection.client.ts    # WebRTC client logic (browser/app)
├── decs.ts                        # Shared types, enums, interfaces
└── consts.ts                      # Constants (event names, ICE config)
```


***

## Requirements

- **Node.js** (>= 14)
- **socket.io** - for the signaling server
- **socket.io-client** - for the client app
- **TypeScript** (if using or building from source)

Install dependencies:

for server side
```shell
npm install socket.io
```

for client side
```shell
npm install socket.io-client
```


***

## Getting Started

### 1. Server Example (Signaling Server)

```typescript
import { Server } from 'socket.io';
import { RTCPeerConnectionServer } from './RTCPeerConnection.server';

const io = new Server(3000);

io.on('connection', (socket) => {
  const userId = socket.handshake.auth.userName || socket.id;
  new RTCPeerConnectionServer(socket, userId);
});
```

- Instantiate `RTCPeerConnectionServer` for each new socket.
- Handles offers, answers, and ICE candidate relay automatically.

***

### 2. Client Example

```typescript
import { io } from 'socket.io-client';
import { RTCPeerConnectionClient } from './RTCPeerConnection.client';

const socket = io('http://localhost:3000');
const rtcClient = new RTCPeerConnectionClient(socket, { userId: 'userA' });

rtcClient.onOffersReceived((offers)=>{
    const offerOptions = offers;
    offerOptions.forEach(o => {
        o.onClick = () => {
            rtcClient.answerOffer().then(([localStream, remoteStream]) => {
                // Attach localStream and remoteStream to <video> HTML elements as needed, or include them in constructur props
            });
        }
    })
    // render offerOptions options
});


rtcClient.call().then(([localStream, remoteStream]) => {
  // Attach localStream and remoteStream to <video> HTML elements as needed, or include them in constructur props
});
```

- Use `call()` to request media permissions and initiate a connection.
- Listen and respond to offers with `answerOffer()`.
- ICE candidate and SDP negotiation is handled for you.

***

## Advanced Usage

- **Custom video/audio constraints:**
  Pass custom constraints to `call()` or `answerOffer()`.
- **Custom ICE servers:**
  Modify `PEER_CONFIGURATION` in `consts.ts` for different STUN/TURN servers.
- **Debugging:**
  Pass `{ debugMode: true }` to the client constructor to enable logging.

***

## Testing

To test locally:

1. Start the signaling server:

```shell
node ./src/server.js  # or use ts-node for TypeScript
```

2. Launch two separate clients (different browsers/tabs or machines) and connect to the server as different users.
3. Use the provided API to initiate and answer calls.

***

## API Overview

| Component | Description |
| :-- | :-- |
| RTCPeerConnectionServer | Handles offers, answers, and ICE candidates (signaling logic for Socket.io server) |
| RTCPeerConnectionClient | Manages media streams, SDP exchange, and ICE negotiation on the client |
| SOCKET_EVENTS / PEER_CONFIGURATION | Constants for event names and WebRTC ICE servers |
| Offer (interface, decs.ts) | Typed structure for WebRTC offer/answer exchange |


***

## Folder/File Reference

| File | Role |
| :-- | :-- |
| `RTCPeerConnection.server.ts` | Socket.io-based signaling server |
| `RTCPeerConnection.client.ts` | WebRTC peer/client logic |
| `decs.ts` | Type definitions \& enums |
| `consts.ts` | Configurable constants |


***

## Contributing

- Pull requests and issues are welcome!
- Please open issues for bugs, suggestions, or feature requests.

***

## License

MIT

***

Ready to build fast and robust WebRTC apps? Get started now!
For more information, see the comments and documentation within each file.
