let _toUserId = 'Rob-????';
let _userName = 'Rob-' + Math.floor(Math.random() * 100000);
let _roomId = 'the_kings';

export const password = 'x';

const userNameEl = document.querySelector('#user-name') as Element;

export const getUserName = () => _userName;
export const updateToUserId = (userId: string) => (_toUserId = userId);
export const getToUserId = () => _toUserId;
export const getRoomId = () => _roomId;

export function updateUserName(userName: string) {
    _userName = userName;
    userNameEl.innerHTML = userName;
}

updateUserName(_userName);
