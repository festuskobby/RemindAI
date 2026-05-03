/* ─────────────────────────────────────────
   RemindAI — app.js
   All client-side logic. API calls go through
   the Netlify serverless proxy at /api/claude
───────────────────────────────────────── */

// ── State ──────────────────────────────────
let reminders = JSON.parse(localStorage.getItem('remindai_reminders') || '[]');
let isListening = false;
let recognition = null;
let notifTimers = [];

// ── Categories ─────────────────────────────
const CATEGORY_EMOJI = {
  GENERAL: '📋', WORK: '💼', VEHICLE: '🚗',
  HEALTH: '🏥', PERSONAL: '👤', MEETING: '📞', FINANCE: '💰'
};

// ── Init ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  updateClock();
  setInterval(updateClock, 1000);
  setGreeting();
  document.getElementById('init-time').textContent = getTimeStr();
  initSpeechRecognition();
  renderReminders();
  scheduleAllNotifications();
  checkNotifPermission();
});

// ── Clock & Greeting ────────────────────────
function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent =
    now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function setGreeting() {
  const h = new Date().getHours();
  const el = document.getElementById('greeting');
  const part = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  el.innerHTML = `Good ${part} — <span>what should I remind you about?</span>`;
}

function getTimeStr() {
  return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ── Tab Switching ───────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + tab).classList.add('active');
  document.getElementById('nav-' + tab).classList.add('active');
  if (tab === 'reminders') renderReminders();
}

// ── Send Message ────────────────────────────
async function sendMessage() {
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  input.style.height = '';

  addUserMessage(text);
  showTyping(true);

  try {
    const now = new Date();
    const currentDateTime = now.getFullYear() + '-' +
      String(now.getMonth()+1).padStart(2,'0') + '-' +
      String(now.getDate()).padStart(2,'0') + 'T' +
      String(now.getHours()).padStart(2,'0') + ':' +
      String(now.getMinutes()).padStart(2,'0') + ':00';

    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, currentDateTime })
    });

    const data = await res.json();

    showTyping(false);

    if (!res.ok || !data.success) {
      const errMsg = data.error || 'Something went wrong. Please try again.';
      addAiMessage(errMsg, null);
      return;
    }

    const r = data.reminder;

    // Apply lead time offset from settings
    const leadMins = parseInt(document.getElementById('lead-time')?.value || '0');
    const triggerMs = new Date(r.triggerTimestamp).getTime() - (leadMins * 60 * 1000);

    const reminder = {
      id: Date.now(),
      title: r.title,
      description: r.description || '',
      triggerTimestamp: r.triggerTimestamp,
      triggerMs,
      category: r.category || 'GENERAL',
      recurrence: r.recurrence || 'NONE',
      isCompleted: false,
      createdAt: Date.now()
    };

    reminders.unshift(reminder);
    saveReminders();
    scheduleNotification(reminder);

    addAiMessage(r.confirmationMessage, reminder);

  } catch (err) {
    showTyping(false);
    addAiMessage('Network error. Please check your connection and try again.', null);
    console.error('RemindAI error:', err);
  }
}

// ── Message Rendering ───────────────────────
function addUserMessage(text) {
  const chat = document.getElementById('chat-area');
  const typing = document.getElementById('typing-indicator');
  const div = document.createElement('div');
  div.className = 'msg user';
  div.innerHTML = `
    <div class="msg-bubble">${escapeHtml(text)}</div>
    <div class="msg-time">${getTimeStr()}</div>
  `;
  chat.insertBefore(div, typing);
  scrollChat();
}

function addAiMessage(text, reminder) {
  const chat = document.getElementById('chat-area');
  const typing = document.getElementById('typing-indicator');

  let cardHtml = '';
  if (reminder) {
    const dt = formatDateTime(reminder.triggerTimestamp);
    const emoji = CATEGORY_EMOJI[reminder.category] || '📋';
    cardHtml = `
      <div class="confirm-card">
        <div class="confirm-header">
          <div class="confirm-dot"></div>
          <div class="confirm-label">Reminder Set</div>
        </div>
        <div class="confirm-title">${escapeHtml(reminder.title)}</div>
        <div class="confirm-meta">${dt}</div>
        <div class="confirm-cat">${emoji} ${capitalize(reminder.category)}</div>
      </div>
    `;
  }

  const div = document.createElement('div');
  div.className = 'msg ai';
  div.innerHTML = `
    <div class="msg-bubble">
      ${escapeHtml(text)}
      ${cardHtml}
    </div>
    <div class="msg-time">${getTimeStr()}</div>
  `;
  chat.insertBefore(div, typing);
  scrollChat();
}

function showTyping(show) {
  const el = document.getElementById('typing-indicator');
  if (show) {
    el.classList.add('visible');
    scrollChat();
  } else {
    el.classList.remove('visible');
  }
}

function scrollChat() {
  const chat = document.getElementById('chat-area');
  setTimeout(() => { chat.scrollTop = chat.scrollHeight; }, 50);
}

// ── Quick Chips ─────────────────────────────
function insertChip(text) {
  const input = document.getElementById('msg-input');
  input.value = text;
  input.focus();
  input.setSelectionRange(text.length, text.length);
}

// ── Input helpers ───────────────────────────
function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 80) + 'px';
}

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

// ── Voice Input ─────────────────────────────
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    isListening = true;
    document.getElementById('mic-btn').classList.add('listening');
    showVoiceHint(true);
  };

  recognition.onresult = (e) => {
    const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
    const input = document.getElementById('msg-input');
    input.value = transcript;
    autoGrow(input);

    if (e.results[e.results.length - 1].isFinal) {
      stopListening();
      const autoSend = document.getElementById('auto-send')?.checked;
      if (autoSend) setTimeout(sendMessage, 300);
    }
  };

  recognition.onerror = () => stopListening();
  recognition.onend = () => stopListening();
}

function toggleMic() {
  if (!recognition) {
    showToast('Voice input not supported in this browser. Try Chrome.');
    return;
  }
  if (isListening) {
    stopListening();
  } else {
    try {
      recognition.start();
    } catch(e) {
      stopListening();
    }
  }
}

function stopListening() {
  isListening = false;
  document.getElementById('mic-btn').classList.remove('listening');
  showVoiceHint(false);
  try { recognition?.stop(); } catch(e) {}
}

function showVoiceHint(show) {
  let hint = document.querySelector('.voice-hint');
  if (!hint) {
    hint = document.createElement('div');
    hint.className = 'voice-hint';
    hint.textContent = '🎤 Listening…';
    document.querySelector('.app-shell').appendChild(hint);
  }
  hint.classList.toggle('visible', show);
}

// ── Reminders View ───────────────────────────
function renderReminders() {
  const upcoming = reminders.filter(r => !r.isCompleted);
  const completed = reminders.filter(r => r.isCompleted);

  const upcomingEl = document.getElementById('upcoming-list');
  const completedEl = document.getElementById('completed-list');
  const completedLabel = document.getElementById('completed-label');

  upcomingEl.innerHTML = upcoming.length
    ? upcoming.map(r => reminderCardHtml(r, false)).join('')
    : '<div class="empty-state">No upcoming reminders.<br>Head to Chat to add one!</div>';

  if (completed.length) {
    completedLabel.style.display = '';
    completedEl.innerHTML = completed.map(r => reminderCardHtml(r, true)).join('');
  } else {
    completedLabel.style.display = 'none';
    completedEl.innerHTML = '';
  }
}

function reminderCardHtml(r, done) {
  const emoji = CATEGORY_EMOJI[r.category] || '📋';
  const dt = formatDateTime(r.triggerTimestamp);
  const opacity = done ? 'opacity:0.5;' : '';
  return `
    <div class="reminder-card" style="${opacity}">
      <div class="reminder-emoji">${emoji}</div>
      <div class="reminder-info">
        <div class="reminder-title${done ? ' done' : ''}">${escapeHtml(r.title)}</div>
        <div class="reminder-when">${dt}</div>
        <div class="reminder-cat">${capitalize(r.category)}${r.recurrence !== 'NONE' ? ' · ' + capitalize(r.recurrence) : ''}</div>
      </div>
      <div class="reminder-actions">
        ${!done ? `<button class="action-btn complete" onclick="completeReminder(${r.id})" title="Mark complete">✓</button>` : ''}
        <button class="action-btn delete" onclick="deleteReminder(${r.id})" title="Delete">✕</button>
      </div>
    </div>
  `;
}

function completeReminder(id) {
  const r = reminders.find(r => r.id === id);
  if (r) { r.isCompleted = true; saveReminders(); renderReminders(); }
}

function deleteReminder(id) {
  reminders = reminders.filter(r => r.id !== id);
  saveReminders();
  renderReminders();
}

function saveReminders() {
  localStorage.setItem('remindai_reminders', JSON.stringify(reminders));
}

// ── Browser Notifications ───────────────────
function checkNotifPermission() {
  if (!('Notification' in window)) return;
  const toggle = document.getElementById('notif-toggle');
  if (toggle) toggle.checked = Notification.permission === 'granted';
}

function requestNotifPermission(checkbox) {
  if (!('Notification' in window)) {
    showToast('Notifications not supported in this browser.');
    if (checkbox) checkbox.checked = false;
    return;
  }
  if (checkbox.checked) {
    Notification.requestPermission().then(perm => {
      if (perm !== 'granted') {
        showToast('Notification permission denied. Enable in browser settings.');
        checkbox.checked = false;
      }
    });
  }
}

function scheduleNotification(reminder) {
  if (Notification.permission !== 'granted') return;
  const delay = reminder.triggerMs - Date.now();
  if (delay <= 0) return;

  const timer = setTimeout(() => {
    new Notification(`⏰ RemindAI: ${reminder.title}`, {
      body: reminder.description || formatDateTime(reminder.triggerTimestamp),
      icon: '/icon.png',
      badge: '/icon.png'
    });
    const r = reminders.find(r => r.id === reminder.id);
    if (r) { r.isCompleted = true; saveReminders(); }
  }, delay);

  notifTimers.push(timer);
}

function scheduleAllNotifications() {
  if (Notification.permission !== 'granted') return;
  reminders.filter(r => !r.isCompleted).forEach(scheduleNotification);
}

// ── Utilities ───────────────────────────────
function formatDateTime(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });
  } catch(e) { return isoStr; }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : '';
}

function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.querySelector('.app-shell').appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}
