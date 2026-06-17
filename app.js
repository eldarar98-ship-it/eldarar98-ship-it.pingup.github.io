// ============================================================
// PingUp Messenger — Полная версия
// Профили, подписки, медиа, пароли, верификация, админ-панель
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, serverTimestamp, arrayUnion, arrayRemove
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

// Пароль админ-панели
const ADMIN_PASSWORD = "Jwyzyqh1c492bJJjoqv119wvwmdl";

// Состояние
const state = {
  currentUser: null,
  currentChatId: null,
  currentChat: null,
  unsubMessages: null,
  unsubChats: null,
  attachments: [],
  isRecording: false,
  mediaRecorder: null,
  audioChunks: []
};

const STORAGE_KEY = "pingup_user";
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
  sidebar: $("sidebar"),
  myProfileBtn: $("my-profile-btn"),
  btnSettings: $("btn-settings"),
  searchInput: $("search-input"),
  searchResults: $("search-results"),
  chatList: $("chat-list"),
  chatPlaceholder: $("chat-placeholder"),
  activeChat: $("active-chat"),
  chatAvatar: $("chat-avatar"),
  chatName: $("chat-name"),
  chatTypeLabel: $("chat-type-label"),
  chatHeaderInfo: $("chat-header-info"),
  btnAdminPanel: $("btn-admin-panel"),
  messagesContainer: $("messages-container"),
  messageInputBar: $("message-input-bar"),
  messageInput: $("message-input"),
  btnSend: $("btn-send"),
  btnVoice: $("btn-voice"),
  btnAttachFile: $("btn-attach-file"),
  btnAttachImage: $("btn-attach-image"),
  attachmentsPreview: $("attachments-preview"),
  inputBlockedMsg: $("input-blocked-msg"),
  btnCreateGroup: $("btn-create-group"),
  btnCreateChannel: $("btn-create-channel"),
  btnBackMobile: $("btn-back-mobile"),
  modalRoot: $("modal-root"),
  toastContainer: $("toast-container"),
  fileInput: $("file-input"),
  imageInput: $("image-input"),
  avatarInput: $("avatar-input"),
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

function getChatEmoji(type) {
  return type === "dm" ? "👤" : type === "group" ? "👥" : type === "channel" ? "📢" : "💬";
}

function formatTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function formatDuration(s) { return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`; }
function formatFileSize(b) { return b < 1024 ? b + ' Б' : b < 1048576 ? (b/1024).toFixed(1) + ' КБ' : (b/1048576).toFixed(1) + ' МБ'; }
function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
function generateUid(u) { return `user_${u.toLowerCase()}`; }

function showModal(html) {
  els.modalRoot.innerHTML = `<div class="modal-overlay" id="modal-overlay"><div class="modal">${html}</div></div>`;
  $("modal-overlay").addEventListener("click", e => { if (e.target.id === "modal-overlay") closeModal(); });
}

function closeModal() { els.modalRoot.innerHTML = ""; }

function showImageViewer(url) {
  els.imageViewerRoot.innerHTML = `<div class="image-viewer"><button class="image-viewer-close">✕</button><img src="${url}" /></div>`;
  els.imageViewerRoot.querySelector(".image-viewer").addEventListener("click", () => { els.imageViewerRoot.innerHTML = ""; });
}

function verifiedBadge(size = "") {
  return `<span class="verified-badge ${size}" title="Верифицирован">✓</span>`;
}

async function uploadFile(file, path) {
  const r = ref(storage, path);
  await uploadBytes(r, file);
  return await getDownloadURL(r);
}

// ============================================================
// АУТЕНТИФИКАЦИЯ
// ============================================================
function saveUser(u) { localStorage.setItem(STORAGE_KEY, JSON.stringify(u)); }
function loadUser() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; } }
function clearUser() { localStorage.removeItem(STORAGE_KEY); }

els.btnLogin.addEventListener("click", login);
els.loginUsername.addEventListener("keydown", e => { if (e.key === "Enter") login(); });
els.loginPassword.addEventListener("keydown", e => { if (e.key === "Enter") login(); });

async function login() {
  const name = els.loginName.value.trim();
  const username = els.loginUsername.value.trim().toLowerCase();
  const password = els.loginPassword.value;

  if (!name) { els.loginError.textContent = "Введите имя"; return; }
  if (!username || !/^[a-z0-9]{3,20}$/.test(username)) { els.loginError.textContent = "Юзернейм: 3-20 символов, латиница/цифры"; return; }

  els.loginError.textContent = "";
  els.btnLogin.disabled = true;
  els.btnLogin.textContent = "Вход...";

  try {
    const uid = generateUid(username);
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const user = userSnap.data();
      
      // Проверка бана
      if (user.banned) {
        showScreen("banned");
        els.btnLogin.disabled = false;
        els.btnLogin.textContent = "Войти";
        return;
      }

      // Проверка пароля
      if (user.password && user.password !== password) {
        els.loginError.textContent = "Неверный пароль";
        els.btnLogin.disabled = false;
        els.btnLogin.textContent = "Войти";
        return;
      }

      // Обновляем имя если изменилось
      if (user.name !== name) {
        await updateDoc(userRef, { name });
        user.name = name;
      }

      state.currentUser = user;
      saveUser(user);
      showToast(`С возвращением, ${user.name}!`);
    } else {
      // Регистрация
      const newUser = {
        uid, name, username,
        password: password || "",
        avatar: "", bio: "",
        followers: [], following: [],
        blockedUsers: [],
        verified: false,
        banned: false,
        createdAt: serverTimestamp()
      };
      await setDoc(userRef, newUser);
      state.currentUser = { ...newUser, createdAt: new Date() };
      saveUser(state.currentUser);
      showToast("Аккаунт создан!");
    }
    initApp();
  } catch (err) {
    console.error(err);
    els.loginError.textContent = "Ошибка подключения";
  } finally {
    els.btnLogin.disabled = false;
    els.btnLogin.textContent = "Войти";
  }
}

els.bannedLogoutBtn?.addEventListener("click", () => {
  clearUser();
  showScreen("login");
});

async function checkAuth() {
  const saved = loadUser();
  if (saved?.uid) {
    try {
      const snap = await getDoc(doc(db, "users", saved.uid));
      if (snap.exists()) {
        const user = snap.data();
        if (user.banned) {
          showScreen("banned");
          return;
        }
        state.currentUser = user;
        saveUser(user);
        initApp();
        return;
      }
    } catch (err) { console.error(err); }
  }
  clearUser();
  showScreen("login");
}

function logout() {
  if (state.unsubChats) state.unsubChats();
  if (state.unsubMessages) state.unsubMessages();
  state.currentUser = null;
  state.currentChatId = null;
  state.currentChat = null;
  clearUser();
  showScreen("login");
  showToast("Вы вышли");
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================
function initApp() {
  showScreen("app");
  updateMyAvatar();
  deselectChat();
  listenToChats();
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

// ============================================================
// НАСТРОЙКИ
// ============================================================
function openSettings() {
  const u = state.currentUser;
  const hasPassword = !!u.password;

  showModal(`
    <h3>⚙️ Настройки</h3>
    
    <div class="settings-section">
      <div class="settings-section-title">Профиль</div>
      
      <div class="settings-item" id="settings-change-name">
        <span class="settings-item-label">Имя</span>
        <span class="settings-item-value">${escapeHtml(u.name)} →</span>
      </div>
      
      <div class="settings-item" id="settings-change-username">
        <span class="settings-item-label">Юзернейм</span>
        <span class="settings-item-value">@${u.username} →</span>
      </div>
      
      <div class="settings-item" id="settings-change-avatar">
        <span class="settings-item-label">Аватар</span>
        <span class="settings-item-value">Изменить →</span>
      </div>
      
      <div class="settings-item" id="settings-change-bio">
        <span class="settings-item-label">О себе</span>
        <span class="settings-item-value">${u.bio ? 'Изменить' : 'Добавить'} →</span>
      </div>
    </div>
    
    <div class="settings-section">
      <div class="settings-section-title">Безопасность</div>
      
      <div class="settings-item" id="settings-change-password">
        <span class="settings-item-label">${hasPassword ? 'Изменить пароль' : 'Установить пароль'}</span>
        <span class="settings-item-value">→</span>
      </div>
    </div>
    
    <div class="settings-section">
      <div class="settings-section-title">Приватность</div>
      
      <div class="settings-item" id="settings-blocked-users">
        <span class="settings-item-label">Заблокированные</span>
        <span class="settings-item-value">${(u.blockedUsers||[]).length} →</span>
      </div>
    </div>
    
    <div class="settings-divider" id="settings-admin-trigger" title=""></div>
    
    <div class="modal-actions">
      <button class="btn btn-danger" id="settings-logout">Выйти</button>
      <button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Закрыть</button>
    </div>
  `);

  $("settings-change-name").addEventListener("click", settingsChangeName);
  $("settings-change-username").addEventListener("click", settingsChangeUsername);
  $("settings-change-avatar").addEventListener("click", () => els.avatarInput.click());
  $("settings-change-bio").addEventListener("click", settingsChangeBio);
  $("settings-change-password").addEventListener("click", settingsChangePassword);
  $("settings-blocked-users").addEventListener("click", settingsBlockedUsers);
  $("settings-logout").addEventListener("click", () => { closeModal(); logout(); });
  $("settings-admin-trigger").addEventListener("click", openAdminAuth);
}

function settingsChangeName() {
  showModal(`
    <h3>Изменить имя</h3>
    <div class="form-group">
      <input type="text" id="new-name" class="form-input" value="${escapeHtml(state.currentUser.name)}" maxlength="30" />
    </div>
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
    saveUser(state.currentUser);
    updateMyAvatar();
    showToast("Имя изменено");
    closeModal();
  });
}

function settingsChangeUsername() {
  showModal(`
    <h3>Изменить юзернейм</h3>
    <div class="form-group">
      <input type="text" id="new-username" class="form-input" value="${state.currentUser.username}" maxlength="20" />
      <div class="form-hint">Внимание: вам придётся войти заново</div>
      <div id="username-error" class="form-error"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Отмена</button>
      <button class="btn btn-primary" id="save-username">Сохранить</button>
    </div>
  `);
  $("save-username").addEventListener("click", async () => {
    const newUsername = $("new-username").value.trim().toLowerCase();
    const errEl = $("username-error");
    if (!/^[a-z0-9]{3,20}$/.test(newUsername)) { errEl.textContent = "3-20 символов, латиница/цифры"; return; }
    if (newUsername === state.currentUser.username) { closeModal(); return; }

    const newUid = generateUid(newUsername);
    const exists = await getDoc(doc(db, "users", newUid));
    if (exists.exists()) { errEl.textContent = "Юзернейм занят"; return; }

    // Создаём нового пользователя
    const newUser = { ...state.currentUser, uid: newUid, username: newUsername };
    await setDoc(doc(db, "users", newUid), newUser);
    // Удаляем старого
    await deleteDoc(doc(db, "users", state.currentUser.uid));
    
    state.currentUser = newUser;
    saveUser(newUser);
    showToast("Юзернейм изменён");
    closeModal();
  });
}

function settingsChangeBio() {
  showModal(`
    <h3>О себе</h3>
    <div class="form-group">
      <textarea id="new-bio" class="form-input" rows="3" maxlength="200" placeholder="Расскажите о себе...">${escapeHtml(state.currentUser.bio || '')}</textarea>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Отмена</button>
      <button class="btn btn-primary" id="save-bio">Сохранить</button>
    </div>
  `);
  $("save-bio").addEventListener("click", async () => {
    const bio = $("new-bio").value.trim();
    await updateDoc(doc(db, "users", state.currentUser.uid), { bio });
    state.currentUser.bio = bio;
    saveUser(state.currentUser);
    showToast("Сохранено");
    closeModal();
  });
}

function settingsChangePassword() {
  const hasPassword = !!state.currentUser.password;
  showModal(`
    <h3>${hasPassword ? 'Изменить пароль' : 'Установить пароль'}</h3>
    ${hasPassword ? `<div class="form-group"><label>Текущий пароль</label><input type="password" id="current-password" class="form-input" /></div>` : ''}
    <div class="form-group">
      <label>Новый пароль</label>
      <input type="password" id="new-password" class="form-input" placeholder="Минимум 4 символа" />
    </div>
    <div id="password-error" class="form-error"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Отмена</button>
      <button class="btn btn-primary" id="save-password">Сохранить</button>
    </div>
  `);
  $("save-password").addEventListener("click", async () => {
    const errEl = $("password-error");
    if (hasPassword) {
      const current = $("current-password").value;
      if (current !== state.currentUser.password) { errEl.textContent = "Неверный текущий пароль"; return; }
    }
    const newPass = $("new-password").value;
    if (newPass.length < 4) { errEl.textContent = "Минимум 4 символа"; return; }
    
    await updateDoc(doc(db, "users", state.currentUser.uid), { password: newPass });
    state.currentUser.password = newPass;
    saveUser(state.currentUser);
    showToast("Пароль сохранён");
    closeModal();
  });
}

async function settingsBlockedUsers() {
  const blocked = state.currentUser.blockedUsers || [];
  let listHtml = "";
  
  for (const uid of blocked) {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const u = snap.data();
        listHtml += `
          <div class="member-item">
            <div class="member-info">
              <div class="member-info-avatar">${u.avatar ? `<img src="${u.avatar}" />` : getInitials(u.name)}</div>
              <div class="member-name">${escapeHtml(u.name)}</div>
            </div>
            <button class="btn btn-ghost btn-sm" data-uid="${uid}">Разблокировать</button>
          </div>
        `;
      }
    } catch {}
  }

  if (!listHtml) listHtml = '<p style="color:var(--text-muted);text-align:center;padding:20px;">Список пуст</p>';

  showModal(`
    <h3>Заблокированные пользователи</h3>
    <div class="member-list">${listHtml}</div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Закрыть</button>
    </div>
  `);

  document.querySelectorAll(".member-item button").forEach(btn => {
    btn.addEventListener("click", async () => {
      const uid = btn.dataset.uid;
      await updateDoc(doc(db, "users", state.currentUser.uid), { blockedUsers: arrayRemove(uid) });
      state.currentUser.blockedUsers = state.currentUser.blockedUsers.filter(u => u !== uid);
      saveUser(state.currentUser);
      showToast("Разблокирован");
      settingsBlockedUsers();
    });
  });
}

// Загрузка аватара
els.avatarInput.addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showToast("Макс. 5 МБ", "error"); return; }

  try {
    showToast("Загрузка...");
    const url = await uploadFile(file, `avatars/${state.currentUser.uid}_${Date.now()}`);
    await updateDoc(doc(db, "users", state.currentUser.uid), { avatar: url });
    state.currentUser.avatar = url;
    saveUser(state.currentUser);
    updateMyAvatar();
    showToast("Аватар обновлён");
    closeModal();
  } catch (err) {
    showToast("Ошибка загрузки", "error");
  }
  els.avatarInput.value = "";
});

// ============================================================
// АДМИН-ПАНЕЛЬ
// ============================================================
function openAdminAuth() {
  showModal(`
    <h3>🔐 Доступ</h3>
    <div class="form-group">
      <input type="password" id="admin-password" class="form-input" placeholder="Пароль" />
      <div id="admin-error" class="form-error"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Отмена</button>
      <button class="btn btn-primary" id="admin-submit">Войти</button>
    </div>
  `);
  $("admin-submit").addEventListener("click", () => {
    if ($("admin-password").value === ADMIN_PASSWORD) {
      openAdminPanelFull();
    } else {
      $("admin-error").textContent = "Неверный пароль";
    }
  });
}

function openAdminPanelFull() {
  showModal(`
    <h3>👑 Админ-панель</h3>
    
    <div class="admin-panel-section">
      <div class="admin-panel-section-inner">
        <div class="settings-section-title">Верификация</div>
        <div class="form-group">
          <input type="text" id="admin-verify-username" class="form-input" placeholder="Юзернейм пользователя/группы/канала" />
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary btn-sm" id="admin-verify-give">Выдать ✓</button>
          <button class="btn btn-danger btn-sm" id="admin-verify-remove">Забрать ✓</button>
        </div>
      </div>
    </div>
    
    <div class="admin-panel-section">
      <div class="admin-panel-section-inner">
        <div class="settings-section-title">Бан пользователя</div>
        <div class="form-group">
          <input type="text" id="admin-ban-username" class="form-input" placeholder="Юзернейм" />
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-danger btn-sm" id="admin-ban-user">Забанить</button>
          <button class="btn btn-primary btn-sm" id="admin-unban-user">Разбанить</button>
        </div>
      </div>
    </div>
    
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Закрыть</button>
    </div>
  `);

  // Верификация
  $("admin-verify-give").addEventListener("click", () => adminSetVerified(true));
  $("admin-verify-remove").addEventListener("click", () => adminSetVerified(false));
  
  // Бан
  $("admin-ban-user").addEventListener("click", () => adminSetBanned(true));
  $("admin-unban-user").addEventListener("click", () => adminSetBanned(false));
}

async function adminSetVerified(verified) {
  const username = $("admin-verify-username").value.trim().toLowerCase();
  if (!username) return;

  // Проверяем пользователя
  const userUid = generateUid(username);
  const userSnap = await getDoc(doc(db, "users", userUid));
  if (userSnap.exists()) {
    await updateDoc(doc(db, "users", userUid), { verified });
    showToast(verified ? "Галочка выдана" : "Галочка снята");
    return;
  }

  // Проверяем чаты (группы/каналы)
  const chatsQuery = query(collection(db, "chats"), where("name", "==", username));
  const chatsSnap = await getDocs(chatsQuery);
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
  const username = $("admin-ban-username").value.trim().toLowerCase();
  if (!username) return;

  const userUid = generateUid(username);
  const userSnap = await getDoc(doc(db, "users", userUid));
  if (userSnap.exists()) {
    await updateDoc(doc(db, "users", userUid), { banned });
    showToast(banned ? "Пользователь забанен" : "Пользователь разбанен");
  } else {
    showToast("Пользователь не найден", "error");
  }
}

// ============================================================
// ПРОФИЛИ
// ============================================================
async function openProfile(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) { showToast("Не найден", "error"); return; }
    
    const user = snap.data();
    const isOwn = uid === state.currentUser.uid;
    const isFollowing = state.currentUser.following?.includes(uid);
    const isBlocked = state.currentUser.blockedUsers?.includes(uid);

    const avatarHtml = user.avatar 
      ? `<img src="${user.avatar}" />${isOwn ? '<div class="profile-avatar-edit">Изменить</div>' : ''}`
      : `${getInitials(user.name)}${isOwn ? '<div class="profile-avatar-edit">Добавить</div>' : ''}`;

    const verifiedHtml = user.verified ? verifiedBadge("verified-badge-lg") : "";
    const verifiedText = user.verified ? '<div class="verified-text">Верифицированный аккаунт</div>' : "";

    let actionsHtml = "";
    if (isOwn) {
      actionsHtml = `<button class="btn btn-ghost" id="profile-settings">⚙️ Настройки</button>`;
    } else {
      actionsHtml = `
        <button class="btn ${isFollowing ? 'btn-ghost' : 'btn-primary'}" id="profile-follow">${isFollowing ? 'Отписаться' : 'Подписаться'}</button>
        <button class="btn btn-primary" id="profile-message">Написать</button>
        <button class="btn ${isBlocked ? 'btn-primary' : 'btn-danger'}" id="profile-block">${isBlocked ? 'Разблокировать' : 'Заблокировать'}</button>
      `;
    }

    showModal(`
      <div class="profile-header">
        <div class="profile-avatar" id="profile-avatar" ${isOwn ? 'style="cursor:pointer"' : ''}>${avatarHtml}</div>
        <div class="profile-name">${escapeHtml(user.name)}${verifiedHtml}</div>
        <div class="profile-username">@${user.username}</div>
        ${verifiedText}
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
      $("profile-avatar").addEventListener("click", () => els.avatarInput.click());
      $("profile-settings")?.addEventListener("click", openSettings);
    } else {
      $("profile-follow")?.addEventListener("click", async () => {
        await toggleFollow(uid, isFollowing);
        openProfile(uid);
      });
      $("profile-message")?.addEventListener("click", () => {
        closeModal();
        openOrCreateDM(uid, user.name, user.username);
      });
      $("profile-block")?.addEventListener("click", async () => {
        await toggleBlock(uid, isBlocked);
        openProfile(uid);
      });
    }

    document.querySelectorAll(".profile-stat").forEach(el => {
      el.addEventListener("click", () => openFollowList(el.dataset.uid, el.dataset.type));
    });

  } catch (err) {
    console.error(err);
    showToast("Ошибка", "error");
  }
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
  saveUser(state.currentUser);
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
  saveUser(state.currentUser);
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
        html += `
          <div class="member-item">
            <div class="member-info" data-uid="${u.uid}">
              <div class="member-info-avatar">${u.avatar ? `<img src="${u.avatar}" />` : getInitials(u.name)}</div>
              <div class="member-name">${escapeHtml(u.name)}${u.verified ? verifiedBadge() : ''}</div>
            </div>
          </div>
        `;
      }
    } catch {}
  }

  if (!html) html = '<p style="color:var(--text-muted);text-align:center;padding:20px;">Пусто</p>';

  showModal(`
    <h3>${type === "followers" ? "Подписчики" : "Подписки"}</h3>
    <div class="member-list">${html}</div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Закрыть</button></div>
  `);

  document.querySelectorAll(".member-info").forEach(el => {
    el.addEventListener("click", () => { closeModal(); openProfile(el.dataset.uid); });
  });
}

// ============================================================
// ПРОФИЛЬ ЧАТА
// ============================================================
async function openChatProfile(chatId) {
  const snap = await getDoc(doc(db, "chats", chatId));
  if (!snap.exists()) return;

  const chat = snap.data();
  
  if (chat.type === "dm") {
    const otherUid = chat.members.find(m => m !== state.currentUser.uid);
    if (otherUid) openProfile(otherUid);
    return;
  }

  const isAdmin = chat.admins?.includes(state.currentUser.uid);
  const isCreator = chat.createdBy === state.currentUser.uid;
  const typeLabel = chat.type === "group" ? "Группа" : "Канал";
  const emoji = getChatEmoji(chat.type);

  const avatarHtml = chat.avatar 
    ? `<img src="${chat.avatar}" />${isAdmin ? '<div class="profile-avatar-edit">Изменить</div>' : ''}`
    : `${emoji}${isAdmin ? '<div class="profile-avatar-edit">Добавить</div>' : ''}`;

  const verifiedHtml = chat.verified ? verifiedBadge("verified-badge-lg") : "";
  const verifiedText = chat.verified ? '<div class="verified-text">Верифицированный ' + typeLabel.toLowerCase() + '</div>' : "";

  let membersHtml = "";
  for (const uid of chat.members.slice(0, 15)) {
    try {
      const uSnap = await getDoc(doc(db, "users", uid));
      if (uSnap.exists()) {
        const u = uSnap.data();
        const badge = uid === chat.createdBy ? '<span class="member-role">создатель</span>' : chat.admins?.includes(uid) ? '<span class="member-role">админ</span>' : '';
        membersHtml += `
          <div class="member-item">
            <div class="member-info" data-uid="${u.uid}">
              <div class="member-info-avatar">${u.avatar ? `<img src="${u.avatar}" />` : getInitials(u.name)}</div>
              <div>
                <div class="member-name">${escapeHtml(u.name)}${u.verified ? verifiedBadge() : ''}</div>
                <div style="font-size:11px;color:var(--text-muted);">@${u.username} ${badge}</div>
              </div>
            </div>
          </div>
        `;
      }
    } catch {}
  }

  let actionsHtml = "";
  if (isAdmin) {
    actionsHtml += `<button class="btn btn-primary" id="chat-add-member">➕ Добавить</button>`;
    actionsHtml += `<button class="btn btn-ghost" id="chat-manage">⚙️ Управление</button>`;
  }
  if (!isCreator) {
    actionsHtml += `<button class="btn btn-danger" id="chat-leave">Выйти</button>`;
  }

  showModal(`
    <div class="profile-header">
      <div class="profile-avatar" id="chat-avatar-edit" ${isAdmin ? 'style="cursor:pointer"' : ''}>${avatarHtml}</div>
      <div class="profile-name">${escapeHtml(chat.name)}${verifiedHtml}</div>
      <div class="profile-username">${typeLabel} · ${chat.members.length} участн.</div>
      ${verifiedText}
    </div>
    
    <div class="settings-section-title">Участники</div>
    <div class="member-list">${membersHtml}</div>

    <div class="profile-actions" style="margin-top:16px;">${actionsHtml}</div>
  `);

  if (isAdmin) {
    $("chat-avatar-edit").addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = async e => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const url = await uploadFile(file, `chat_avatars/${chatId}_${Date.now()}`);
          await updateDoc(doc(db, "chats", chatId), { avatar: url });
          showToast("Аватар обновлён");
          closeModal();
          if (state.currentChatId === chatId) setupChatHeader({ ...chat, avatar: url });
        } catch { showToast("Ошибка", "error"); }
      };
      input.click();
    });

    $("chat-add-member")?.addEventListener("click", () => openAddMember(chatId));
    $("chat-manage")?.addEventListener("click", openChatManage);
  }

  $("chat-leave")?.addEventListener("click", async () => {
    if (confirm("Выйти из чата?")) {
      await updateDoc(doc(db, "chats", chatId), { members: arrayRemove(state.currentUser.uid) });
      closeModal();
      deselectChat();
      showToast("Вы вышли");
    }
  });

  document.querySelectorAll(".member-info").forEach(el => {
    el.addEventListener("click", () => { closeModal(); openProfile(el.dataset.uid); });
  });
}

function openAddMember(chatId) {
  showModal(`
    <h3>Добавить участника</h3>
    <div class="form-group">
      <input type="text" id="add-username" class="form-input" placeholder="Юзернейм" />
      <div id="add-error" class="form-error"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Отмена</button>
      <button class="btn btn-primary" id="add-submit">Добавить</button>
    </div>
  `);

  $("add-submit").addEventListener("click", async () => {
    const username = $("add-username").value.trim().toLowerCase();
    const errEl = $("add-error");
    if (!username) return;

    const uid = generateUid(username);
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) { errEl.textContent = "Не найден"; return; }

    const chatSnap = await getDoc(doc(db, "chats", chatId));
    if (chatSnap.data().members.includes(uid)) { errEl.textContent = "Уже в чате"; return; }

    await updateDoc(doc(db, "chats", chatId), { members: arrayUnion(uid) });
    showToast(`@${username} добавлен`);
    closeModal();
  });
}

els.chatAvatar.addEventListener("click", () => { if (state.currentChatId) openChatProfile(state.currentChatId); });
els.chatHeaderInfo.addEventListener("click", () => { if (state.currentChatId) openChatProfile(state.currentChatId); });

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
    html += `
      <div class="search-result-item" data-uid="${u.uid}" data-name="${escapeHtml(u.name)}" data-username="${u.username}">
        <div class="search-result-avatar">${u.avatar ? `<img src="${u.avatar}" />` : getInitials(u.name)}</div>
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
    item.addEventListener("click", () => {
      openOrCreateDM(item.dataset.uid, item.dataset.name, item.dataset.username);
      els.searchInput.value = "";
      els.searchResults.classList.add("hidden");
    });
  });
}

// ============================================================
// ЧАТЫ
// ============================================================
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
    <div class="form-group">
      <input type="text" id="group-name" class="form-input" placeholder="Название группы" maxlength="40" />
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Отмена</button>
      <button class="btn btn-primary" id="create-group-submit">Создать</button>
    </div>
  `);
  $("create-group-submit").addEventListener("click", async () => {
    const name = $("group-name").value.trim();
    if (!name) return;
    await createChat("group", name);
    closeModal();
  });
});

els.btnCreateChannel.addEventListener("click", () => {
  showModal(`
    <h3>Создать канал</h3>
    <div class="form-group">
      <input type="text" id="channel-name" class="form-input" placeholder="Название канала" maxlength="40" />
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Отмена</button>
      <button class="btn btn-primary" id="create-channel-submit">Создать</button>
    </div>
  `);
  $("create-channel-submit").addEventListener("click", async () => {
    const name = $("channel-name").value.trim();
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
  state.unsubChats = onSnapshot(q, snap => {
    const chats = [];
    snap.forEach(d => chats.push(d.data()));
    renderChatList(chats);
  });
}

function renderChatList(chats) {
  if (!chats.length) {
    els.chatList.innerHTML = `<div class="chat-list-empty"><div class="chat-list-empty-icon">💬</div><p>Нет чатов</p></div>`;
    return;
  }

  chats.sort((a, b) => (b.lastMessage?.timestamp?.seconds || 0) - (a.lastMessage?.timestamp?.seconds || 0));

  let html = "";
  chats.forEach(chat => {
    let displayName = chat.name || "Чат";
    const emoji = getChatEmoji(chat.type);
    let avatarHtml = chat.avatar ? `<img src="${chat.avatar}" />` : getInitials(displayName);

    if (chat.type === "dm" && chat.lastMessage) {
      displayName = chat.lastMessage.senderId === state.currentUser.uid 
        ? (chat.lastMessage._otherName || "Чат") 
        : (chat.lastMessage.senderName || "Чат");
    }

    const isActive = state.currentChatId === chat.chatId ? "active" : "";
    const verifiedHtml = chat.verified ? verifiedBadge() : "";
    
    let lastMsgText = "Нет сообщений";
    if (chat.lastMessage) {
      const t = chat.lastMessage.type;
      const prefix = chat.lastMessage.senderName + ": ";
      lastMsgText = t === "image" ? prefix + "🖼️ Фото" : t === "file" ? prefix + "📎 Файл" : t === "voice" ? prefix + "🎤 Голосовое" : prefix + (chat.lastMessage.text || "");
    }

    html += `
      <div class="chat-item ${isActive}" data-chatid="${chat.chatId}">
        <div class="chat-item-avatar">${avatarHtml}<span class="chat-item-badge">${emoji}</span></div>
        <div class="chat-item-content">
          <div class="chat-item-name">${escapeHtml(displayName)}${verifiedHtml}</div>
          <div class="chat-item-last-msg">${escapeHtml(lastMsgText)}</div>
        </div>
        <div class="chat-item-time">${formatTime(chat.lastMessage?.timestamp)}</div>
      </div>
    `;
  });

  els.chatList.innerHTML = html;
  els.chatList.querySelectorAll(".chat-item").forEach(item => {
    item.addEventListener("click", () => {
      selectChat(item.dataset.chatid);
      if (window.innerWidth <= 768) els.sidebar.classList.add("sidebar-hidden");
    });
  });
}

async function selectChat(chatId) {
  if (state.unsubMessages) state.unsubMessages();
  state.currentChatId = chatId;
  state.attachments = [];
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
  let typeLabel = "";
  let avatarHtml = "";
  let verified = chat.verified;

  if (chat.type === "dm") {
    typeLabel = "Личный чат";
    const otherUid = chat.members.find(m => m !== state.currentUser.uid);
    if (otherUid) {
      const snap = await getDoc(doc(db, "users", otherUid));
      if (snap.exists()) {
        const u = snap.data();
        displayName = u.name;
        typeLabel = `@${u.username}`;
        if (u.avatar) avatarHtml = `<img src="${u.avatar}" />`;
        verified = u.verified;
      }
    }
  } else {
    typeLabel = `${chat.type === "group" ? "Группа" : "Канал"} · ${chat.members.length}`;
  }

  if (chat.avatar) avatarHtml = `<img src="${chat.avatar}" />`;
  
  els.chatAvatar.innerHTML = avatarHtml || getInitials(displayName);
  els.chatName.innerHTML = escapeHtml(displayName) + (verified ? verifiedBadge() : "");
  els.chatTypeLabel.textContent = typeLabel;

  const isAdmin = chat.admins?.includes(state.currentUser.uid);
  els.btnAdminPanel.classList.toggle("hidden", !(chat.type !== "dm" && isAdmin));
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
  }

  // Проверка на личную блокировку
  if (chat.type === "dm") {
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

// ============================================================
// СООБЩЕНИЯ
// ============================================================
function listenToMessages(chatId) {
  const q = query(collection(db, "chats", chatId, "messages"), orderBy("timestamp", "asc"));
  state.unsubMessages = onSnapshot(q, snap => {
    const msgs = [];
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

  let html = "";
  msgs.forEach(msg => {
    const isOwn = msg.senderId === uid;
    const cls = isOwn ? "own" : "other";
    const time = formatTime(msg.timestamp);
    const canDelete = isOwn || isAdmin;
    const deleteBtn = canDelete ? `<button class="message-delete-btn" data-id="${msg.id}">✕</button>` : "";
    const showSender = !isOwn && (chat.type === "group" || chat.type === "channel");
    
    // Получаем инфо об отправителе для галочки
    const senderVerified = msg.senderVerified ? verifiedBadge() : "";
    const senderHtml = showSender ? `<div class="message-sender" data-uid="${msg.senderId}">@${msg.senderUsername || "user"}${senderVerified}</div>` : "";

    let content = "";
    switch (msg.type) {
      case "image":
        content = `<img src="${msg.fileUrl}" class="message-image" data-url="${msg.fileUrl}" />${deleteBtn}`;
        break;
      case "file":
        content = `<a href="${msg.fileUrl}" target="_blank" class="message-file" download="${msg.fileName}"><span class="message-file-icon">📄</span><div class="message-file-info"><div class="message-file-name">${escapeHtml(msg.fileName)}</div><div class="message-file-size">${formatFileSize(msg.fileSize)}</div></div></a>${deleteBtn}`;
        break;
      case "voice":
        content = `<div class="message-voice" data-url="${msg.fileUrl}"><button class="voice-play-btn">▶</button><div class="voice-waveform"><div class="voice-progress"></div></div><span class="voice-duration">${formatDuration(msg.duration||0)}</span></div>${deleteBtn}`;
        break;
      default:
        content = `${escapeHtml(msg.text)}${deleteBtn}`;
    }

    html += `<div class="message ${cls}">${senderHtml}<div class="message-bubble">${content}</div><div class="message-time">${time}</div></div>`;
  });

  els.messagesContainer.innerHTML = html;

  // Обработчики
  els.messagesContainer.querySelectorAll(".message-delete-btn").forEach(btn => {
    btn.addEventListener("click", e => { e.stopPropagation(); deleteMessage(btn.dataset.id); });
  });

  els.messagesContainer.querySelectorAll(".message-image").forEach(img => {
    img.addEventListener("click", () => showImageViewer(img.dataset.url));
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

async function sendMessage() {
  const text = els.messageInput.value.trim();
  if (!text && !state.attachments.length) return;
  if (!state.currentChatId) return;

  els.messageInput.value = "";
  els.messageInput.style.height = "auto";

  const chatId = state.currentChatId;
  const messagesRef = collection(db, "chats", chatId, "messages");
  const chatRef = doc(db, "chats", chatId);

  try {
    for (const att of state.attachments) {
      const url = await uploadFile(att.file, `messages/${chatId}/${Date.now()}_${att.file.name}`);
      const msgData = {
        type: att.type, fileUrl: url, fileName: att.file.name, fileSize: att.file.size,
        senderId: state.currentUser.uid, senderName: state.currentUser.name,
        senderUsername: state.currentUser.username, senderVerified: state.currentUser.verified,
        timestamp: serverTimestamp()
      };
      await addDoc(messagesRef, msgData);
      await updateDoc(chatRef, { lastMessage: { ...msgData, timestamp: serverTimestamp() } });
    }

    if (text) {
      const msgData = {
        type: "text", text,
        senderId: state.currentUser.uid, senderName: state.currentUser.name,
        senderUsername: state.currentUser.username, senderVerified: state.currentUser.verified,
        timestamp: serverTimestamp()
      };
      await addDoc(messagesRef, msgData);
      await updateDoc(chatRef, { lastMessage: { ...msgData, timestamp: serverTimestamp() } });
    }

    state.attachments = [];
    updateAttachments();
  } catch (err) {
    console.error(err);
    showToast("Ошибка отправки", "error");
  }
}

async function deleteMessage(id) {
  if (!state.currentChatId) return;
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
    const chatId = state.currentChatId;
    const url = await uploadFile(blob, `voice/${chatId}/${Date.now()}.webm`);

    const audio = new Audio();
    audio.src = URL.createObjectURL(blob);
    await new Promise(r => { audio.addEventListener("loadedmetadata", r); audio.load(); });

    const msgData = {
      type: "voice", fileUrl: url, duration: audio.duration || 0,
      senderId: state.currentUser.uid, senderName: state.currentUser.name,
      senderUsername: state.currentUser.username, senderVerified: state.currentUser.verified,
      timestamp: serverTimestamp()
    };

    await addDoc(collection(db, "chats", chatId, "messages"), msgData);
    await updateDoc(doc(db, "chats", chatId), { lastMessage: { ...msgData, timestamp: serverTimestamp() } });
    showToast("Отправлено");
  } catch (err) {
    showToast("Ошибка", "error");
  }
}

// ============================================================
// УПРАВЛЕНИЕ ЧАТОМ
// ============================================================
els.btnAdminPanel.addEventListener("click", openChatManage);

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

    let badge = isCreator ? '<span class="member-role">создатель</span>' : isAdminM ? '<span class="member-role">админ</span>' : '';
    if (isBanned) badge += ' <span style="color:var(--danger);font-size:11px;">забанен</span>';

    let actions = "";
    if (!isSelf && !isCreator) {
      actions += isBanned 
        ? `<button class="btn btn-ghost btn-sm" data-action="unban" data-uid="${m.uid}">Разбан</button>`
        : `<button class="btn btn-ghost btn-sm" data-action="ban" data-uid="${m.uid}">Бан</button>`;
      if (!isAdminM) actions += `<button class="btn btn-ghost btn-sm" data-action="admin" data-uid="${m.uid}">+Админ</button>`;
    }

    membersHtml += `
      <div class="member-item">
        <div class="member-info">
          <div class="member-info-avatar">${m.avatar ? `<img src="${m.avatar}" />` : getInitials(m.name)}</div>
          <div>
            <div class="member-name">${escapeHtml(m.name)}${m.verified ? verifiedBadge() : ''} ${isSelf ? '(вы)' : ''}</div>
            <div style="font-size:11px;color:var(--text-muted);">@${m.username} ${badge}</div>
          </div>
        </div>
        <div class="member-actions">${actions}</div>
      </div>
    `;
  });

  showModal(`
    <h3>Управление</h3>
    <div class="form-group">
      <label>Название</label>
      <div style="display:flex;gap:8px;">
        <input type="text" id="chat-rename" class="form-input" value="${escapeHtml(chat.name)}" maxlength="40" />
        <button class="btn btn-primary btn-sm" id="chat-rename-btn">✓</button>
      </div>
    </div>
    <div class="form-group">
      <label>Добавить участника</label>
      <div style="display:flex;gap:8px;">
        <input type="text" id="chat-add-user" class="form-input" placeholder="Юзернейм" />
        <button class="btn btn-primary btn-sm" id="chat-add-btn">+</button>
      </div>
      <div id="chat-add-error" class="form-error"></div>
    </div>
    <div class="settings-section-title">Участники (${chat.members.length})</div>
    <div class="member-list">${membersHtml}</div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Закрыть</button></div>
  `);

  $("chat-rename-btn").addEventListener("click", async () => {
    const name = $("chat-rename").value.trim();
    if (!name) return;
    await updateDoc(doc(db, "chats", chat.chatId), { name });
    state.currentChat.name = name;
    els.chatName.innerHTML = escapeHtml(name) + (chat.verified ? verifiedBadge() : "");
    showToast("Название изменено");
  });

  $("chat-add-btn").addEventListener("click", async () => {
    const username = $("chat-add-user").value.trim().toLowerCase();
    if (!username) return;
    const uid = generateUid(username);
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) { $("chat-add-error").textContent = "Не найден"; return; }
    if (chat.members.includes(uid)) { $("chat-add-error").textContent = "Уже в чате"; return; }
    await updateDoc(doc(db, "chats", chat.chatId), { members: arrayUnion(uid) });
    showToast(`@${username} добавлен`);
    closeModal();
    openChatManage();
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

// Мобильная навигация
els.btnBackMobile.addEventListener("click", () => els.sidebar.classList.remove("sidebar-hidden"));

// Запуск
showScreen("loading");
checkAuth();
