// ============================================================
// PingUp Messenger — Полная версия v3
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, serverTimestamp, arrayUnion, arrayRemove, limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDabgrOHjzPSLjBJs8wwVutsHbQ4SF316Q",
  authDomain: "pingup-messenger.firebaseapp.com",
  projectId: "pingup-messenger",
  storageBucket: "pingup-messenger.firebasestorage.app",
  messagingSenderId: "158687830003",
  appId: "1:158687830003:web:b5c1ac59ec9dae69aa3c86"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

const ADMIN_PASSWORD = "Jwyzyqh1c492bJJjoqv119wvwmdl";
const MAX_ACCOUNTS = 3;
const STORAGE_KEY = "pingup_accounts";
const CURRENT_ACC_KEY = "pingup_current";

const state = {
  currentUser: null,
  currentChatId: null,
  currentChat: null,
  unsubMessages: null,
  unsubChats: null,
  unsubPresence: null,
  attachments: [],
  isRecording: false,
  mediaRecorder: null,
  audioChunks: [],
  editingMessageId: null,
  stickerPanelOpen: false,
  dmUsersCache: {}
};

const $ = id => document.getElementById(id);

const els = {
  loadingScreen: $("loading-screen"),
  bannedScreen: $("banned-screen"),
  loginScreen: $("login-screen"),
  appScreen: $("app-screen"),
  loginName: $("login-name"),
  loginUsername: $("login-username"),
  loginPassword: $("login-password"),
  loginError: $("login-error"),
  btnLogin: $("btn-login"),
  savedAccounts: $("saved-accounts"),
  sidebar: $("sidebar"),
  myProfileBtn: $("my-profile-btn"),
  btnFavorites: $("btn-favorites"),
  btnSettings: $("btn-settings"),
  searchInput: $("search-input"),
  searchResults: $("search-results"),
  chatList: $("chat-list"),
  chatPlaceholder: $("chat-placeholder"),
  activeChat: $("active-chat"),
  chatAvatar: $("chat-avatar"),
  chatName: $("chat-name"),
  chatStatus: $("chat-status"),
  chatHeaderInfo: $("chat-header-info"),
  btnChatMenu: $("btn-chat-menu"),
  messagesContainer: $("messages-container"),
  messageInputBar: $("message-input-bar"),
  messageInput: $("message-input"),
  btnSend: $("btn-send"),
  btnVoice: $("btn-voice"),
  btnAttachFile: $("btn-attach-file"),
  btnAttachImage: $("btn-attach-image"),
  btnStickers: $("btn-stickers"),
  stickerPanel: $("sticker-panel"),
  attachmentsPreview: $("attachments-preview"),
  editIndicator: $("edit-indicator"),
  cancelEdit: $("cancel-edit"),
  inputBlockedMsg: $("input-blocked-msg"),
  btnCreateGroup: $("btn-create-group"),
  btnCreateChannel: $("btn-create-channel"),
  btnBackMobile: $("btn-back-mobile"),
  modalRoot: $("modal-root"),
  contextMenuRoot: $("context-menu-root"),
  toastContainer: $("toast-container"),
  fileInput: $("file-input"),
  imageInput: $("image-input"),
  avatarInput: $("avatar-input"),
  stickerInput: $("sticker-input"),
  imageViewerRoot: $("image-viewer-root"),
  bannedLogoutBtn: $("banned-logout-btn")
};

// ============================================================
// УТИЛИТЫ
// ============================================================
function showScreen(name) {
  els.loadingScreen.classList.add("hidden");
  els.bannedScreen.classList.add("hidden");
  els.loginScreen.classList.add("hidden");
  els.appScreen.classList.add("hidden");
  $(`${name}-screen`)?.classList.remove("hidden");
}

function showToast(msg, type = "success") {
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  els.toastContainer.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function getInitials(name) { return name ? name.charAt(0).toUpperCase() : "?"; }
function getChatEmoji(type) { return type === "dm" ? "👤" : type === "group" ? "👥" : type === "channel" ? "📢" : "💬"; }

function formatTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function formatDuration(s) { return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`; }
function formatFileSize(b) { return b < 1024 ? b + ' Б' : b < 1048576 ? (b/1024).toFixed(1) + ' КБ' : (b/1048576).toFixed(1) + ' МБ'; }
function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t || ''; return d.innerHTML; }
function generateUid(u) { return `user_${u.toLowerCase()}`; }

function showModal(html) {
  els.modalRoot.innerHTML = `<div class="modal-overlay" id="modal-overlay"><div class="modal">${html}</div></div>`;
  $("modal-overlay").addEventListener("click", e => { if (e.target.id === "modal-overlay") closeModal(); });
}

function closeModal() { els.modalRoot.innerHTML = ""; }

function showContextMenu(x, y, items) {
  let html = '<div class="context-menu" id="context-menu">';
  items.forEach(item => {
    html += `<div class="context-menu-item ${item.danger ? 'danger' : ''}" data-action="${item.action}">${item.icon || ''} ${item.label}</div>`;
  });
  html += '</div>';
  els.contextMenuRoot.innerHTML = html;
  
  const menu = $("context-menu");
  menu.style.left = Math.min(x, window.innerWidth - 180) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - 200) + 'px';
  
  menu.querySelectorAll(".context-menu-item").forEach(el => {
    el.addEventListener("click", () => {
      const item = items.find(i => i.action === el.dataset.action);
      if (item?.onClick) item.onClick();
      closeContextMenu();
    });
  });
  
  setTimeout(() => document.addEventListener("click", closeContextMenu, { once: true }), 10);
}

function closeContextMenu() { els.contextMenuRoot.innerHTML = ""; }

function showImageViewer(url) {
  els.imageViewerRoot.innerHTML = `<div class="image-viewer"><button class="image-viewer-close">✕</button><img src="${url}" /></div>`;
  els.imageViewerRoot.querySelector(".image-viewer").addEventListener("click", () => { els.imageViewerRoot.innerHTML = ""; });
}

function verifiedBadge(size = "") { return `<span class="verified-badge ${size}" title="Верифицирован">✓</span>`; }

async function uploadFile(file, path) {
  try {
    const storageRef = ref(storage, path);
    const snapshot = await uploadBytes(storageRef, file);
    const url = await getDownloadURL(snapshot.ref);
    return url;
  } catch (err) {
    console.error("Upload error:", err);
    throw err;
  }
}

// Уведомления
async function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

function sendNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
    new Notification(title, { body, icon: '💬' });
  }
}

// ============================================================
// АККАУНТЫ
// ============================================================
function getAccounts() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}

function saveAccounts(accounts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts.slice(0, MAX_ACCOUNTS)));
}

function getCurrentAccountId() {
  return localStorage.getItem(CURRENT_ACC_KEY);
}

function setCurrentAccountId(uid) {
  localStorage.setItem(CURRENT_ACC_KEY, uid);
}

function addAccount(user) {
  const accounts = getAccounts();
  const exists = accounts.findIndex(a => a.uid === user.uid);
  if (exists >= 0) {
    accounts[exists] = user;
  } else if (accounts.length < MAX_ACCOUNTS) {
    accounts.push(user);
  } else {
    showToast("Максимум 3 аккаунта", "error");
    return false;
  }
  saveAccounts(accounts);
  setCurrentAccountId(user.uid);
  return true;
}

function removeAccount(uid) {
  const accounts = getAccounts().filter(a => a.uid !== uid);
  saveAccounts(accounts);
  if (getCurrentAccountId() === uid) {
    localStorage.removeItem(CURRENT_ACC_KEY);
  }
}

function renderSavedAccounts() {
  const accounts = getAccounts();
  if (accounts.length === 0) {
    els.savedAccounts.classList.add("hidden");
    return;
  }
  
  els.savedAccounts.classList.remove("hidden");
  let html = '<p style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">Сохранённые аккаунты:</p>';
  
  accounts.forEach(acc => {
    html += `
      <div class="account-item" data-uid="${acc.uid}">
        <div class="account-avatar">${acc.avatar ? `<img src="${acc.avatar}" />` : getInitials(acc.name)}</div>
        <div class="account-info">
          <div class="account-name">${escapeHtml(acc.name)}</div>
          <div class="account-username">@${acc.username}</div>
        </div>
        <button class="btn-icon" data-remove="${acc.uid}" style="width:24px;height:24px;font-size:12px;">✕</button>
      </div>
    `;
  });
  
  els.savedAccounts.innerHTML = html;
  
  els.savedAccounts.querySelectorAll(".account-item").forEach(el => {
    el.addEventListener("click", async (e) => {
      if (e.target.dataset.remove) {
        e.stopPropagation();
        removeAccount(e.target.dataset.remove);
        renderSavedAccounts();
        return;
      }
      const acc = accounts.find(a => a.uid === el.dataset.uid);
      if (acc) {
        els.loginName.value = acc.name;
        els.loginUsername.value = acc.username;
        els.loginPassword.focus();
      }
    });
  });
}

// ============================================================
// АУТЕНТИФИКАЦИЯ
// ============================================================
els.btnLogin.addEventListener("click", login);
els.loginUsername.addEventListener("keydown", e => { if (e.key === "Enter") els.loginPassword.focus(); });
els.loginPassword.addEventListener("keydown", e => { if (e.key === "Enter") login(); });
els.bannedLogoutBtn?.addEventListener("click", () => { showScreen("login"); renderSavedAccounts(); });

async function login() {
  const name = els.loginName.value.trim();
  const username = els.loginUsername.value.trim().toLowerCase();
  const password = els.loginPassword.value;

  if (!name) { els.loginError.textContent = "Введите имя"; return; }
  if (!username || !/^[a-z0-9]{3,20}$/.test(username)) { els.loginError.textContent = "Юзернейм: 3-20 символов"; return; }

  els.loginError.textContent = "";
  els.btnLogin.disabled = true;
  els.btnLogin.textContent = "Вход...";

  try {
    const uid = generateUid(username);
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const user = userSnap.data();
      
      if (user.banned) {
        showScreen("banned");
        els.btnLogin.disabled = false;
        els.btnLogin.textContent = "Войти";
        return;
      }

      if (user.password && user.password !== password) {
        els.loginError.textContent = "Неверный пароль";
        els.btnLogin.disabled = false;
        els.btnLogin.textContent = "Войти";
        return;
      }

      if (user.name !== name) {
        await updateDoc(userRef, { name });
        user.name = name;
      }

      state.currentUser = user;
      addAccount(user);
      showToast(`С возвращением, ${user.name}!`);
    } else {
      // Проверка лимита аккаунтов
      if (getAccounts().length >= MAX_ACCOUNTS) {
        els.loginError.textContent = "Максимум 3 аккаунта. Удалите один.";
        els.btnLogin.disabled = false;
        els.btnLogin.textContent = "Войти";
        return;
      }

      const newUser = {
        uid, name, username,
        password: password || "",
        avatar: "", bio: "",
        followers: [], following: [],
        blockedUsers: [], favorites: [],
        verified: false, banned: false,
        online: true, lastSeen: serverTimestamp(),
        createdAt: serverTimestamp()
      };
      await setDoc(userRef, newUser);
      state.currentUser = { ...newUser, createdAt: new Date() };
      addAccount(state.currentUser);
      showToast("Аккаунт создан!");
    }

    // Обновляем онлайн статус
    await updateDoc(doc(db, "users", state.currentUser.uid), { online: true, lastSeen: serverTimestamp() });
    
    initApp();
  } catch (err) {
    console.error(err);
    els.loginError.textContent = "Ошибка: " + err.message;
  } finally {
    els.btnLogin.disabled = false;
    els.btnLogin.textContent = "Войти";
  }
}

async function checkAuth() {
  const currentUid = getCurrentAccountId();
  if (currentUid) {
    try {
      const snap = await getDoc(doc(db, "users", currentUid));
      if (snap.exists()) {
        const user = snap.data();
        if (user.banned) {
          showScreen("banned");
          return;
        }
        state.currentUser = user;
        await updateDoc(doc(db, "users", currentUid), { online: true, lastSeen: serverTimestamp() });
        initApp();
        return;
      }
    } catch (err) { console.error(err); }
  }
  showScreen("login");
  renderSavedAccounts();
}

async function logout() {
  if (state.currentUser) {
    try {
      await updateDoc(doc(db, "users", state.currentUser.uid), { online: false, lastSeen: serverTimestamp() });
    } catch {}
  }
  if (state.unsubChats) state.unsubChats();
  if (state.unsubMessages) state.unsubMessages();
  state.currentUser = null;
  state.currentChatId = null;
  state.currentChat = null;
  localStorage.removeItem(CURRENT_ACC_KEY);
  showScreen("login");
  renderSavedAccounts();
  showToast("Вы вышли");
}

// Обновление онлайн статуса
window.addEventListener("beforeunload", async () => {
  if (state.currentUser) {
    navigator.sendBeacon && navigator.sendBeacon(`https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/users/${state.currentUser.uid}?updateMask.fieldPaths=online&updateMask.fieldPaths=lastSeen`, JSON.stringify({ fields: { online: { booleanValue: false } } }));
  }
});

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================
async function initApp() {
  showScreen("app");
  updateMyAvatar();
  deselectChat();
  listenToChats();
  requestNotificationPermission();
  
  // Периодически обновляем онлайн статус
  setInterval(async () => {
    if (state.currentUser) {
      try {
        await updateDoc(doc(db, "users", state.currentUser.uid), { online: true, lastSeen: serverTimestamp() });
      } catch {}
    }
  }, 60000);
}

function updateMyAvatar() {
  if (state.currentUser.avatar) {
    els.myProfileBtn.innerHTML = `<img src="${state.currentUser.avatar}" />`;
  } else {
    els.myProfileBtn.textContent = getInitials(state.currentUser.name);
  }
}

els.myProfileBtn.addEventListener("click", () => openProfile(state.currentUser.uid));
els.btnSettings.addEventListener("click", openSettings);
els.btnFavorites.addEventListener("click", openFavorites);

// ============================================================
// ИЗБРАННОЕ
// ============================================================
async function openFavorites() {
  const favorites = state.currentUser.favorites || [];
  
  let html = "";
  for (const fav of favorites.slice(0, 20)) {
    html += `
      <div class="favorite-item" data-chatid="${fav.chatId}" data-msgid="${fav.messageId}">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">${escapeHtml(fav.chatName || 'Чат')}</div>
        <div style="font-size:14px;">${escapeHtml(fav.text || '📎 Медиа')}</div>
      </div>
    `;
  }
  
  if (!html) html = '<p style="color:var(--text-muted);text-align:center;padding:20px;">Нет избранных сообщений</p>';
  
  showModal(`
    <h3>⭐ Избранное</h3>
    <div class="favorites-panel">${html}</div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Закрыть</button></div>
  `);
  
  document.querySelectorAll(".favorite-item").forEach(el => {
    el.addEventListener("click", () => {
      closeModal();
      selectChat(el.dataset.chatid);
    });
  });
}

async function addToFavorites(msg, chatName) {
  const fav = {
    messageId: msg.id,
    chatId: state.currentChatId,
    chatName: chatName || "Чат",
    text: msg.text || "",
    addedAt: new Date().toISOString()
  };
  
  await updateDoc(doc(db, "users", state.currentUser.uid), {
    favorites: arrayUnion(fav)
  });
  
  state.currentUser.favorites = state.currentUser.favorites || [];
  state.currentUser.favorites.push(fav);
  showToast("Добавлено в избранное");
}

// ============================================================
// НАСТРОЙКИ
// ============================================================
function openSettings() {
  const u = state.currentUser;
  
  showModal(`
    <h3>⚙️ Настройки</h3>
    
    <div class="settings-section">
      <div class="settings-section-title">Профиль</div>
      <div class="settings-item" id="s-name"><span>Имя</span><span style="color:var(--text-muted)">${escapeHtml(u.name)} →</span></div>
      <div class="settings-item" id="s-username"><span>Юзернейм</span><span style="color:var(--text-muted)">@${u.username} →</span></div>
      <div class="settings-item" id="s-avatar"><span>Аватар</span><span style="color:var(--text-muted)">Изменить →</span></div>
      <div class="settings-item" id="s-bio"><span>О себе</span><span style="color:var(--text-muted)">${u.bio ? 'Изменить' : 'Добавить'} →</span></div>
    </div>
    
    <div class="settings-section">
      <div class="settings-section-title">Безопасность</div>
      <div class="settings-item" id="s-password"><span>${u.password ? 'Изменить пароль' : 'Установить пароль'}</span><span style="color:var(--text-muted)">→</span></div>
    </div>
    
    <div class="settings-section">
      <div class="settings-section-title">Приватность</div>
      <div class="settings-item" id="s-blocked"><span>Заблокированные</span><span style="color:var(--text-muted)">${(u.blockedUsers||[]).length} →</span></div>
    </div>
    
    <div class="settings-section">
      <div class="settings-section-title">Стикеры</div>
      <div class="settings-item" id="s-stickers"><span>Мои стикер-паки</span><span style="color:var(--text-muted)">→</span></div>
    </div>
    
    <div class="settings-section">
      <div class="settings-section-title">Аккаунты</div>
      <div class="settings-item" id="s-switch-acc"><span>Сменить аккаунт</span><span style="color:var(--text-muted)">${getAccounts().length}/${MAX_ACCOUNTS} →</span></div>
    </div>
    
    <div class="settings-divider" id="s-admin"></div>
    
    <div class="modal-actions">
      <button class="btn btn-danger" id="s-logout">Выйти</button>
      <button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Закрыть</button>
    </div>
  `);

  $("s-name").addEventListener("click", settingsChangeName);
  $("s-username").addEventListener("click", settingsChangeUsername);
  $("s-avatar").addEventListener("click", () => { closeModal(); els.avatarInput.click(); });
  $("s-bio").addEventListener("click", settingsChangeBio);
  $("s-password").addEventListener("click", settingsChangePassword);
  $("s-blocked").addEventListener("click", settingsBlockedUsers);
  $("s-stickers").addEventListener("click", openStickerManager);
  $("s-switch-acc").addEventListener("click", openAccountSwitcher);
  $("s-logout").addEventListener("click", () => { closeModal(); logout(); });
  $("s-admin").addEventListener("click", openAdminAuth);
}

function settingsChangeName() {
  showModal(`
    <h3>Изменить имя</h3>
    <div class="form-group"><input type="text" id="new-name" class="form-input" value="${escapeHtml(state.currentUser.name)}" maxlength="30" /></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Отмена</button>
      <button class="btn btn-primary" id="save-name">Сохранить</button>
    </div>
  `);
  $("save-name").addEventListener("click", async () => {
    const name = $("new-name").value.trim();
    if (!name) return;
    await updateDoc(doc(db, "users", state.currentUser.uid), { name });
    state.currentUser.name = name;
    addAccount(state.currentUser);
    updateMyAvatar();
    showToast("Имя изменено");
    closeModal();
  });
}

function settingsChangeUsername() {
  showModal(`
    <h3>Изменить юзернейм</h3>
    <div class="form-group">
      <input type="text" id="new-uname" class="form-input" value="${state.currentUser.username}" maxlength="20" />
      <div class="form-hint">Придётся войти заново</div>
      <div id="uname-err" class="form-error"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Отмена</button>
      <button class="btn btn-primary" id="save-uname">Сохранить</button>
    </div>
  `);
  $("save-uname").addEventListener("click", async () => {
    const newUname = $("new-uname").value.trim().toLowerCase();
    if (!/^[a-z0-9]{3,20}$/.test(newUname)) { $("uname-err").textContent = "Неверный формат"; return; }
    if (newUname === state.currentUser.username) { closeModal(); return; }
    
    const newUid = generateUid(newUname);
    const exists = await getDoc(doc(db, "users", newUid));
    if (exists.exists()) { $("uname-err").textContent = "Занят"; return; }
    
    const newUser = { ...state.currentUser, uid: newUid, username: newUname };
    await setDoc(doc(db, "users", newUid), newUser);
    await deleteDoc(doc(db, "users", state.currentUser.uid));
    
    removeAccount(state.currentUser.uid);
    state.currentUser = newUser;
    addAccount(newUser);
    showToast("Юзернейм изменён");
    closeModal();
  });
}

function settingsChangeBio() {
  showModal(`
    <h3>О себе</h3>
    <div class="form-group"><textarea id="new-bio" class="form-input" rows="3" maxlength="200">${escapeHtml(state.currentUser.bio || '')}</textarea></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Отмена</button>
      <button class="btn btn-primary" id="save-bio">Сохранить</button>
    </div>
  `);
  $("save-bio").addEventListener("click", async () => {
    const bio = $("new-bio").value.trim();
    await updateDoc(doc(db, "users", state.currentUser.uid), { bio });
    state.currentUser.bio = bio;
    showToast("Сохранено");
    closeModal();
  });
}

function settingsChangePassword() {
  const has = !!state.currentUser.password;
  showModal(`
    <h3>${has ? 'Изменить пароль' : 'Установить пароль'}</h3>
    ${has ? '<div class="form-group"><label>Текущий</label><input type="password" id="cur-pass" class="form-input" /></div>' : ''}
    <div class="form-group"><label>Новый</label><input type="password" id="new-pass" class="form-input" /></div>
    <div id="pass-err" class="form-error"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Отмена</button>
      <button class="btn btn-primary" id="save-pass">Сохранить</button>
    </div>
  `);
  $("save-pass").addEventListener("click", async () => {
    if (has && $("cur-pass").value !== state.currentUser.password) { $("pass-err").textContent = "Неверный пароль"; return; }
    const newPass = $("new-pass").value;
    if (newPass.length < 4) { $("pass-err").textContent = "Минимум 4 символа"; return; }
    await updateDoc(doc(db, "users", state.currentUser.uid), { password: newPass });
    state.currentUser.password = newPass;
    addAccount(state.currentUser);
    showToast("Пароль сохранён");
    closeModal();
  });
}

async function settingsBlockedUsers() {
  const blocked = state.currentUser.blockedUsers || [];
  let html = "";
  
  for (const uid of blocked) {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const u = snap.data();
        html += `<div class="member-item"><div class="member-info"><div class="member-info-avatar">${u.avatar ? `<img src="${u.avatar}" />` : getInitials(u.name)}</div><span>${escapeHtml(u.name)}</span></div><button class="btn btn-ghost btn-sm" data-uid="${uid}">Разблокировать</button></div>`;
      }
    } catch {}
  }
  
  if (!html) html = '<p style="color:var(--text-muted);text-align:center;padding:20px;">Список пуст</p>';
  
  showModal(`<h3>Заблокированные</h3><div class="member-list">${html}</div><div class="modal-actions"><button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Закрыть</button></div>`);
  
  document.querySelectorAll(".member-item button").forEach(btn => {
    btn.addEventListener("click", async () => {
      await updateDoc(doc(db, "users", state.currentUser.uid), { blockedUsers: arrayRemove(btn.dataset.uid) });
      state.currentUser.blockedUsers = state.currentUser.blockedUsers.filter(u => u !== btn.dataset.uid);
      showToast("Разблокирован");
      settingsBlockedUsers();
    });
  });
}

function openAccountSwitcher() {
  const accounts = getAccounts();
  let html = "";
  
  accounts.forEach(acc => {
    const isActive = acc.uid === state.currentUser.uid;
    html += `
      <div class="account-item ${isActive ? 'active' : ''}" data-uid="${acc.uid}">
        <div class="account-avatar">${acc.avatar ? `<img src="${acc.avatar}" />` : getInitials(acc.name)}</div>
        <div class="account-info">
          <div class="account-name">${escapeHtml(acc.name)}</div>
          <div class="account-username">@${acc.username}</div>
        </div>
        ${isActive ? '<span style="color:var(--success);">✓</span>' : ''}
      </div>
    `;
  });
  
  showModal(`
    <h3>Аккаунты (${accounts.length}/${MAX_ACCOUNTS})</h3>
    <div class="accounts-list">${html}</div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Закрыть</button>
      ${accounts.length < MAX_ACCOUNTS ? '<button class="btn btn-primary" id="add-acc">+ Добавить</button>' : ''}
    </div>
  `);
  
  document.querySelectorAll(".account-item").forEach(el => {
    el.addEventListener("click", async () => {
      const acc = accounts.find(a => a.uid === el.dataset.uid);
      if (acc && acc.uid !== state.currentUser.uid) {
        if (state.currentUser) {
          await updateDoc(doc(db, "users", state.currentUser.uid), { online: false });
        }
        setCurrentAccountId(acc.uid);
        location.reload();
      }
    });
  });
  
  $("add-acc")?.addEventListener("click", () => { closeModal(); logout(); });
}

// Загрузка аватара
els.avatarInput.addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showToast("Макс. 5 МБ", "error"); return; }

  try {
    showToast("Загрузка...");
    const url = await uploadFile(file, `avatars/${state.currentUser.uid}_${Date.now()}.${file.name.split('.').pop()}`);
    await updateDoc(doc(db, "users", state.currentUser.uid), { avatar: url });
    state.currentUser.avatar = url;
    addAccount(state.currentUser);
    updateMyAvatar();
    showToast("Аватар обновлён");
  } catch (err) {
    console.error(err);
    showToast("Ошибка: " + err.message, "error");
  }
  els.avatarInput.value = "";
});

// ============================================================
// СТИКЕРЫ
// ============================================================
async function openStickerManager() {
  const packsSnap = await getDocs(query(collection(db, "stickerPacks"), where("ownerId", "==", state.currentUser.uid)));
  
  let packs = [];
  packsSnap.forEach(d => packs.push({ id: d.id, ...d.data() }));
  
  let html = "";
  packs.forEach(pack => {
    html += `
      <div class="settings-item" data-packid="${pack.id}">
        <span>${escapeHtml(pack.name)} (${(pack.stickers || []).length})</span>
        <span style="color:var(--text-muted)">→</span>
      </div>
    `;
  });
  
  showModal(`
    <h3>😊 Мои стикер-паки</h3>
    ${html || '<p style="color:var(--text-muted);text-align:center;padding:20px;">Нет стикер-паков</p>'}
    <div class="modal-actions">
      <button class="btn btn-primary" id="create-pack">+ Создать пак</button>
      <button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Закрыть</button>
    </div>
  `);
  
  $("create-pack").addEventListener("click", createStickerPack);
  
  document.querySelectorAll("[data-packid]").forEach(el => {
    el.addEventListener("click", () => openStickerPack(el.dataset.packid));
  });
}

async function createStickerPack() {
  showModal(`
    <h3>Создать стикер-пак</h3>
    <div class="form-group"><input type="text" id="pack-name" class="form-input" placeholder="Название" maxlength="30" /></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Отмена</button>
      <button class="btn btn-primary" id="save-pack">Создать</button>
    </div>
  `);
  
  $("save-pack").addEventListener("click", async () => {
    const name = $("pack-name").value.trim();
    if (!name) return;
    
    await addDoc(collection(db, "stickerPacks"), {
      name,
      ownerId: state.currentUser.uid,
      ownerName: state.currentUser.name,
      stickers: [],
      createdAt: serverTimestamp()
    });
    
    showToast("Пак создан");
    openStickerManager();
  });
}

async function openStickerPack(packId) {
  const snap = await getDoc(doc(db, "stickerPacks", packId));
  if (!snap.exists()) return;
  
  const pack = snap.data();
  const isOwner = pack.ownerId === state.currentUser.uid;
  
  let stickersHtml = "";
  (pack.stickers || []).forEach((url, i) => {
    stickersHtml += `<div class="sticker-item"><img src="${url}" /></div>`;
  });
  
  showModal(`
    <h3>${escapeHtml(pack.name)}</h3>
    <p style="color:var(--text-muted);font-size:12px;margin-bottom:16px;">Автор: ${escapeHtml(pack.ownerName)}</p>
    <div class="sticker-grid">${stickersHtml || '<p style="grid-column:1/-1;text-align:center;color:var(--text-muted);">Пусто</p>'}</div>
    <div class="modal-actions">
      ${isOwner ? '<button class="btn btn-primary" id="add-sticker">+ Добавить стикер</button>' : ''}
      <button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Закрыть</button>
    </div>
  `);
  
  $("add-sticker")?.addEventListener("click", () => {
    closeModal();
    els.stickerInput.dataset.packid = packId;
    els.stickerInput.click();
  });
}

els.stickerInput.addEventListener("change", async e => {
  const file = e.target.files[0];
  const packId = els.stickerInput.dataset.packid;
  if (!file || !packId) return;
  
  if (file.size > 500 * 1024) { showToast("Макс. 500 КБ", "error"); return; }
  
  try {
    showToast("Загрузка...");
    const url = await uploadFile(file, `stickers/${packId}/${Date.now()}.${file.name.split('.').pop()}`);
    await updateDoc(doc(db, "stickerPacks", packId), { stickers: arrayUnion(url) });
    showToast("Стикер добавлен");
    openStickerPack(packId);
  } catch (err) {
    showToast("Ошибка: " + err.message, "error");
  }
  els.stickerInput.value = "";
});

// Панель стикеров
els.btnStickers.addEventListener("click", toggleStickerPanel);

async function toggleStickerPanel() {
  state.stickerPanelOpen = !state.stickerPanelOpen;
  
  if (!state.stickerPanelOpen) {
    els.stickerPanel.classList.add("hidden");
    return;
  }
  
  els.stickerPanel.classList.remove("hidden");
  
  // Загружаем паки
  const packsSnap = await getDocs(query(collection(db, "stickerPacks"), limit(20)));
  let packs = [];
  packsSnap.forEach(d => packs.push({ id: d.id, ...d.data() }));
  
  let tabsHtml = packs.map((p, i) => `<button class="sticker-tab ${i === 0 ? 'active' : ''}" data-idx="${i}">${escapeHtml(p.name)}</button>`).join('');
  
  let gridsHtml = packs.map((p, i) => {
    let stickers = (p.stickers || []).map(url => `<div class="sticker-item" data-url="${url}" data-packid="${p.id}"><img src="${url}" /></div>`).join('');
    return `<div class="sticker-grid ${i === 0 ? '' : 'hidden'}" data-idx="${i}">${stickers || '<p style="grid-column:1/-1;text-align:center;color:var(--text-muted);font-size:12px;">Нет стикеров</p>'}</div>`;
  }).join('');
  
  els.stickerPanel.innerHTML = `
    <div class="sticker-panel-header">
      <span class="sticker-panel-title">Стикеры</span>
      <button class="btn-icon" id="close-stickers" style="width:24px;height:24px;font-size:12px;">✕</button>
    </div>
    <div class="sticker-tabs">${tabsHtml || '<span style="color:var(--text-muted);font-size:12px;">Нет стикер-паков</span>'}</div>
    ${gridsHtml}
  `;
  
  $("close-stickers")?.addEventListener("click", () => {
    state.stickerPanelOpen = false;
    els.stickerPanel.classList.add("hidden");
  });
  
  els.stickerPanel.querySelectorAll(".sticker-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      els.stickerPanel.querySelectorAll(".sticker-tab").forEach(t => t.classList.remove("active"));
      els.stickerPanel.querySelectorAll(".sticker-grid").forEach(g => g.classList.add("hidden"));
      tab.classList.add("active");
      els.stickerPanel.querySelector(`.sticker-grid[data-idx="${tab.dataset.idx}"]`)?.classList.remove("hidden");
    });
  });
  
  els.stickerPanel.querySelectorAll(".sticker-item").forEach(item => {
    item.addEventListener("click", () => sendSticker(item.dataset.url, item.dataset.packid));
  });
}

async function sendSticker(url, packId) {
  if (!state.currentChatId) return;
  
  state.stickerPanelOpen = false;
  els.stickerPanel.classList.add("hidden");
  
  const msgData = {
    type: "sticker",
    stickerUrl: url,
    stickerPackId: packId,
    senderId: state.currentUser.uid,
    senderName: state.currentUser.name,
    senderUsername: state.currentUser.username,
    timestamp: serverTimestamp(),
    read: false
  };
  
  await addDoc(collection(db, "chats", state.currentChatId, "messages"), msgData);
  await updateDoc(doc(db, "chats", state.currentChatId), { lastMessage: { ...msgData, timestamp: serverTimestamp() } });
}

// ============================================================
// АДМИН-ПАНЕЛЬ
// ============================================================
function openAdminAuth() {
  showModal(`
    <h3>🔐 Доступ</h3>
    <div class="form-group"><input type="password" id="admin-pass" class="form-input" placeholder="Пароль" /></div>
    <div id="admin-err" class="form-error"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Отмена</button>
      <button class="btn btn-primary" id="admin-submit">Войти</button>
    </div>
  `);
  $("admin-submit").addEventListener("click", () => {
    if ($("admin-pass").value === ADMIN_PASSWORD) openAdminPanel();
    else $("admin-err").textContent = "Неверный пароль";
  });
}

function openAdminPanel() {
  showModal(`
    <h3>👑 Админ-панель</h3>
    
    <div class="settings-section">
      <div class="settings-section-title">Верификация</div>
      <div class="form-group"><input type="text" id="adm-verify" class="form-input" placeholder="Юзернейм / название чата" /></div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-primary btn-sm" id="adm-v-give">Выдать ✓</button>
        <button class="btn btn-danger btn-sm" id="adm-v-remove">Забрать ✓</button>
      </div>
    </div>
    
    <div class="settings-section">
      <div class="settings-section-title">Бан пользователя</div>
      <div class="form-group"><input type="text" id="adm-ban" class="form-input" placeholder="Юзернейм" /></div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-danger btn-sm" id="adm-ban-btn">Забанить</button>
        <button class="btn btn-primary btn-sm" id="adm-unban">Разбанить</button>
      </div>
    </div>
    
    <div class="modal-actions"><button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Закрыть</button></div>
  `);

  $("adm-v-give").addEventListener("click", () => adminSetVerified(true));
  $("adm-v-remove").addEventListener("click", () => adminSetVerified(false));
  $("adm-ban-btn").addEventListener("click", () => adminSetBanned(true));
  $("adm-unban").addEventListener("click", () => adminSetBanned(false));
}

async function adminSetVerified(verified) {
  const target = $("adm-verify").value.trim().toLowerCase();
  if (!target) return;

  const uid = generateUid(target);
  const userSnap = await getDoc(doc(db, "users", uid));
  if (userSnap.exists()) {
    await updateDoc(doc(db, "users", uid), { verified });
    showToast(verified ? "Галочка выдана" : "Галочка снята");
    return;
  }

  const chatsQ = query(collection(db, "chats"), where("name", "==", target));
  const chatsSnap = await getDocs(chatsQ);
  if (!chatsSnap.empty) {
    for (const chatDoc of chatsSnap.docs) {
      await updateDoc(doc(db, "chats", chatDoc.id), { verified });
    }
    showToast(verified ? "Галочка выдана" : "Галочка снята");
    return;
  }

  showToast("Не найдено", "error");
}

async function adminSetBanned(banned) {
  const username = $("adm-ban").value.trim().toLowerCase();
  if (!username) return;
  
  const uid = generateUid(username);
  const snap = await getDoc(doc(db, "users", uid));
  if (snap.exists()) {
    await updateDoc(doc(db, "users", uid), { banned });
    showToast(banned ? "Забанен" : "Разбанен");
  } else {
    showToast("Не найден", "error");
  }
}

// ============================================================
// ПРОФИЛИ
// ============================================================
async function openProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) { showToast("Не найден", "error"); return; }
  
  const user = snap.data();
  const isOwn = uid === state.currentUser.uid;
  const isFollowing = state.currentUser.following?.includes(uid);
  const isBlocked = state.currentUser.blockedUsers?.includes(uid);

  const avatarHtml = user.avatar 
    ? `<img src="${user.avatar}" />${isOwn ? '<div class="profile-avatar-edit">Изменить</div>' : ''}`
    : `${getInitials(user.name)}${isOwn ? '<div class="profile-avatar-edit">Добавить</div>' : ''}`;

  const onlineStatus = user.online 
    ? '<div class="profile-online">● В сети</div>' 
    : `<div style="font-size:12px;color:var(--text-muted);">Был(а) ${formatTime(user.lastSeen)}</div>`;

  let actionsHtml = "";
  if (isOwn) {
    actionsHtml = '<button class="btn btn-ghost" id="p-settings">⚙️ Настройки</button>';
  } else {
    actionsHtml = `
      <button class="btn ${isFollowing ? 'btn-ghost' : 'btn-primary'}" id="p-follow">${isFollowing ? 'Отписаться' : 'Подписаться'}</button>
      <button class="btn btn-primary" id="p-message">Написать</button>
      <button class="btn ${isBlocked ? 'btn-primary' : 'btn-danger'}" id="p-block">${isBlocked ? 'Разблокировать' : 'Заблокировать'}</button>
    `;
  }

  showModal(`
    <div class="profile-header">
      <div class="profile-avatar" id="p-avatar" ${isOwn ? 'style="cursor:pointer"' : ''}>${avatarHtml}</div>
      <div class="profile-name">${escapeHtml(user.name)}${user.verified ? verifiedBadge("verified-badge-lg") : ''}</div>
      <div class="profile-username">@${user.username}</div>
      ${user.verified ? '<div class="verified-text">Верифицированный аккаунт</div>' : ''}
      ${onlineStatus}
      ${user.bio ? `<div class="profile-bio">${escapeHtml(user.bio)}</div>` : ''}
      <div class="profile-stats">
        <div class="profile-stat" data-type="followers" data-uid="${uid}">
          <div class="profile-stat-value">${(user.followers||[]).length}</div>
          <div class="profile-stat-label">подписчиков</div>
        </div>
        <div class="profile-stat" data-type="following" data-uid="${uid}">
          <div class="profile-stat-value">${(user.following||[]).length}</div>
          <div class="profile-stat-label">подписок</div>
        </div>
      </div>
      <div class="profile-actions">${actionsHtml}</div>
    </div>
  `);

  if (isOwn) {
    $("p-avatar").addEventListener("click", () => { closeModal(); els.avatarInput.click(); });
    $("p-settings")?.addEventListener("click", openSettings);
  } else {
    $("p-follow")?.addEventListener("click", async () => { await toggleFollow(uid, isFollowing); openProfile(uid); });
    $("p-message")?.addEventListener("click", () => { closeModal(); openOrCreateDM(uid, user.name, user.username); });
    $("p-block")?.addEventListener("click", async () => { await toggleBlock(uid, isBlocked); openProfile(uid); });
  }

  document.querySelectorAll(".profile-stat").forEach(el => {
    el.addEventListener("click", () => openFollowList(el.dataset.uid, el.dataset.type));
  });
}

async function toggleFollow(uid, isFollowing) {
  const myRef = doc(db, "users", state.currentUser.uid);
  const targetRef = doc(db, "users", uid);

  if (isFollowing) {
    await updateDoc(myRef, { following: arrayRemove(uid) });
    await updateDoc(targetRef, { followers: arrayRemove(state.currentUser.uid) });
    state.currentUser.following = state.currentUser.following.filter(u => u !== uid);
    showToast("Отписались");
  } else {
    await updateDoc(myRef, { following: arrayUnion(uid) });
    await updateDoc(targetRef, { followers: arrayUnion(state.currentUser.uid) });
    if (!state.currentUser.following) state.currentUser.following = [];
    state.currentUser.following.push(uid);
    showToast("Подписались");
  }
}

async function toggleBlock(uid, isBlocked) {
  const myRef = doc(db, "users", state.currentUser.uid);
  
  if (isBlocked) {
    await updateDoc(myRef, { blockedUsers: arrayRemove(uid) });
    state.currentUser.blockedUsers = state.currentUser.blockedUsers.filter(u => u !== uid);
    showToast("Разблокирован");
  } else {
    await updateDoc(myRef, { blockedUsers: arrayUnion(uid) });
    if (!state.currentUser.blockedUsers) state.currentUser.blockedUsers = [];
    state.currentUser.blockedUsers.push(uid);
    showToast("Заблокирован");
  }
}

async function openFollowList(uid, type) {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return;
  
  const list = type === "followers" ? (snap.data().followers || []) : (snap.data().following || []);
  let html = "";

  for (const userId of list) {
    try {
      const uSnap = await getDoc(doc(db, "users", userId));
      if (uSnap.exists()) {
        const u = uSnap.data();
        html += `<div class="member-item"><div class="member-info" data-uid="${u.uid}"><div class="member-info-avatar">${u.avatar ? `<img src="${u.avatar}" />` : getInitials(u.name)}</div><span class="member-name">${escapeHtml(u.name)}${u.verified ? verifiedBadge() : ''}</span></div></div>`;
      }
    } catch {}
  }

  if (!html) html = '<p style="color:var(--text-muted);text-align:center;padding:20px;">Пусто</p>';

  showModal(`<h3>${type === "followers" ? "Подписчики" : "Подписки"}</h3><div class="member-list">${html}</div><div class="modal-actions"><button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Закрыть</button></div>`);

  document.querySelectorAll(".member-info").forEach(el => {
    el.addEventListener("click", () => { closeModal(); openProfile(el.dataset.uid); });
  });
}

// ============================================================
// ЧАТЫ
// ============================================================
async function getDMUserInfo(chat) {
  if (chat.type !== "dm") return null;
  const otherUid = chat.members.find(m => m !== state.currentUser.uid);
  if (!otherUid) return null;
  
  if (state.dmUsersCache[otherUid]) return state.dmUsersCache[otherUid];
  
  try {
    const snap = await getDoc(doc(db, "users", otherUid));
    if (snap.exists()) {
      state.dmUsersCache[otherUid] = snap.data();
      return snap.data();
    }
  } catch {}
  return null;
}

async function openOrCreateDM(otherUid, otherName, otherUsername) {
  const ids = [state.currentUser.uid, otherUid].sort();
  const chatId = `dm_${ids[0]}_${ids[1]}`;

  const chatRef = doc(db, "chats", chatId);
  const chatSnap = await getDoc(chatRef);

  if (!chatSnap.exists()) {
    await setDoc(chatRef, {
      chatId, type: "dm", name: "", avatar: "",
      createdBy: state.currentUser.uid, admins: [],
      members: [state.currentUser.uid, otherUid],
      bannedUsers: [], verified: false, lastMessage: null
    });
  }
  selectChat(chatId);
}

els.btnCreateGroup.addEventListener("click", () => {
  showModal(`
    <h3>Создать группу</h3>
    <div class="form-group"><input type="text" id="g-name" class="form-input" placeholder="Название" maxlength="40" /></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Отмена</button>
      <button class="btn btn-primary" id="g-create">Создать</button>
    </div>
  `);
  $("g-create").addEventListener("click", async () => {
    const name = $("g-name").value.trim();
    if (!name) return;
    await createChat("group", name);
    closeModal();
  });
});

els.btnCreateChannel.addEventListener("click", () => {
  showModal(`
    <h3>Создать канал</h3>
    <div class="form-group"><input type="text" id="c-name" class="form-input" placeholder="Название" maxlength="40" /></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Отмена</button>
      <button class="btn btn-primary" id="c-create">Создать</button>
    </div>
  `);
  $("c-create").addEventListener("click", async () => {
    const name = $("c-name").value.trim();
    if (!name) return;
    await createChat("channel", name);
    closeModal();
  });
});

async function createChat(type, name) {
  const chatRef = doc(collection(db, "chats"));
  await setDoc(chatRef, {
    chatId: chatRef.id, type, name, avatar: "",
    createdBy: state.currentUser.uid,
    admins: [state.currentUser.uid],
    members: [state.currentUser.uid],
    bannedUsers: [], verified: false, lastMessage: null
  });
  showToast(type === "group" ? "Группа создана" : "Канал создан");
  selectChat(chatRef.id);
}

function listenToChats() {
  if (state.unsubChats) state.unsubChats();
  const q = query(collection(db, "chats"), where("members", "array-contains", state.currentUser.uid));
  state.unsubChats = onSnapshot(q, async snap => {
    const chats = [];
    for (const d of snap.docs) {
      const chat = d.data();
      if (chat.type === "dm") {
        const userInfo = await getDMUserInfo(chat);
        chat._dmUser = userInfo;
      }
      chats.push(chat);
    }
    renderChatList(chats);
  });
}

function renderChatList(chats) {
  if (!chats.length) {
    els.chatList.innerHTML = '<div class="chat-list-empty"><div class="chat-list-empty-icon">💬</div><p>Нет чатов</p></div>';
    return;
  }

  chats.sort((a, b) => (b.lastMessage?.timestamp?.seconds || 0) - (a.lastMessage?.timestamp?.seconds || 0));

  let html = "";
  chats.forEach(chat => {
    let displayName = chat.name || "Чат";
    let avatarHtml = "";
    let onlineHtml = "";
    let verified = chat.verified;
    
    if (chat.type === "dm" && chat._dmUser) {
      displayName = chat._dmUser.name;
      verified = chat._dmUser.verified;
      if (chat._dmUser.avatar) avatarHtml = `<img src="${chat._dmUser.avatar}" />`;
      if (chat._dmUser.online) onlineHtml = '<span class="online-indicator"></span>';
    } else if (chat.avatar) {
      avatarHtml = `<img src="${chat.avatar}" />`;
    }

    if (!avatarHtml) avatarHtml = getInitials(displayName);

    const isActive = state.currentChatId === chat.chatId ? "active" : "";
    const unread = chat.lastMessage && chat.lastMessage.senderId !== state.currentUser.uid && !chat.lastMessage.read;
    
    let lastMsgText = "";
    if (chat.lastMessage) {
      const t = chat.lastMessage.type;
      const prefix = chat.type !== "dm" ? (chat.lastMessage.senderName + ": ") : "";
      lastMsgText = t === "image" ? prefix + "🖼️ Фото" : t === "file" ? prefix + "📎 Файл" : t === "voice" ? prefix + "🎤 Голосовое" : t === "sticker" ? prefix + "😊 Стикер" : prefix + (chat.lastMessage.text || "");
    }

    html += `
      <div class="chat-item ${isActive}" data-chatid="${chat.chatId}">
        <div class="chat-item-avatar">${avatarHtml}${onlineHtml}<span class="chat-item-badge">${getChatEmoji(chat.type)}</span></div>
        <div class="chat-item-content">
          <div class="chat-item-header">
            <span class="chat-item-name">${escapeHtml(displayName)}${verified ? verifiedBadge() : ''}</span>
            <span class="chat-item-time">${formatTime(chat.lastMessage?.timestamp)}</span>
          </div>
          <div class="chat-item-footer">
            <span class="chat-item-last-msg">${escapeHtml(lastMsgText) || 'Нет сообщений'}</span>
            ${unread ? '<span class="unread-badge">!</span>' : ''}
          </div>
        </div>
        <div class="chat-item-actions"><button class="btn-icon" data-menu="${chat.chatId}" style="width:24px;height:24px;font-size:12px;">⋮</button></div>
      </div>
    `;
  });

  els.chatList.innerHTML = html;
  
  els.chatList.querySelectorAll(".chat-item").forEach(item => {
    item.addEventListener("click", e => {
      if (e.target.dataset.menu) return;
      selectChat(item.dataset.chatid);
      if (window.innerWidth <= 768) els.sidebar.classList.add("sidebar-hidden");
    });
  });
  
  els.chatList.querySelectorAll("[data-menu]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const chat = chats.find(c => c.chatId === btn.dataset.menu);
      showContextMenu(e.pageX, e.pageY, [
        { action: "open", label: "Открыть", onClick: () => selectChat(btn.dataset.menu) },
        { action: "delete", label: "Удалить чат", danger: true, onClick: () => deleteChat(btn.dataset.menu) }
      ]);
    });
  });
}

async function deleteChat(chatId) {
  if (!confirm("Удалить чат? Все сообщения будут потеряны.")) return;
  
  const messagesSnap = await getDocs(collection(db, "chats", chatId, "messages"));
  for (const msgDoc of messagesSnap.docs) {
    await deleteDoc(doc(db, "chats", chatId, "messages", msgDoc.id));
  }
  await deleteDoc(doc(db, "chats", chatId));
  
  if (state.currentChatId === chatId) deselectChat();
  showToast("Чат удалён");
}

// ============================================================
// ВЫБОР ЧАТА
// ============================================================
async function selectChat(chatId) {
  if (state.unsubMessages) state.unsubMessages();
  state.currentChatId = chatId;
  state.attachments = [];
  state.editingMessageId = null;
  state.stickerPanelOpen = false;
  els.stickerPanel.classList.add("hidden");
  els.editIndicator.classList.add("hidden");
  updateAttachments();

  const snap = await getDoc(doc(db, "chats", chatId));
  if (!snap.exists()) { showToast("Не найден", "error"); return; }

  state.currentChat = snap.data();
  els.chatPlaceholder.classList.add("hidden");
  els.activeChat.classList.remove("hidden");
  els.activeChat.style.display = "flex";

  await setupChatHeader(state.currentChat);
  setupInputPermissions(state.currentChat);

  els.chatList.querySelectorAll(".chat-item").forEach(i => i.classList.toggle("active", i.dataset.chatid === chatId));
  listenToMessages(chatId);
  
  // Отмечаем прочитанным
  markAsRead(chatId);
}

async function markAsRead(chatId) {
  const chat = state.currentChat;
  if (chat?.lastMessage && chat.lastMessage.senderId !== state.currentUser.uid) {
    await updateDoc(doc(db, "chats", chatId), { "lastMessage.read": true });
  }
}

function deselectChat() {
  if (state.unsubMessages) state.unsubMessages();
  state.currentChatId = null;
  state.currentChat = null;
  state.attachments = [];
  els.chatPlaceholder.classList.remove("hidden");
  els.activeChat.classList.add("hidden");
}

async function setupChatHeader(chat) {
  let displayName = chat.name;
  let statusHtml = "";
  let avatarHtml = "";
  let verified = chat.verified;

  if (chat.type === "dm") {
    const otherUid = chat.members.find(m => m !== state.currentUser.uid);
    if (otherUid) {
      const snap = await getDoc(doc(db, "users", otherUid));
      if (snap.exists()) {
        const u = snap.data();
        displayName = u.name;
        verified = u.verified;
        if (u.avatar) avatarHtml = `<img src="${u.avatar}" />`;
        statusHtml = u.online ? '<span class="chat-header-status online">● В сети</span>' : `<span class="chat-header-status">Был(а) ${formatTime(u.lastSeen)}</span>`;
      }
    }
  } else {
    statusHtml = `<span class="chat-header-status">${chat.type === "group" ? "Группа" : "Канал"} · ${chat.members.length}</span>`;
  }

  if (chat.avatar) avatarHtml = `<img src="${chat.avatar}" />`;
  
  els.chatAvatar.innerHTML = avatarHtml || getInitials(displayName);
  els.chatName.innerHTML = escapeHtml(displayName) + (verified ? verifiedBadge() : "");
  els.chatStatus.innerHTML = statusHtml;
}

function setupInputPermissions(chat) {
  const uid = state.currentUser.uid;
  let canWrite = true;
  let msg = "";

  if (chat.type === "channel" && chat.createdBy !== uid) {
    canWrite = false;
    msg = "🔒 Только автор канала может писать";
  } else if (chat.type === "group" && chat.bannedUsers?.includes(uid)) {
    canWrite = false;
    msg = "🚫 Вы заблокированы";
  } else if (chat.type === "dm") {
    const otherUid = chat.members.find(m => m !== uid);
    if (state.currentUser.blockedUsers?.includes(otherUid)) {
      canWrite = false;
      msg = "Вы заблокировали этого пользователя";
    }
  }

  els.messageInputBar.classList.toggle("hidden", !canWrite);
  els.inputBlockedMsg.classList.toggle("hidden", canWrite);
  els.inputBlockedMsg.textContent = msg;
}

// Меню чата
els.btnChatMenu.addEventListener("click", e => {
  const chat = state.currentChat;
  if (!chat) return;
  
  const isAdmin = chat.admins?.includes(state.currentUser.uid);
  
  const items = [
    { action: "profile", label: "👤 Профиль", onClick: () => openChatProfile(chat.chatId) }
  ];
  
  if (chat.type !== "dm" && isAdmin) {
    items.push({ action: "manage", label: "⚙️ Управление", onClick: openChatManage });
  }
  
  items.push({ action: "delete", label: "🗑️ Удалить чат", danger: true, onClick: () => deleteChat(chat.chatId) });
  
  showContextMenu(e.pageX, e.pageY, items);
});

async function openChatProfile(chatId) {
  const snap = await getDoc(doc(db, "chats", chatId));
  if (!snap.exists()) return;
  
  const chat = snap.data();
  
  if (chat.type === "dm") {
    const otherUid = chat.members.find(m => m !== state.currentUser.uid);
    if (otherUid) openProfile(otherUid);
    return;
  }
  
  // Группа/Канал
  const isAdmin = chat.admins?.includes(state.currentUser.uid);
  
  let membersHtml = "";
  for (const uid of chat.members.slice(0, 15)) {
    try {
      const uSnap = await getDoc(doc(db, "users", uid));
      if (uSnap.exists()) {
        const u = uSnap.data();
        const badge = uid === chat.createdBy ? 'создатель' : chat.admins?.includes(uid) ? 'админ' : '';
        membersHtml += `<div class="member-item"><div class="member-info" data-uid="${u.uid}"><div class="member-info-avatar">${u.avatar ? `<img src="${u.avatar}" />` : getInitials(u.name)}</div><div><div class="member-name">${escapeHtml(u.name)}${u.verified ? verifiedBadge() : ''}</div>${badge ? `<div class="member-role">${badge}</div>` : ''}</div></div></div>`;
      }
    } catch {}
  }
  
  showModal(`
    <div class="profile-header">
      <div class="profile-avatar">${chat.avatar ? `<img src="${chat.avatar}" />` : getChatEmoji(chat.type)}</div>
      <div class="profile-name">${escapeHtml(chat.name)}${chat.verified ? verifiedBadge() : ''}</div>
      <div class="profile-username">${chat.type === "group" ? "Группа" : "Канал"} · ${chat.members.length} участн.</div>
      ${chat.verified ? '<div class="verified-text">Верифицирован</div>' : ''}
    </div>
    <div class="settings-section-title">Участники</div>
    <div class="member-list">${membersHtml}</div>
    ${isAdmin ? '<div class="modal-actions"><button class="btn btn-primary" id="cp-add">+ Добавить</button><button class="btn btn-ghost" onclick="document.getElementById(\'modal-root\').innerHTML=\'\'">Закрыть</button></div>' : '<div class="modal-actions"><button class="btn btn-ghost" onclick="document.getElementById(\'modal-root\').innerHTML=\'\'">Закрыть</button></div>'}
  `);
  
  $("cp-add")?.addEventListener("click", () => openAddMember(chatId));
  
  document.querySelectorAll(".member-info").forEach(el => {
    el.addEventListener("click", () => { closeModal(); openProfile(el.dataset.uid); });
  });
}

function openAddMember(chatId) {
  showModal(`
    <h3>Добавить участника</h3>
    <div class="form-group"><input type="text" id="add-user" class="form-input" placeholder="Юзернейм" /></div>
    <div id="add-err" class="form-error"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Отмена</button>
      <button class="btn btn-primary" id="add-submit">Добавить</button>
    </div>
  `);
  
  $("add-submit").addEventListener("click", async () => {
    const username = $("add-user").value.trim().toLowerCase();
    if (!username) return;
    
    const uid = generateUid(username);
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) { $("add-err").textContent = "Не найден"; return; }
    
    const chatSnap = await getDoc(doc(db, "chats", chatId));
    if (chatSnap.data().members.includes(uid)) { $("add-err").textContent = "Уже в чате"; return; }
    
    await updateDoc(doc(db, "chats", chatId), { members: arrayUnion(uid) });
    showToast(`@${username} добавлен`);
    closeModal();
  });
}

els.chatAvatar.addEventListener("click", () => { if (state.currentChatId) openChatProfile(state.currentChatId); });
els.chatHeaderInfo.addEventListener("click", () => { if (state.currentChatId) openChatProfile(state.currentChatId); });

// ============================================================
// СООБЩЕНИЯ
// ============================================================
function listenToMessages(chatId) {
  const q = query(collection(db, "chats", chatId, "messages"), orderBy("timestamp", "asc"));
  state.unsubMessages = onSnapshot(q, snap => {
    const msgs = [];
    let hasNew = false;
    
    snap.docChanges().forEach(change => {
      if (change.type === "added" && change.doc.data().senderId !== state.currentUser.uid) {
        hasNew = true;
        const msg = change.doc.data();
        sendNotification("Новое сообщение", msg.senderName + ": " + (msg.text || "📎 Медиа"));
      }
    });
    
    snap.forEach(d => msgs.push({ id: d.id, ...d.data() }));
    renderMessages(msgs);
  });
}

function renderMessages(msgs) {
  if (!msgs.length) {
    els.messagesContainer.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);"><div style="font-size:48px;margin-bottom:12px;">✉️</div><p>Нет сообщений</p></div>';
    return;
  }

  const uid = state.currentUser.uid;
  const chat = state.currentChat;
  const isAdmin = chat?.admins?.includes(uid);
  const chatName = chat?.name || chat?._dmUser?.name || "Чат";

  let html = "";
  msgs.forEach(msg => {
    const isOwn = msg.senderId === uid;
    const cls = isOwn ? "own" : "other";
    const time = formatTime(msg.timestamp);
    const showSender = !isOwn && (chat.type === "group" || chat.type === "channel");
    const senderHtml = showSender ? `<div class="message-sender" data-uid="${msg.senderId}">@${msg.senderUsername || "user"}${msg.senderVerified ? verifiedBadge() : ''}</div>` : "";
    
    let readStatus = "";
    if (isOwn) {
      readStatus = msg.read ? '<span class="message-status read">✓✓</span>' : '<span class="message-status">✓</span>';
    }
    
    const editedHtml = msg.edited ? '<span class="message-edited">(изм.)</span>' : '';

    let content = "";
    switch (msg.type) {
      case "image":
        content = `<img src="${msg.fileUrl}" class="message-image" data-url="${msg.fileUrl}" />`;
        break;
      case "sticker":
        content = `<img src="${msg.stickerUrl}" class="message-sticker" data-packid="${msg.stickerPackId}" />`;
        break;
      case "file":
        content = `<a href="${msg.fileUrl}" target="_blank" class="message-file" download="${msg.fileName}"><span class="message-file-icon">📄</span><div class="message-file-info"><div class="message-file-name">${escapeHtml(msg.fileName)}</div><div class="message-file-size">${formatFileSize(msg.fileSize)}</div></div></a>`;
        break;
      case "voice":
        content = `<div class="message-voice" data-url="${msg.fileUrl}"><button class="voice-play-btn">▶</button><div class="voice-waveform"><div class="voice-progress"></div></div><span class="voice-duration">${formatDuration(msg.duration||0)}</span></div>`;
        break;
      default:
        content = escapeHtml(msg.text);
    }

    // Кнопки действий
    let actionsHtml = `<div class="message-actions">`;
    actionsHtml += `<button class="message-action-btn" data-fav='${JSON.stringify({id: msg.id, text: msg.text || "", chatName})}' title="В избранное">⭐</button>`;
    if (isOwn && msg.type === "text") {
      actionsHtml += `<button class="message-action-btn" data-edit="${msg.id}" data-text="${escapeHtml(msg.text || '')}" title="Редактировать">✏️</button>`;
    }
    if (isOwn || isAdmin) {
      actionsHtml += `<button class="message-action-btn" data-delete="${msg.id}" title="Удалить">🗑️</button>`;
    }
    actionsHtml += `</div>`;

    html += `
      <div class="message ${cls}" data-msgid="${msg.id}">
        ${senderHtml}
        <div class="message-bubble">${content}</div>
        <div class="message-footer">
          ${editedHtml}
          <span class="message-time">${time}</span>
          ${readStatus}
        </div>
        ${actionsHtml}
      </div>
    `;
  });

  els.messagesContainer.innerHTML = html;

  // Обработчики
  els.messagesContainer.querySelectorAll("[data-delete]").forEach(btn => {
    btn.addEventListener("click", () => deleteMessage(btn.dataset.delete));
  });
  
  els.messagesContainer.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", () => startEditMessage(btn.dataset.edit, btn.dataset.text));
  });
  
  els.messagesContainer.querySelectorAll("[data-fav]").forEach(btn => {
    btn.addEventListener("click", () => {
      const data = JSON.parse(btn.dataset.fav);
      addToFavorites(data, data.chatName);
    });
  });

  els.messagesContainer.querySelectorAll(".message-image").forEach(img => {
    img.addEventListener("click", () => showImageViewer(img.dataset.url));
  });
  
  els.messagesContainer.querySelectorAll(".message-sticker").forEach(sticker => {
    sticker.addEventListener("click", () => openStickerPack(sticker.dataset.packid));
  });

  els.messagesContainer.querySelectorAll(".message-voice").forEach(voice => {
    const playBtn = voice.querySelector(".voice-play-btn");
    const progress = voice.querySelector(".voice-progress");
    const dur = voice.querySelector(".voice-duration");
    let audio = null;

    playBtn.addEventListener("click", () => {
      if (!audio) {
        audio = new Audio(voice.dataset.url);
        audio.addEventListener("timeupdate", () => {
          progress.style.width = (audio.currentTime / audio.duration * 100) + "%";
          dur.textContent = formatDuration(audio.currentTime);
        });
        audio.addEventListener("ended", () => { playBtn.textContent = "▶"; progress.style.width = "0%"; });
      }
      if (audio.paused) { audio.play(); playBtn.textContent = "⏸"; }
      else { audio.pause(); playBtn.textContent = "▶"; }
    });
  });

  els.messagesContainer.querySelectorAll(".message-sender").forEach(el => {
    el.addEventListener("click", () => openProfile(el.dataset.uid));
  });

  els.messagesContainer.scrollTop = els.messagesContainer.scrollHeight;
}

function startEditMessage(msgId, text) {
  state.editingMessageId = msgId;
  els.messageInput.value = text;
  els.editIndicator.classList.remove("hidden");
  els.messageInput.focus();
}

els.cancelEdit.addEventListener("click", () => {
  state.editingMessageId = null;
  els.messageInput.value = "";
  els.editIndicator.classList.add("hidden");
});

async function sendMessage() {
  const text = els.messageInput.value.trim();
  
  // Редактирование
  if (state.editingMessageId) {
    if (!text) return;
    await updateDoc(doc(db, "chats", state.currentChatId, "messages", state.editingMessageId), { text, edited: true });
    state.editingMessageId = null;
    els.messageInput.value = "";
    els.editIndicator.classList.add("hidden");
    showToast("Сообщение изменено");
    return;
  }

  if (!text && !state.attachments.length) return;
  if (!state.currentChatId) return;

  els.messageInput.value = "";
  els.messageInput.style.height = "auto";

  const chatId = state.currentChatId;
  const messagesRef = collection(db, "chats", chatId, "messages");
  const chatRef = doc(db, "chats", chatId);

  try {
    for (const att of state.attachments) {
      showToast("Загрузка файла...");
      const url = await uploadFile(att.file, `messages/${chatId}/${Date.now()}_${att.file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
      
      const msgData = {
        type: att.type, fileUrl: url, fileName: att.file.name, fileSize: att.file.size,
        senderId: state.currentUser.uid, senderName: state.currentUser.name,
        senderUsername: state.currentUser.username, senderVerified: state.currentUser.verified,
        timestamp: serverTimestamp(), read: false
      };
      await addDoc(messagesRef, msgData);
      await updateDoc(chatRef, { lastMessage: { ...msgData, timestamp: serverTimestamp() } });
    }

    if (text) {
      const msgData = {
        type: "text", text,
        senderId: state.currentUser.uid, senderName: state.currentUser.name,
        senderUsername: state.currentUser.username, senderVerified: state.currentUser.verified,
        timestamp: serverTimestamp(), read: false
      };
      await addDoc(messagesRef, msgData);
      await updateDoc(chatRef, { lastMessage: { ...msgData, timestamp: serverTimestamp() } });
    }

    state.attachments = [];
    updateAttachments();
  } catch (err) {
    console.error("Send error:", err);
    showToast("Ошибка: " + err.message, "error");
  }
}

async function deleteMessage(id) {
  if (!confirm("Удалить сообщение?")) return;
  await deleteDoc(doc(db, "chats", state.currentChatId, "messages", id));
  showToast("Удалено");
}

els.btnSend.addEventListener("click", sendMessage);
els.messageInput.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
els.messageInput.addEventListener("input", () => { els.messageInput.style.height = "auto"; els.messageInput.style.height = Math.min(els.messageInput.scrollHeight, 120) + "px"; });

// Вложения
els.btnAttachFile.addEventListener("click", () => els.fileInput.click());
els.btnAttachImage.addEventListener("click", () => els.imageInput.click());

els.fileInput.addEventListener("change", e => {
  const file = e.target.files[0];
  if (file) {
    if (file.size > 25 * 1024 * 1024) { showToast("Макс. 25 МБ", "error"); return; }
    state.attachments.push({ file, type: "file" });
    updateAttachments();
  }
  els.fileInput.value = "";
});

els.imageInput.addEventListener("change", e => {
  const file = e.target.files[0];
  if (file) {
    if (file.size > 10 * 1024 * 1024) { showToast("Макс. 10 МБ", "error"); return; }
    state.attachments.push({ file, type: "image", preview: URL.createObjectURL(file) });
    updateAttachments();
  }
  els.imageInput.value = "";
});

function updateAttachments() {
  if (!state.attachments.length) {
    els.attachmentsPreview.classList.add("hidden");
    els.attachmentsPreview.innerHTML = "";
    return;
  }

  els.attachmentsPreview.classList.remove("hidden");
  let html = "";
  state.attachments.forEach((att, i) => {
    if (att.type === "image" && att.preview) {
      html += `<div class="attachment-item"><img src="${att.preview}" /><button class="attachment-remove" data-i="${i}">✕</button></div>`;
    } else {
      html += `<div class="attachment-item"><span style="font-size:24px;">📄</span><span style="font-size:12px;max-width:80px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(att.file.name)}</span><button class="attachment-remove" data-i="${i}">✕</button></div>`;
    }
  });
  els.attachmentsPreview.innerHTML = html;

  els.attachmentsPreview.querySelectorAll(".attachment-remove").forEach(btn => {
    btn.addEventListener("click", () => {
      state.attachments.splice(parseInt(btn.dataset.i), 1);
      updateAttachments();
    });
  });
}

// Голосовые
els.btnVoice.addEventListener("click", () => {
  if (state.isRecording) stopRecording();
  else startRecording();
});

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.mediaRecorder = new MediaRecorder(stream);
    state.audioChunks = [];

    state.mediaRecorder.addEventListener("dataavailable", e => state.audioChunks.push(e.data));
    state.mediaRecorder.addEventListener("stop", async () => {
      const blob = new Blob(state.audioChunks, { type: "audio/webm" });
      stream.getTracks().forEach(t => t.stop());
      if (blob.size > 0 && state.currentChatId) await sendVoice(blob);
    });

    state.mediaRecorder.start();
    state.isRecording = true;
    els.btnVoice.classList.add("btn-voice", "recording");
    els.btnVoice.textContent = "⏹";
    showToast("Запись...");
  } catch (err) {
    showToast("Нет доступа к микрофону", "error");
  }
}

function stopRecording() {
  if (state.mediaRecorder && state.isRecording) {
    state.mediaRecorder.stop();
    state.isRecording = false;
    els.btnVoice.classList.remove("recording");
    els.btnVoice.textContent = "🎤";
  }
}

async function sendVoice(blob) {
  try {
    showToast("Отправка...");
    const chatId = state.currentChatId;
    const url = await uploadFile(blob, `voice/${chatId}/${Date.now()}.webm`);

    const audio = new Audio();
    audio.src = URL.createObjectURL(blob);
    await new Promise(r => { audio.addEventListener("loadedmetadata", r); audio.load(); });

    const msgData = {
      type: "voice", fileUrl: url, duration: audio.duration || 0,
      senderId: state.currentUser.uid, senderName: state.currentUser.name,
      senderUsername: state.currentUser.username, senderVerified: state.currentUser.verified,
      timestamp: serverTimestamp(), read: false
    };

    await addDoc(collection(db, "chats", chatId, "messages"), msgData);
    await updateDoc(doc(db, "chats", chatId), { lastMessage: { ...msgData, timestamp: serverTimestamp() } });
    showToast("Отправлено");
  } catch (err) {
    showToast("Ошибка: " + err.message, "error");
  }
}

// ============================================================
// УПРАВЛЕНИЕ ЧАТОМ
// ============================================================
async function openChatManage() {
  const chat = state.currentChat;
  if (!chat) return;

  const members = [];
  for (const uid of chat.members) {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) members.push(snap.data());
    } catch {}
  }

  let membersHtml = "";
  members.forEach(m => {
    const isCreator = m.uid === chat.createdBy;
    const isAdminM = chat.admins?.includes(m.uid);
    const isBanned = chat.bannedUsers?.includes(m.uid);
    const isSelf = m.uid === state.currentUser.uid;

    let badge = isCreator ? 'создатель' : isAdminM ? 'админ' : '';
    if (isBanned) badge += ' (забанен)';

    let actions = "";
    if (!isSelf && !isCreator) {
      actions += isBanned 
        ? `<button class="btn btn-ghost btn-sm" data-action="unban" data-uid="${m.uid}">Разбан</button>`
        : `<button class="btn btn-ghost btn-sm" data-action="ban" data-uid="${m.uid}">Бан</button>`;
      if (!isAdminM) actions += `<button class="btn btn-ghost btn-sm" data-action="admin" data-uid="${m.uid}">+Админ</button>`;
    }

    membersHtml += `<div class="member-item"><div class="member-info"><div class="member-info-avatar">${m.avatar ? `<img src="${m.avatar}" />` : getInitials(m.name)}</div><div><div class="member-name">${escapeHtml(m.name)}${m.verified ? verifiedBadge() : ''} ${isSelf ? '(вы)' : ''}</div>${badge ? `<div class="member-role">${badge}</div>` : ''}</div></div><div class="member-actions">${actions}</div></div>`;
  });

  showModal(`
    <h3>Управление</h3>
    <div class="form-group"><label>Название</label><div style="display:flex;gap:8px;"><input type="text" id="chat-name-edit" class="form-input" value="${escapeHtml(chat.name)}" maxlength="40" /><button class="btn btn-primary btn-sm" id="save-chat-name">✓</button></div></div>
    <div class="form-group"><label>Аватар</label><button class="btn btn-ghost btn-sm" id="change-chat-avatar">Изменить</button></div>
    <div class="settings-section-title">Участники (${chat.members.length})</div>
    <div class="member-list">${membersHtml}</div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Закрыть</button></div>
  `);

  $("save-chat-name").addEventListener("click", async () => {
    const name = $("chat-name-edit").value.trim();
    if (!name) return;
    await updateDoc(doc(db, "chats", chat.chatId), { name });
    state.currentChat.name = name;
    els.chatName.innerHTML = escapeHtml(name) + (chat.verified ? verifiedBadge() : "");
    showToast("Название изменено");
  });
  
  $("change-chat-avatar").addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const url = await uploadFile(file, `chat_avatars/${chat.chatId}_${Date.now()}.${file.name.split('.').pop()}`);
        await updateDoc(doc(db, "chats", chat.chatId), { avatar: url });
        state.currentChat.avatar = url;
        setupChatHeader(state.currentChat);
        showToast("Аватар обновлён");
      } catch (err) {
        showToast("Ошибка: " + err.message, "error");
      }
    };
    input.click();
  });

  document.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.action;
      const targetUid = btn.dataset.uid;
      const chatRef = doc(db, "chats", chat.chatId);

      if (action === "ban") await updateDoc(chatRef, { bannedUsers: arrayUnion(targetUid) });
      else if (action === "unban") await updateDoc(chatRef, { bannedUsers: arrayRemove(targetUid) });
      else if (action === "admin") await updateDoc(chatRef, { admins: arrayUnion(targetUid) });

      showToast("Готово");
      const updated = await getDoc(chatRef);
      state.currentChat = updated.data();
      closeModal();
      openChatManage();
    });
  });
}

// ============================================================
// ПОИСК
// ============================================================
let searchTimeout = null;
els.searchInput.addEventListener("input", () => {
  clearTimeout(searchTimeout);
  const val = els.searchInput.value.trim().toLowerCase().replace("@", "");
  if (!val) { els.searchResults.classList.add("hidden"); return; }
  searchTimeout = setTimeout(() => searchUsers(val), 400);
});

async function searchUsers(username) {
  const uid = generateUid(username);
  const snap = await getDoc(doc(db, "users", uid));
  
  let html = '<div class="search-results-title">Результаты</div>';
  
  if (snap.exists() && snap.data().uid !== state.currentUser.uid) {
    const u = snap.data();
    const onlineHtml = u.online ? '<span class="online-indicator"></span>' : '';
    html += `
      <div class="search-result-item" data-uid="${u.uid}">
        <div class="search-result-avatar">${u.avatar ? `<img src="${u.avatar}" />` : getInitials(u.name)}${onlineHtml}</div>
        <div class="search-result-info">
          <div class="search-result-name">${escapeHtml(u.name)}${u.verified ? verifiedBadge() : ''}</div>
          <div class="search-result-username">@${u.username}</div>
        </div>
      </div>
    `;
  } else {
    html += '<div style="padding:12px 8px;color:var(--text-muted);font-size:13px;">Не найдено</div>';
  }

  els.searchResults.innerHTML = html;
  els.searchResults.classList.remove("hidden");

  els.searchResults.querySelectorAll(".search-result-item").forEach(item => {
    item.addEventListener("click", async () => {
      const uid = item.dataset.uid;
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const u = snap.data();
        openOrCreateDM(u.uid, u.name, u.username);
      }
      els.searchInput.value = "";
      els.searchResults.classList.add("hidden");
    });
  });
}

// Мобильная навигация
els.btnBackMobile.addEventListener("click", () => els.sidebar.classList.remove("sidebar-hidden"));

// ============================================================
// ЗАПУСК
// ============================================================
showScreen("loading");
checkAuth();
