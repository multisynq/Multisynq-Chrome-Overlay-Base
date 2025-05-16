// Listen for the toggle button click and send a message to the content script
const btn = document.getElementById('toggleBtn');

function updateButton(enabled) {
  btn.textContent = enabled ? 'Stop Browsing Together' : 'Start Browsing Together';
}

// Query the current tab to get the overlay state
chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
  chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_OVERLAY_STATE' }, res => {
    updateButton(res && res.enabled);
  });
});

btn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_OVERLAY' }, res => {
      updateButton(res && res.enabled);
    });
  });
});

// Tab switching logic
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.tab-panel');
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    panels.forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    const panelId = tab.dataset.tab + 'Panel';
    document.getElementById(panelId).classList.add('active');
  });
});

// Together tab button logic
function flashButton(btn) {
  btn.classList.add('single');
  setTimeout(() => btn.classList.remove('single'), 300);
}

const drawBtn = document.getElementById('drawBtn');
const sharePointerBtn = document.getElementById('sharePointerBtn');
const syncScrollBtn = document.getElementById('syncScrollBtn');
const syncUrlBtn = document.getElementById('syncUrlBtn');
const clearDrawBtn = document.getElementById('clearDrawBtn');
const highlightAllBtn = document.getElementById('highlightAllBtn');

let drawEnabled = false;
let sharePointerEnabled = false;

drawBtn.addEventListener('click', () => {
  drawEnabled = !drawEnabled;
  drawBtn.classList.toggle('toggle-on', drawEnabled);
  drawBtn.classList.toggle('toggle-off', !drawEnabled);
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_DRAW', enabled: drawEnabled });
  });
});

sharePointerBtn.addEventListener('click', () => {
  sharePointerEnabled = !sharePointerEnabled;
  sharePointerBtn.classList.toggle('toggle-on', sharePointerEnabled);
  sharePointerBtn.classList.toggle('toggle-off', !sharePointerEnabled);
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_SHARE_POINTER', enabled: sharePointerEnabled });
  });
});

syncScrollBtn.addEventListener('click', () => {
  flashButton(syncScrollBtn);
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'SYNC_SCROLL' });
  });
});

syncUrlBtn.addEventListener('click', () => {
  flashButton(syncUrlBtn);
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'SYNC_URL' });
  });
});

clearDrawBtn.addEventListener('click', () => {
  flashButton(clearDrawBtn);
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'CLEAR_DRAWINGS' });
  });
});

highlightAllBtn.addEventListener('click', () => {
  flashButton(highlightAllBtn);
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'HIGHLIGHT_ALL' });
  });
});

// --- Chat/Overlay UI <-> Content Script Messaging ---
// Remove all Multisynq/chat/overlay logic from popup.js. Only send/receive messages.

// Chat state (for UI only)
let currentRoom = 'general';
let unread = { general: false, topic: false, private: false };

const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');
const chatRoomBtns = document.querySelectorAll('.chat-room-btn');
const chatUsers = document.getElementById('chatUsers');

function scrollMessagesToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderMessages(messages) {
  chatMessages.innerHTML = '';
  messages.forEach(msg => {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message';
    const avatar = document.createElement('div');
    avatar.className = 'chat-avatar';
    avatar.textContent = msg.initials || '?';
    const content = document.createElement('div');
    content.className = 'chat-msg-content';
    const meta = document.createElement('div');
    meta.className = 'chat-meta';
    meta.textContent = msg.username + ' • ' + (new Date(msg.time||Date.now())).toLocaleTimeString();
    content.appendChild(meta);
    content.appendChild(document.createTextNode(msg.text));
    msgDiv.appendChild(avatar);
    msgDiv.appendChild(content);
    chatMessages.appendChild(msgDiv);
  });
  scrollMessagesToBottom();
}

function renderUsers(users) {
  chatUsers.innerHTML = '';
  users.forEach(u => {
    const el = document.createElement('div');
    el.className = 'chat-user';
    el.title = u.username;
    el.textContent = u.initials || '?';
    chatUsers.appendChild(el);
  });
}

function requestChatHistory() {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_CHAT_HISTORY', room: currentRoom }, res => {
      if (res && res.messages) renderMessages(res.messages);
      if (res && res.users) renderUsers(res.users);
    });
  });
}

function sendChatMessage() {
  const text = chatInput.value.trim();
  if (!text) return;
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'SEND_CHAT', room: currentRoom, text });
  });
  chatInput.value = '';
}

sendChatBtn.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});

chatRoomBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.room === currentRoom) return;
    currentRoom = btn.dataset.room;
    requestChatHistory();
  });
});

// Listen for chat updates from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'CHAT_UPDATE' && msg.room === currentRoom) {
    renderMessages(msg.messages);
    renderUsers(msg.users);
  }
});

// On popup open, request chat history for current room
requestChatHistory();
