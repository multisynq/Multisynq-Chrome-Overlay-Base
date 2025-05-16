// File: src/syncOverlay.js
import { Session, Model, View } from '@multisynq/client';

// Replace with your actual Multisynq API key once
const DEFAULT_API_KEY = '';
// Unique identifier for your app (use reverse-domain style)
const APP_ID = 'com.multisynq.syncOverlay';

// Define trivial Model and View classes for the session
class OverlayModel extends Model {
  init(props) {
    super.init(props);
    this.cursors = new Map();
    this.highlights = [];
    this.subscribe(this.sessionId, "cursorMoved", this.handleCursorMoved);
    this.subscribe(this.sessionId, "highlight", this.handleHighlight);
    console.log('OverlayModel.init called', props);
    console.log('OverlayModel sessionId:', this.sessionId);
    console.log('Model subscribing to cursorMoved and highlight on', this.sessionId);
    window._lastOverlayModel = this;
  }

  handleCursorMoved(event) {
    this.cursors.set(event.userId, event); // store the full event
    // Directly update the global overlayView for rendering
    if (window.overlayView && window.overlayView.cursors) {
      window.overlayView.cursors.set(event.userId, event);
    }
    this.publish(this.sessionId, "cursorUpdate", event);
  }

  handleHighlight(h) {
    this.highlights.push(h);
    // Directly update the global overlayView for rendering
    if (window.overlayView && window.overlayView.highlights) {
      window.overlayView.highlights.push(h);
    }
    this.publish(this.sessionId, "highlightUpdate", h);
  }
}
window.OverlayModel = OverlayModel;

class OverlayView extends View {
  init(model) {
    super.init(model);
    this.cursors = new Map();
    this.highlights = [];
    this.subscribe(this.sessionId, "cursorUpdate", (event) => {
      if (window.overlayView && window.overlayView.cursors) {
        window.overlayView.cursors.set(event.userId, event);
      }
    });
    this.subscribe(this.sessionId, "highlightUpdate", (h) => {
      console.log('Direct subscription: highlightUpdate', h, 'sessionId:', this.sessionId);
      if (window.overlayView && window.overlayView.highlights) {
        window.overlayView.highlights.push(h);
      }
    });
    console.log('OverlayView.init called', model);
    console.log('OverlayView sessionId:', this.sessionId, 'viewId:', this.viewId);
    console.log('View subscribing to cursorUpdate and highlightUpdate on', this.sessionId);
    // view logic handled outside
  }
}
window.OverlayView = OverlayView;

OverlayModel.register('OverlayModel');

function getUniqueSelector(node) {
  if (!node) return '';
  if (node.id) return `#${node.id}`;
  if (node === document.body) return 'body';
  let path = [];
  while (node && node.nodeType === 1 && node !== document.body) {
    let name = node.nodeName.toLowerCase();
    let sib = node, idx = 1;
    while ((sib = sib.previousElementSibling)) idx++;
    path.unshift(`${name}:nth-child(${idx})`);
    node = node.parentElement;
  }
  return 'body > ' + path.join(' > ');
}

function getTextNodeAndOffset(selector, offset) {
  const el = document.querySelector(selector);
  if (!el) return { node: null, offset: 0 };
  let node = el.firstChild;
  let remaining = offset;
  while (node && node.nodeType === 3) {
    if (remaining <= node.length) return { node, offset: remaining };
    remaining -= node.length;
    node = node.nextSibling;
  }
  return { node: el.firstChild, offset: 0 };
}

function getRangeFromHighlight(h) {
  const { selector, startOffset, endOffset } = h;
  const el = document.querySelector(selector);
  if (!el) return null;
  let range = document.createRange();
  let { node: startNode, offset: start } = getTextNodeAndOffset(selector, startOffset);
  let { node: endNode, offset: end } = getTextNodeAndOffset(selector, endOffset);
  if (!startNode || !endNode) return null;
  range.setStart(startNode, start);
  range.setEnd(endNode, end);
  return range;
}

function getCursorRelativePosition(e) {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return {
    selector: getUniqueSelector(el),
    relX: rect.width ? (e.clientX - rect.left) / rect.width : 0.5,
    relY: rect.height ? (e.clientY - rect.top) / rect.height : 0.5,
    absX: e.clientX + window.scrollX,
    absY: e.clientY + window.scrollY
  };
}

let overlayEnabled = false;
let overlayElements = [];
let cleanupSession = null;

// --- Cursor Sharing: 10/sec Rate Limiting ---
let lastCursorSend = 0;
const CURSOR_SEND_INTERVAL = 100; // ms (10 per second)

function handleMouseMove(e) {
  if (!overlayEnabled || !overlayView) return;
  const now = Date.now();
  if (now - lastCursorSend < CURSOR_SEND_INTERVAL) return;
  lastCursorSend = now;
  const pos = getCursorRelativePosition(e);
  if (!pos) return;
  const eventData = {
    userId: overlayView.viewId,
    ...pos
  };
  overlayView.publish(overlayView.sessionId, 'cursorMoved', eventData);
}

function removeOverlayElements() {
  overlayElements.forEach(el => el.remove());
  overlayElements = [];
}

function initOverlay() {
  console.log('initOverlay() called');
  let overlayView;
  let cursors;
  let highlights;
  let listeners = [];

  const overlay = document.createElement('div');
  overlay.id = 'msq-overlay';
  document.documentElement.appendChild(overlay);
  overlayElements.push(overlay);

  const canvas = document.createElement('canvas');
  canvas.id = 'msq-canvas';
  overlay.appendChild(canvas);
  overlayElements.push(canvas);
  const ctx = canvas.getContext('2d');

  const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  window.addEventListener('resize', resize);
  listeners.push(['resize', resize]);
  resize();

  async function startSession({ name, apiKey }) {
    const key = apiKey || DEFAULT_API_KEY;
    console.log('Session name:', name);
    console.log('Joining session:', name, 'appId:', APP_ID, 'apiKey:', key);
    console.log('window.OverlayModel:', window.OverlayModel);
    try {
      const result = await Session.join({
        apiKey: key,
        appId: APP_ID,
        name,
        model: window.OverlayModel,
        view: window.OverlayView,
        password: 'wiflabs'
      });
      overlayView = result.view;
      window.overlayView = overlayView;
      if (!overlayView.cursors) overlayView.cursors = new Map();
      if (!overlayView.highlights) overlayView.highlights = [];
      cursors = overlayView.cursors;
      highlights = overlayView.highlights;
      console.log('overlayView:', overlayView);
      console.dir(overlayView);
      console.log('overlayView keys:', Object.keys(overlayView));
      console.log('overlayView prototype:', Object.getPrototypeOf(overlayView));
      console.log('overlayView.getModel:', overlayView.getModel ? overlayView.getModel() : undefined);
      console.log('overlayView.model:', overlayView?.model);
    } catch (e) {
      console.error('Session.join failed:', e);
      return;
    }
    if (!overlayView) {
      console.error('overlayView is undefined!', { overlayView });
      return;
    }

    // local events
    const mousemove = e => {
      handleMouseMove(e);
    };
    const mouseup = () => {
      const sel = window.getSelection();
      if (!sel.isCollapsed) {
        const range = sel.getRangeAt(0);
        const selector = getUniqueSelector(range.startContainer.parentElement);
        const startOffset = range.startOffset;
        const endOffset = range.endOffset;
        const eventData = {
          selector,
          startOffset,
          endOffset,
          text: sel.toString()
        };
        overlayView.publish(overlayView.sessionId, 'highlight', eventData);
        sel.removeAllRanges();
      }
    };
    window.addEventListener('mousemove', mousemove);
    document.addEventListener('mouseup', mouseup);
    listeners.push(['mousemove', mousemove]);
    listeners.push(['mouseup', mouseup]);

    function render() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (overlayView && overlayView.highlights) {
        overlayView.highlights.forEach(h => {
          const range = getRangeFromHighlight(h);
          if (range) {
            const rect = range.getBoundingClientRect();
            ctx.fillStyle = 'rgba(255,255,0,0.3)';
            ctx.fillRect(rect.x + window.scrollX, rect.y + window.scrollY, rect.width, rect.height);
          }
        });
      }
      if (overlayView && overlayView.cursors) {
        overlayView.cursors.forEach(({ selector, relX, relY, absX, absY }) => {
          const el = document.querySelector(selector);
          let x, y;
          if (el) {
            const rect = el.getBoundingClientRect();
            if (rect.width && rect.height) {
              x = rect.left + relX * rect.width + window.scrollX;
              y = rect.top + relY * rect.height + window.scrollY;
            } else {
              x = absX;
              y = absY;
            }
          } else {
            x = absX;
            y = absY;
          }
          ctx.beginPath(); ctx.arc(x, y, 5, 0, 2 * Math.PI);
          ctx.fillStyle = 'rgba(0,150,255,0.6)'; ctx.fill();
        });
      }
      if (overlayEnabled) requestAnimationFrame(render);
    }

    requestAnimationFrame(render);

    cleanupSession = () => {
      listeners.forEach(([evt, fn]) => {
        if (evt === 'mousemove') window.removeEventListener(evt, fn);
        else document.removeEventListener(evt, fn);
      });
      window.removeEventListener('resize', resize);
      removeOverlayElements();
      overlayEnabled = false;
      cleanupSession = null;
    };
  }

  // initialization (no storage-watcher needed)
  function init() {
    // Use the page URI as the session name
    const name = window.location.href;
    const apiKey = DEFAULT_API_KEY;
    startSession({ name, apiKey });
    overlayEnabled = true;
  }

  return { init };
}

// Auto-start the overlay when this module loads

// --- Lobby/Channel/Chat Integration ---

// Chat state per channel
const chatState = {};
let currentChannel = null;
let multisynqSession = null;
let overlayView = null;
let cursors = null;
let highlights = null;
let users = {};

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
}

function colorForUser(id) {
  const colors = ['#007bff','#5cb85c','#f0ad4e','#d9534f','#6f42c1','#20c997','#fd7e14','#17a2b8'];
  let hash = 0; for (let i=0; i<id.length; ++i) hash = id.charCodeAt(i) + ((hash<<5)-hash);
  return colors[Math.abs(hash)%colors.length];
}

function ensureChatState(channel) {
  if (!chatState[channel]) {
    chatState[channel] = {
      messages: [],
      users: {},
    };
  }
  return chatState[channel];
}

// Helper to sanitize channel/session names for Multisynq (no colons or slashes)
function sanitizeChannelName(name) {
  return name.replace(/^https?:\/\//, '').replace(/[:/]/g, '_');
}

async function joinChannel(channel) {
  const safeChannel = sanitizeChannelName(channel);
  if (multisynqSession) {
    try { await multisynqSession.leave && multisynqSession.leave(); } catch(e) {}
    multisynqSession = null;
    overlayView = null;
    cursors = null;
    highlights = null;
    users = {};
  }
  currentChannel = safeChannel;
  // Join Multisynq session for this channel
  try {
    const result = await Session.join({
      name: safeChannel,
      apiKey: DEFAULT_API_KEY,
      appId: APP_ID,
      model: window.OverlayModel,
      view: window.OverlayView,
      events: {
        chat: onChatMessage,
        userlist: onUserList,
        typing: onTyping,
      },
      password: 'wiflabs',
    });
    multisynqSession = result.view;
    overlayView = result.view;
    if (!overlayView.cursors) overlayView.cursors = new Map();
    if (!overlayView.highlights) overlayView.highlights = [];
    cursors = overlayView.cursors;
    highlights = overlayView.highlights;
    // Announce presence
    const username = 'Anon';
    users[multisynqSession.viewId] = username;
    multisynqSession.publish(safeChannel, 'userlist', { userId: multisynqSession.viewId, username, join: true });
    multisynqSession.publish(safeChannel, 'userlist', { userId: multisynqSession.viewId, username, request: true });
  } catch (e) {
    console.error('Failed to join channel', safeChannel, e);
  }
}

function onChatMessage({ room, userId: fromId, username: fromName, text, time }) {
  const safeRoom = sanitizeChannelName(room);
  const state = ensureChatState(safeRoom);
  state.messages.push({ userId: fromId, username: fromName, text, time, initials: getInitials(fromName), color: colorForUser(fromId) });
  // Broadcast to popup if this is the current channel
  if (safeRoom === currentChannel) {
    chrome.runtime.sendMessage({ type: 'CHAT_UPDATE', room: safeRoom, messages: state.messages, users: Object.values(state.users) });
  }
}

function onUserList({ room, userId: uid, username: uname, join, leave, request }) {
  const safeRoom = sanitizeChannelName(room);
  const state = ensureChatState(safeRoom);
  if (join) state.users[uid] = { userId: uid, username: uname, initials: getInitials(uname), color: colorForUser(uid) };
  if (leave) delete state.users[uid];
  if (request && multisynqSession) {
    multisynqSession.publish(safeRoom, 'userlist', { userId: multisynqSession.viewId, username: 'Anon', join: true });
  }
  if (safeRoom === currentChannel) {
    chrome.runtime.sendMessage({ type: 'CHAT_UPDATE', room: safeRoom, messages: state.messages, users: Object.values(state.users) });
  }
}

function onTyping({ room, userId: uid, username: uname }) {
  // Optionally implement typing indicator
}

// Listen for popup messages
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'SEND_CHAT') {
      if (!multisynqSession) return;
      const username = 'Anon';
      const chatMsg = { room: currentChannel, userId: multisynqSession.viewId, username, text: msg.text, time: Date.now(), initials: getInitials(username), color: colorForUser(multisynqSession.viewId) };
      multisynqSession.publish(currentChannel, 'chat', chatMsg);
      // Locally add message for immediate feedback
      const state = ensureChatState(currentChannel);
      state.messages.push(chatMsg);
      chrome.runtime.sendMessage({ type: 'CHAT_UPDATE', room: currentChannel, messages: state.messages, users: Object.values(state.users) });
    } else if (msg.type === 'GET_CHAT_HISTORY') {
      const state = ensureChatState(msg.room);
      sendResponse({ messages: state.messages, users: Object.values(state.users) });
    } else if (msg.type === 'SWITCH_CHANNEL') {
      joinChannel(msg.channel);
    }
    // Overlay controls, etc. handled as before
    if (msg.type === 'GET_OVERLAY_STATE') {
      sendResponse({ enabled: overlayEnabled });
      return true;
    }
    if (msg.type === 'TOGGLE_OVERLAY') {
      if (!overlayEnabled) {
        const overlay = initOverlay();
        overlay.init();
        sendResponse({ enabled: true });
      } else if (cleanupSession) {
        cleanupSession();
        sendResponse({ enabled: false });
      }
      return true;
    }
  });
}

// On load, join default channel (page URI)
const defaultChannel = sanitizeChannelName(window.location.origin + window.location.pathname);
joinChannel(defaultChannel);
