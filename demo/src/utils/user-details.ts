let _toUserId = 'Rob-????';
let _userName = 'Rob-' + Math.floor(Math.random() * 100000);

export const password = 'x';

const userNameEl = document.querySelector('#user-name') as Element;

export const getUserName = () => _userName;
export const updateToUserId = (userId: string) => (_toUserId = userId);
export const getToUserId = () => _toUserId;

export function updateUserName(userName: string) {
    _userName = userName;
    userNameEl.innerHTML = userName;
}

updateUserName(_userName);
