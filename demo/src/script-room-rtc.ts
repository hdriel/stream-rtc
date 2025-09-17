import { RTCRoomConnectionClient } from './source-code';
import { getUserName } from './utils/user-details';
import { hangupButtonElement, localVideoElement, scenario } from './utils/elements';
import { connectSocketIO } from './utils/socket-io';
import { defaultDeviceChat } from './utils/device-media';

// @ts-ignore
window.RTCRoomConnectionClient = RTCRoomConnectionClient;

scenario('Room Connections with video elements');
hangupButtonElement?.remove();

interface RoomInfo {
    roomId: string;
    roomName?: string;
    isHost: boolean;
    participants: string[];
    maxParticipants?: number;
}

let currentRoom: RoomInfo | null = null;
let availableRooms: RoomInfo[] = [];

// Initialize socket connection first
const socket = connectSocketIO((userId) => {
    console.log('Socket connected with userId:', userId);
    pc.userId = userId;
    const element = document.querySelector('#local-video-container');
    element?.setAttribute('data-user-id', userId);
    const labelElement = document.querySelector('.video-label');
    if (labelElement) {
        labelElement.setAttribute('data-user-id', userId);
        labelElement.textContent = userId;
    }
});

socket.on('user-connected', (userId) => {
    console.log('User connected:', userId);
});

// Enhanced socket event logging for debugging
socket.on('roomOffer', (data) => {
    console.log('🔵 [DEBUG] Received room offer:', data);
});

socket.on('roomAnswer', (data) => {
    console.log('🟢 [DEBUG] Received room answer:', data);
});

socket.on('roomIceCandidate', (data) => {
    console.log('🟡 [DEBUG] Received room ICE candidate:', data);
});

socket.on('userJoinedRoom', (data) => {
    console.log('🟠 [DEBUG] User joined room event:', data);
});

// Create RTCRoomConnectionClient instance
const pc = new RTCRoomConnectionClient(socket, { userId: getUserName(), localVideoElement }, { debugMode: true });

// Set up error handling
pc.onError((err: Error, userId?: string) => {
    console.error('RTC Error:', err, userId ? `for user ${userId}` : '');
    alert(`RTC Error${userId ? ` for user ${userId}` : ''}: ${err.message}`);
});

// Room event handlers
pc.onRoomJoined((roomInfo: RoomInfo) => {
    console.log('Joined room:', roomInfo);
    currentRoom = roomInfo;
    updateRoomUI();
    updateRoomsList();

    // Ensure local video is displayed
    if (pc.localStream && localVideoElement) {
        localVideoElement.srcObject = pc.localStream;
        console.log('Local video restored after joining room');
    }
});

pc.onRoomLeft((roomId: string) => {
    console.log('Left room:', roomId);
    currentRoom = null;
    updateRoomUI();
    updateRoomsList();
    clearRemoteVideos();
});

pc.onUserJoinedRoom((userId: string, roomId: string) => {
    console.log('User joined room:', userId, roomId);
    if (currentRoom && currentRoom.roomId === roomId) {
        if (!currentRoom.participants.includes(userId)) {
            currentRoom.participants.push(userId);
        }
        updateRoomUI();

        // Log peer connection state for debugging
        console.log(`User ${userId} joined room. Checking for peer connection...`);
        setTimeout(() => {
            const isConnected = pc.isParticipantConnected(userId);
            console.log(`Peer connection with ${userId}:`, isConnected ? 'Connected' : 'Not Connected');

            // Check if we have a stream for this user
            const stream = pc.getParticipantStream(userId);
            console.log(`Stream for ${userId}:`, stream ? 'Available' : 'Not Available');
        }, 2000); // Check after 2 seconds to allow connection time
    }
});

pc.onUserLeftRoom((userId: string, roomId: string) => {
    console.log('User left room:', userId, roomId);
    if (currentRoom && currentRoom.roomId === roomId) {
        currentRoom.participants = currentRoom.participants.filter((id) => id !== userId);
        updateRoomUI();
        removeRemoteVideo(userId);
    }
});

pc.onRemoteStreamAdded((stream: MediaStream, userId: string) => {
    console.log('Remote stream added for user:', userId);
    console.log('Stream details:', {
        id: stream.id,
        tracks: stream.getTracks().length,
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length,
    });
    addRemoteVideo(userId, stream);
});

// UI Management Functions
function createRoomControls() {
    const actionsDiv = document.getElementById('actions');
    if (!actionsDiv) return;

    // Clear existing room controls
    const existingControls = document.getElementById('room-controls');
    if (existingControls) {
        existingControls.remove();
    }

    const roomControlsHTML = `
        <div id="room-controls" class="mb-3">
            <div class="row mb-2">
                <div class="col-12">
                    <h3>Room Management</h3>
                </div>
            </div>
            
            <div class="row mb-2" id="create-room-section">
                <div class="col-8">
                    <input type="text" id="room-name-input" class="form-control" placeholder="Enter room name" maxlength="50">
                </div>
                <div class="col-4">
                    <button id="create-room-btn" class="btn btn-success w-100">Create Room</button>
                </div>
            </div>
            
            <div class="row mb-2">
                <div class="col-6">
                    <button id="toggle-rooms-btn" class="btn btn-info w-100">Show Available Rooms</button>
                </div>
                <div class="col-6">
                    <button id="refresh-rooms-btn" class="btn btn-secondary w-100">Refresh Rooms</button>
                </div>
            </div>
            
            <div id="rooms-list" class="mt-3" style="display: none;">
                <h4>Available Rooms</h4>
                <div id="rooms-container" class="list-group">
                    <!-- Rooms will be populated here -->
                </div>
            </div>
            
            <div id="current-room-info" class="mt-3" style="display: none;">
                <h4>Current Room</h4>
                <div class="card">
                    <div class="card-body">
                        <h5 id="current-room-name" class="card-title"></h5>
                        <p class="card-text">
                            <strong>Room ID:</strong> <span id="current-room-id"></span><br>
                            <strong>Participants:</strong> <span id="current-room-participants"></span><br>
                            <strong>Role:</strong> <span id="current-room-role"></span>
                        </p>
                        <button id="leave-room-btn" class="btn btn-danger">Leave Room</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    actionsDiv.insertAdjacentHTML('afterbegin', roomControlsHTML);
    setupRoomEventListeners();
}

function setupRoomEventListeners() {
    // Create room button
    const createRoomBtn = document.getElementById('create-room-btn');
    const roomNameInput = document.getElementById('room-name-input') as HTMLInputElement;

    createRoomBtn?.addEventListener('click', async () => {
        const roomName = roomNameInput?.value.trim();
        if (!roomName) {
            alert('Please enter a room name');
            return;
        }

        try {
            createRoomBtn.textContent = 'Creating...';
            createRoomBtn.setAttribute('disabled', 'true');

            console.log('Creating room with constraints:', defaultDeviceChat);

            await pc.createRoom(roomName, {
                maxParticipants: 10,
                isPrivate: false,
                constraints: defaultDeviceChat,
            });

            roomNameInput.value = '';

            // Verify local stream after room creation
            setTimeout(() => {
                console.log('Post-creation check:');
                console.log('Local stream:', pc.localStream);
                console.log('Local video element srcObject:', localVideoElement?.srcObject);

                if (pc.localStream && localVideoElement && !localVideoElement.srcObject) {
                    console.log('Restoring local video after room creation');
                    localVideoElement.srcObject = pc.localStream;
                }
            }, 1000);
        } catch (error) {
            console.error('Failed to create room:', error);
            alert('Failed to create room: ' + (error as Error).message);
        } finally {
            createRoomBtn.textContent = 'Create Room';
            createRoomBtn.removeAttribute('disabled');
        }
    });

    // Enter key for room creation
    roomNameInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            createRoomBtn?.click();
        }
    });

    // Toggle rooms list
    const toggleRoomsBtn = document.getElementById('toggle-rooms-btn');
    const roomsList = document.getElementById('rooms-list');

    toggleRoomsBtn?.addEventListener('click', () => {
        if (roomsList?.style.display === 'none') {
            roomsList.style.display = 'block';
            toggleRoomsBtn.textContent = 'Hide Available Rooms';
            loadAvailableRooms();
        } else {
            roomsList!.style.display = 'none';
            toggleRoomsBtn.textContent = 'Show Available Rooms';
        }
    });

    // Refresh rooms
    const refreshRoomsBtn = document.getElementById('refresh-rooms-btn');
    refreshRoomsBtn?.addEventListener('click', () => {
        loadAvailableRooms();
    });

    // Leave room button
    const leaveRoomBtn = document.getElementById('leave-room-btn');
    leaveRoomBtn?.addEventListener('click', async () => {
        if (!currentRoom) return;

        try {
            leaveRoomBtn.textContent = 'Leaving...';
            leaveRoomBtn.setAttribute('disabled', 'true');

            await pc.leaveRoom();
        } catch (error) {
            console.error('Failed to leave room:', error);
            alert('Failed to leave room: ' + (error as Error).message);
        } finally {
            leaveRoomBtn.textContent = 'Leave Room';
            leaveRoomBtn.removeAttribute('disabled');
        }
    });
}

async function loadAvailableRooms() {
    try {
        const refreshBtn = document.getElementById('refresh-rooms-btn');
        if (refreshBtn) {
            refreshBtn.textContent = 'Loading...';
            refreshBtn.setAttribute('disabled', 'true');
        }

        availableRooms = await pc.getAvailableRooms();
        updateRoomsList();
    } catch (error) {
        console.error('Failed to load rooms:', error);
        alert('Failed to load rooms: ' + (error as Error).message);
    } finally {
        const refreshBtn = document.getElementById('refresh-rooms-btn');
        if (refreshBtn) {
            refreshBtn.textContent = 'Refresh Rooms';
            refreshBtn.removeAttribute('disabled');
        }
    }
}

function updateRoomsList() {
    const roomsContainer = document.getElementById('rooms-container');
    if (!roomsContainer) return;

    if (availableRooms.length === 0) {
        roomsContainer.innerHTML = '<div class="alert alert-info">No rooms available</div>';
        return;
    }

    const roomsHTML = availableRooms
        .map((room) => {
            const isCurrentRoom = currentRoom?.roomId === room.roomId;
            const isFull = room.participants.length >= (room.maxParticipants || 10);
            const canJoin = !isCurrentRoom && !isFull && !currentRoom;

            return `
            <div class="list-group-item">
                <div class="d-flex w-100 justify-content-between">
                    <h6 class="mb-1">${room.roomName || room.roomId}</h6>
                    <small class="text-muted">${room.participants.length}/${room.maxParticipants || 10} participants</small>
                </div>
                <p class="mb-1">
                    <small class="text-muted">Room ID: ${room.roomId}</small><br>
                    <small class="text-muted">Participants: ${room.participants.join(', ')}</small>
                </p>
                <div class="d-flex justify-content-end">
                    ${
                        isCurrentRoom
                            ? '<button class="btn btn-danger btn-sm" onclick="leaveCurrentRoom()">Leave</button>'
                            : canJoin
                              ? `<button class="btn btn-primary btn-sm" onclick="joinRoom('${room.roomId}')">Join</button>`
                              : isFull
                                ? '<button class="btn btn-secondary btn-sm" disabled>Full</button>'
                                : '<button class="btn btn-secondary btn-sm" disabled>In Room</button>'
                    }
                </div>
            </div>
        `;
        })
        .join('');

    roomsContainer.innerHTML = roomsHTML;
}

function updateRoomUI() {
    const createRoomSection = document.getElementById('create-room-section');
    const currentRoomInfo = document.getElementById('current-room-info');
    const currentRoomName = document.getElementById('current-room-name');
    const currentRoomId = document.getElementById('current-room-id');
    const currentRoomParticipants = document.getElementById('current-room-participants');
    const currentRoomRole = document.getElementById('current-room-role');

    if (currentRoom) {
        // Hide room creation, show current room info
        if (createRoomSection) createRoomSection.style.display = 'none';
        if (currentRoomInfo) currentRoomInfo.style.display = 'block';

        if (currentRoomName) currentRoomName.textContent = currentRoom.roomName || currentRoom.roomId;
        if (currentRoomId) currentRoomId.textContent = currentRoom.roomId;
        if (currentRoomParticipants) currentRoomParticipants.textContent = currentRoom.participants.join(', ');
        if (currentRoomRole) currentRoomRole.textContent = currentRoom.isHost ? 'Host' : 'Participant';
    } else {
        // Show room creation, hide current room info
        if (createRoomSection) createRoomSection.style.display = 'flex';
        if (currentRoomInfo) currentRoomInfo.style.display = 'none';
    }
}

// Video management functions
function addRemoteVideo(userId: string, stream: MediaStream) {
    // Remove existing video for this user if any
    removeRemoteVideo(userId);

    const videosContainer = document.getElementById('videos');
    if (!videosContainer) return;

    const videoHTML = `
        <div class="video-container" id="remote-video-${userId}" data-user-id="${userId}">
            <video class="video-player" autoplay playsinline></video>
            <div class="video-label">${userId}</div>
        </div>
    `;

    videosContainer.insertAdjacentHTML('beforeend', videoHTML);

    const videoElement = document.querySelector(`#remote-video-${userId} video`) as HTMLVideoElement;
    if (videoElement) {
        videoElement.srcObject = stream;
    }
}

function removeRemoteVideo(userId: string) {
    const videoContainer = document.getElementById(`remote-video-${userId}`);
    if (videoContainer) {
        videoContainer.remove();
    }
}

function clearRemoteVideos() {
    const remoteVideos = document.querySelectorAll(
        '.video-container[data-user-id]:not([data-user-id="' + getUserName() + '"])'
    );
    remoteVideos.forEach((video) => video.remove());
}

// Global functions for button clicks (needed for dynamic HTML)
// @ts-ignore
window.joinRoom = async (roomId: string) => {
    if (currentRoom) {
        alert('Please leave your current room first');
        return;
    }

    try {
        console.log('Joining room with constraints:', defaultDeviceChat);
        await pc.joinRoom(roomId, defaultDeviceChat);

        // // Verify local stream after joining
        // setTimeout(() => {
        //     console.log('Post-join check:');
        //     console.log('Local stream:', pc.localStream);
        //     console.log('Current room participants:', pc.getRoomParticipants());
        //     console.log('Connected participants:', pc.getConnectedParticipants());
        //
        //     if (pc.localStream && localVideoElement && !localVideoElement.srcObject) {
        //         console.log('Restoring local video after room join');
        //         localVideoElement.srcObject = pc.localStream;
        //     }
        //
        //     // Check for existing participants and their connection status
        //     const participants = pc.getRoomParticipants();
        //     participants.forEach((userId) => {
        //         if (userId !== getUserName()) {
        //             const isConnected = pc.isParticipantConnected(userId);
        //             const stream = pc.getParticipantStream(userId);
        //             console.log(`Participant ${userId}: Connected=${isConnected}, HasStream=${!!stream}`);
        //
        //             if (stream && isConnected) {
        //                 console.log('Adding existing participant video:', userId);
        //                 addRemoteVideo(userId, stream);
        //             }
        //         }
        //     });
        // }, 2000);
    } catch (error) {
        console.error('Failed to join room:', error);
        alert('Failed to join room: ' + (error as Error).message);
    }
};

// @ts-ignore
window.leaveCurrentRoom = async () => {
    if (!currentRoom) return;

    try {
        await pc.leaveRoom();
    } catch (error) {
        console.error('Failed to leave room:', error);
        alert('Failed to leave room: ' + (error as Error).message);
    }
};

// Debug utilities
// @ts-ignore
window.roomDebug = {
    getCurrentRoom: () => currentRoom,
    getAvailableRooms: () => availableRooms,
    getRoomParticipants: () => pc.getRoomParticipants(),
    getConnectedParticipants: () => pc.getConnectedParticipants(),
    isInRoom: () => pc.isInRoom(),
    forceLeaveRoom: () => pc.leaveRoom(),
    refreshRooms: () => loadAvailableRooms(),
    getLocalStream: () => pc.localStream,
    checkParticipantStream: (userId: string) => {
        const stream = pc.getParticipantStream(userId);
        const isConnected = pc.isParticipantConnected(userId);
        console.log(`Participant ${userId}:`, {
            connected: isConnected,
            hasStream: !!stream,
            streamId: stream?.id,
            videoTracks: stream?.getVideoTracks().length || 0,
            audioTracks: stream?.getAudioTracks().length || 0,
        });
        return { stream, isConnected };
    },
    forceAddRemoteVideo: (userId: string) => {
        const stream = pc.getParticipantStream(userId);
        if (stream) {
            console.log('Force adding remote video for:', userId);
            addRemoteVideo(userId, stream);
        } else {
            console.log('No stream available for:', userId);
        }
    },
    restoreLocalVideo: () => {
        if (pc.localStream && localVideoElement) {
            localVideoElement.srcObject = pc.localStream;
            console.log('Local video restored');
        } else {
            console.log('Local stream or video element not available');
        }
    },
    monitorRoomConnections: () => {
        if (!currentRoom) {
            console.log('Not in a room');
            return;
        }

        console.log('=== Room Connection Monitor ===');
        console.log('Room:', currentRoom.roomId);
        console.log('Participants:', currentRoom.participants);

        const interval = setInterval(() => {
            const connected = pc.getConnectedParticipants();
            const participants = pc.getRoomParticipants();

            console.log(
                `[${new Date().toLocaleTimeString()}] Connected: ${connected.length}/${participants.length - 1}`
            );

            participants.forEach((userId) => {
                if (userId !== getUserName()) {
                    const isConnected = pc.isParticipantConnected(userId);
                    const stream = pc.getParticipantStream(userId);
                    const hasVideo = document.querySelector(`#remote-video-${userId}`);

                    console.log(
                        `  ${userId}: ${isConnected ? '✅' : '❌'} ${stream ? 'S' : 'x'} ${hasVideo ? 'V' : 'x'}`
                    );
                }
            });

            // Stop monitoring if everyone is connected or we left the room
            if (connected.length === participants.length - 1 || !pc.isInRoom()) {
                clearInterval(interval);
                console.log('Connection monitoring stopped');
            }
        }, 3000);

        // Auto-stop after 30 seconds
        setTimeout(() => {
            clearInterval(interval);
            console.log('Connection monitoring timeout');
        }, 30000);
    },
    debugConnection: (userId?: string) => pc.debugConnectionState(userId),
};

// Initialize the room controls when the script loads
document.addEventListener('DOMContentLoaded', () => {
    createRoomControls();
});

// If DOM is already loaded, create controls immediately
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createRoomControls);
} else {
    createRoomControls();
}

console.log('Room RTC Client initialized. Debug functions available at window.roomDebug');
