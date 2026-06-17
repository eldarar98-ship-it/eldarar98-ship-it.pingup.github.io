// ============================================================
// PingUp Messenger — app.js
// Полная клиентская логика на Firebase v10 (Modular SDK)
// Простая авторизация по имени и юзернейму (без Google Auth)
// ============================================================

// ── Импорт Firebase модулей через CDN ──
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ── Конфигурация Firebase ──
const firebaseConfig = {
  apiKey: "AIzaSyDabgrOHjzPSLjBJs8wwVutsHbQ4SF316Q",
  authDomain: "pingup-messenger.firebaseapp.com",
  projectId: "pingup-messenger",
  storageBucket: "pingup-messenger.firebasestorage.app",
  messagingSenderId: "158687830003",
  appId: "1:158687830003:web:b5c1ac59ec9dae69aa3c86",
  measurementId: "G-S83FN408FE"
};

// Инициализация Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ============================================================
// ГЛОБАЛЬНОЕ СОСТОЯНИЕ ПРИЛОЖЕНИЯ
// ============================================================

/**
 * state — объект с текущим состоянием приложения.
 * currentUser: данные текущего авторизованного пользователя из Firestore
 * currentChatId: ID выбранного чата
 * currentChat: объект данных текущего чата
 * unsubMessages: функция отписки от слушателя сообщений
 * unsubChats: функция отписки от слушателя списка чатов
 */
const state = {
  currentUser: null,
  currentChatId: null,
  currentChat: null,
  unsubMessages: null,
  unsubChats: null
};

// Ключ для хранения данных пользователя в localStorage
const STORAGE_KEY = "pingup_user";

// ============================================================
// ПОЛУЧЕНИЕ DOM-ЭЛЕМЕНТОВ
// ============================================================
const $ = (id) => document.getElementById(id);

const els = {
  loadingScreen: $("loading-screen"),
  loginScreen: $("login-screen"),
  appScreen: $("app-screen"),
  loginName: $("login-name"),
  loginUsername: $("login-username"),
  loginError: $("login-error"),
  btnLogin: $("btn-login"),
  sidebar: $("sidebar"),
  sidebarUserName: $("sidebar-user-name"),
  btnLogout: $("btn-logout"),
  searchInput: $("search-input"),
  searchResults: $("search-results"),
  chatList: $("chat-list"),
  chatPlaceholder: $("chat-placeholder"),
  activeChat: $("active-chat"),
  chatAvatar: $("chat-avatar"),
  chatName: $("chat-name"),
  chatTypeLabel: $("chat-type-label"),
  btnAdminPanel: $("btn-admin-panel"),
  messagesContainer: $("messages-container"),
  messageInputBar: $("message-input-bar"),
  messageInput: $("message-input"),
  btnSend: $("btn-send"),
  inputBlockedMsg: $("input-blocked-msg"),
  messageInputArea: $("message-input-area"),
  btnCreateGroup: $("btn-create-group"),
  btnCreateChannel: $("btn-create-channel"),
  btnBackMobile: $("btn-back-mobile"),
  modalRoot: $("modal-root"),
  toastContainer: $("toast-container")
};

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

/**
 * showScreen — переключает видимость экранов приложения.
 * Скрывает все экраны, затем показывает нужный.
 * @param {string} screenName — одно из: 'loading', 'login', 'app'
 */
function showScreen(screenName) {
  els.loadingScreen.classList.add("hidden");
  els.loginScreen.classList.add("hidden");
  els.appScreen.classList.add("hidden");

  switch (screenName) {
    case "loading":
      els.loadingScreen.classList.remove("hidden");
      break;
    case "login":
      els.loginScreen.classList.remove("hidden");
      break;
    case "app":
      els.appScreen.classList.remove("hidden");
      break;
  }
}

/**
 * showToast — показывает всплывающее уведомление внизу экрана.
 * @param {string} message — текст уведомления
 * @param {string} type — 'success' или 'error'
 */
function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  els.toastContainer.appendChild(toast);
  // Удаляем тост через 3 секунды
  setTimeout(() => toast.remove(), 3000);
}

/**
 * getInitials — возвращает первую букву имени в верхнем регистре.
 * @param {string} name — имя пользователя или чата
 * @returns {string} — первая буква
 */
function getInitials(name) {
  if (!name) return "?";
  return name.charAt(0).toUpperCase();
}

/**
 * getChatEmoji — возвращает эмодзи в зависимости от типа чата.
 * @param {string} type — тип чата ('dm', 'group', 'channel')
 * @returns {string} — эмодзи
 */
function getChatEmoji(type) {
  switch (type) {
    case "dm": return "👤";
    case "group": return "👥";
    case "channel": return "📢";
    default: return "💬";
  }
}

/**
 * formatTime — форматирует Firebase Timestamp в читаемое время.
 * @param {object} timestamp — Firebase Timestamp объект
 * @returns {string} — отформатированное время
 */
function formatTime(timestamp) {
  if (!timestamp) return "";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  if (isToday) {
    return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

/**
 * showModal — открывает модальное окно с произвольным HTML-содержимым.
 * @param {string} html — HTML-строка для содержимого модального окна
 */
function showModal(html) {
  els.modalRoot.innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal">${html}</div>
    </div>
  `;
  // Закрытие модалки по клику на оверлей (за пределами окна)
  document.getElementById("modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "modal-overlay") closeModal();
  });
}

/**
 * closeModal — закрывает текущее модальное окно.
 */
function closeModal() {
  els.modalRoot.innerHTML = "";
}

/**
 * generateUid — генерирует уникальный ID пользователя на основе юзернейма.
 * @param {string} username — юзернейм пользователя
 * @returns {string} — уникальный ID
 */
function generateUid(username) {
  return `user_${username.toLowerCase()}`;
}

// ============================================================
// АУТЕНТИФИКАЦИЯ (ПРОСТАЯ — ПО ИМЕНИ И ЮЗЕРНЕЙМУ)
// ============================================================

/**
 * Сохраняет данные пользователя в localStorage.
 * @param {object} userData — объект с данными пользователя
 */
function saveUserToStorage(userData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
}

/**
 * Загружает данные пользователя из localStorage.
 * @returns {object|null} — данные пользователя или null
 */
function loadUserFromStorage() {
  const data = localStorage.getItem(STORAGE_KEY);
  if (data) {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Удаляет данные пользователя из localStorage.
 */
function clearUserFromStorage() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Обработчик кнопки "Войти".
 * Проверяет данные, ищет существующего пользователя или создаёт нового.
 */
els.btnLogin.addEventListener("click", async () => {
  const name = els.loginName.value.trim();
  const username = els.loginUsername.value.trim().toLowerCase();

  // Валидация: имя не пустое
  if (!name) {
    els.loginError.textContent = "Введите ваше имя";
    return;
  }

  // Валидация: юзернейм не пустой
  if (!username) {
    els.loginError.textContent = "Введите юзернейм";
    return;
  }

  // Валидация: только латинские буквы и цифры
  if (!/^[a-z0-9]+$/i.test(username)) {
    els.loginError.textContent = "Только латинские буквы и цифры, без пробелов";
    return;
  }

  // Минимальная длина
  if (username.length < 3) {
    els.loginError.textContent = "Юзернейм должен быть не менее 3 символов";
    return;
  }

  els.loginError.textContent = "";
  els.btnLogin.disabled = true;
  els.btnLogin.textContent = "Вход...";

  try {
    // Генерируем uid на основе юзернейма
    const uid = generateUid(username);

    // Проверяем, существует ли пользователь с таким юзернеймом
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      // Пользователь существует — проверяем, совпадает ли имя
      // (простая "авторизация" — достаточно знать юзернейм)
      const existingUser = userSnap.data();
      
      // Обновляем имя, если оно изменилось
      if (existingUser.name !== name) {
        await updateDoc(userRef, { name: name });
        existingUser.name = name;
      }
      
      state.currentUser = existingUser;
      saveUserToStorage(existingUser);
      showToast(`С возвращением, ${existingUser.name}!`, "success");
    } else {
      // Пользователь не существует — создаём нового
      const newUser = {
        uid: uid,
        name: name,
        username: username,
        createdAt: serverTimestamp()
      };

      await setDoc(userRef, newUser);
      
      // Для локального состояния используем текущее время
      state.currentUser = { ...newUser, createdAt: new Date() };
      saveUserToStorage(state.currentUser);
      showToast(`Аккаунт создан! Добро пожаловать, ${name}!`, "success");
    }

    // Переходим к приложению
    initApp();
  } catch (err) {
    console.error("Ошибка входа:", err);
    els.loginError.textContent = "Ошибка подключения. Попробуйте снова.";
  } finally {
    els.btnLogin.disabled = false;
    els.btnLogin.textContent = "Войти";
  }
});

// Вход по нажатию Enter в поле юзернейма
els.loginUsername.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    els.btnLogin.click();
  }
});

els.loginName.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    els.loginUsername.focus();
  }
});

/**
 * Выход из аккаунта — отписываемся от слушателей,
 * очищаем localStorage и переключаемся на экран логина.
 */
els.btnLogout.addEventListener("click", () => {
  // Отписываемся от всех слушателей при выходе
  if (state.unsubChats) state.unsubChats();
  if (state.unsubMessages) state.unsubMessages();
  state.currentUser = null;
  state.currentChatId = null;
  state.currentChat = null;
  state.unsubChats = null;
  state.unsubMessages = null;
  clearUserFromStorage();
  showScreen("login");
  showToast("Вы вышли из аккаунта", "success");
});

/**
 * checkAuth — проверяет, есть ли сохранённый пользователь в localStorage.
 * Если есть — загружает приложение, если нет — показывает экран логина.
 */
async function checkAuth() {
  const savedUser = loadUserFromStorage();

  if (savedUser && savedUser.uid) {
    try {
      // Проверяем, существует ли пользователь в Firestore
      const userRef = doc(db, "users", savedUser.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        // Пользователь существует — загружаем актуальные данные
        state.currentUser = userSnap.data();
        saveUserToStorage(state.currentUser);
        initApp();
        return;
      }
    } catch (err) {
      console.error("Ошибка проверки пользователя:", err);
    }
  }

  // Пользователь не найден — показываем экран логина
  clearUserFromStorage();
  showScreen("login");
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ ГЛАВНОГО ПРИЛОЖЕНИЯ
// ============================================================

/**
 * initApp — вызывается после успешной авторизации.
 * Показывает главный экран, обновляет UI и запускает слушатели.
 */
function initApp() {
  showScreen("app");

  // Показываем имя пользователя в шапке сайдбара
  els.sidebarUserName.textContent = `@${state.currentUser.username}`;

  // Сбрасываем чат — показываем заглушку
  deselectChat();

  // Запускаем слушатель списка чатов
  listenToChats();
}

// ============================================================
// ПОИСК ПОЛЬЗОВАТЕЛЕЙ
// ============================================================

/**
 * Поиск по юзернейму — слушаем ввод в поле поиска.
 * При каждом изменении (с дебаунсом) ищем пользователей в Firestore
 * по точному совпадению username.
 */
let searchTimeout = null;
els.searchInput.addEventListener("input", () => {
  clearTimeout(searchTimeout);
  const val = els.searchInput.value.trim().toLowerCase().replace("@", "");

  if (!val) {
    els.searchResults.classList.add("hidden");
    els.searchResults.innerHTML = "";
    return;
  }

  // Дебаунс 400мс — ждём, пока пользователь закончит печатать
  searchTimeout = setTimeout(() => searchUsers(val), 400);
});

/**
 * searchUsers — выполняет поиск пользователей по точному совпадению юзернейма.
 * @param {string} username — юзернейм для поиска
 */
async function searchUsers(username) {
  try {
    const q = query(
      collection(db, "users"),
      where("username", "==", username)
    );
    const snap = await getDocs(q);
    let html = '<div class="search-results-title">Результаты поиска</div>';
    let found = false;

    snap.forEach((docSnap) => {
      const user = docSnap.data();
      // Не показываем самого себя
      if (user.uid === state.currentUser.uid) return;
      found = true;
      html += `
        <div class="search-result-item" data-uid="${user.uid}" data-name="${user.name}" data-username="${user.username}">
          <div class="search-result-avatar">${getInitials(user.name)}</div>
          <div class="search-result-info">
            <div class="search-result-name">${user.name}</div>
            <div class="search-result-username">@${user.username}</div>
          </div>
        </div>
      `;
    });

    if (!found) {
      html += '<div style="padding: 12px 8px; color: var(--text-muted); font-size: 13px;">Пользователь не найден</div>';
    }

    els.searchResults.innerHTML = html;
    els.searchResults.classList.remove("hidden");

    // Навешиваем обработчики клика на найденных пользователей
    els.searchResults.querySelectorAll(".search-result-item").forEach((item) => {
      item.addEventListener("click", () => {
        const uid = item.dataset.uid;
        const name = item.dataset.name;
        const uname = item.dataset.username;
        openOrCreateDM(uid, name, uname);
        els.searchInput.value = "";
        els.searchResults.classList.add("hidden");
      });
    });
  } catch (err) {
    console.error("Ошибка поиска:", err);
  }
}

// ============================================================
// ЛИЧНЫЕ ЧАТЫ (DM)
// ============================================================

/**
 * openOrCreateDM — открывает существующий личный чат или создаёт новый.
 * ChatId формируется детерминированно: uid'ы сортируются и соединяются через "_".
 * Это гарантирует, что у двух пользователей всегда один и тот же chatId.
 */
async function openOrCreateDM(otherUid, otherName, otherUsername) {
  // Формируем уникальный chatId из двух uid
  const ids = [state.currentUser.uid, otherUid].sort();
  const chatId = `dm_${ids[0]}_${ids[1]}`;

  try {
    const chatRef = doc(db, "chats", chatId);
    const chatSnap = await getDoc(chatRef);

    if (!chatSnap.exists()) {
      // Создаём новый DM чат
      await setDoc(chatRef, {
        chatId: chatId,
        type: "dm",
        name: "",
        avatar: "",
        createdBy: state.currentUser.uid,
        admins: [],
        members: [state.currentUser.uid, otherUid],
        bannedUsers: [],
        lastMessage: null
      });
    }

    // Открываем чат
    selectChat(chatId);
  } catch (err) {
    console.error("Ошибка создания DM:", err);
    showToast("Ошибка при открытии чата", "error");
  }
}

// ============================================================
// СОЗДАНИЕ ГРУППЫ / КАНАЛА
// ============================================================

/**
 * Обработчик клика кнопки "Создать группу".
 * Показывает модальное окно с формой ввода названия группы.
 */
els.btnCreateGroup.addEventListener("click", () => {
  showModal(`
    <h3>Создать группу</h3>
    <div class="form-group">
      <label>Название группы</label>
      <input type="text" id="modal-group-name" class="form-input" placeholder="Моя группа" maxlength="40" />
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Отмена</button>
      <button class="btn btn-primary" id="modal-btn-create-group">Создать</button>
    </div>
  `);

  document.getElementById("modal-btn-create-group").addEventListener("click", async () => {
    const name = document.getElementById("modal-group-name").value.trim();
    if (!name) {
      showToast("Введите название группы", "error");
      return;
    }
    await createChat("group", name);
    closeModal();
  });
});

/**
 * Обработчик клика кнопки "Создать канал".
 * Аналогично группе — показывает модалку с формой.
 */
els.btnCreateChannel.addEventListener("click", () => {
  showModal(`
    <h3>Создать канал</h3>
    <div class="form-group">
      <label>Название канала</label>
      <input type="text" id="modal-channel-name" class="form-input" placeholder="Мой канал" maxlength="40" />
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Отмена</button>
      <button class="btn btn-primary" id="modal-btn-create-channel">Создать</button>
    </div>
  `);

  document.getElementById("modal-btn-create-channel").addEventListener("click", async () => {
    const name = document.getElementById("modal-channel-name").value.trim();
    if (!name) {
      showToast("Введите название канала", "error");
      return;
    }
    await createChat("channel", name);
    closeModal();
  });
});

/**
 * createChat — создаёт новый чат (группу или канал) в Firestore.
 * Текущий пользователь автоматически становится создателем и админом.
 * @param {string} type — тип чата ('group' | 'channel')
 * @param {string} name — название чата
 */
async function createChat(type, name) {
  try {
    const chatRef = doc(collection(db, "chats"));
    const chatId = chatRef.id;

    await setDoc(chatRef, {
      chatId: chatId,
      type: type,
      name: name,
      avatar: "",
      createdBy: state.currentUser.uid,
      admins: [state.currentUser.uid],
      members: [state.currentUser.uid],
      bannedUsers: [],
      lastMessage: null
    });

    showToast(
      type === "group" ? "Группа создана!" : "Канал создан!",
      "success"
    );
    selectChat(chatId);
  } catch (err) {
    console.error("Ошибка создания чата:", err);
    showToast("Ошибка при создании", "error");
  }
}

// ============================================================
// СЛУШАТЕЛЬ СПИСКА ЧАТОВ (РЕАЛЬНОЕ ВРЕМЯ)
// ============================================================

/**
 * listenToChats — запускает onSnapshot слушатель на коллекцию chats,
 * фильтруя по тем чатам, где текущий пользователь является участником.
 * Каждый раз при изменении данных обновляет DOM списка чатов.
 */
function listenToChats() {
  // Отписываемся от предыдущего слушателя (если был)
  if (state.unsubChats) state.unsubChats();

  const q = query(
    collection(db, "chats"),
    where("members", "array-contains", state.currentUser.uid)
  );

  state.unsubChats = onSnapshot(q, (snapshot) => {
    const chats = [];
    snapshot.forEach((docSnap) => {
      chats.push(docSnap.data());
    });

    renderChatList(chats);
  });
}

/**
 * renderChatList — рендерит список чатов в боковой панели.
 * @param {Array} chats — массив объектов чатов
 */
function renderChatList(chats) {
  if (chats.length === 0) {
    els.chatList.innerHTML = `
      <div class="chat-list-empty">
        <div class="chat-list-empty-icon">💬</div>
        <p>У вас пока нет чатов</p>
        <p style="font-size: 12px; margin-top: 4px;">Найдите пользователя или создайте группу</p>
      </div>
    `;
    return;
  }

  // Сортируем чаты: те, у которых есть lastMessage, идут первыми
  chats.sort((a, b) => {
    const timeA = a.lastMessage?.timestamp?.seconds || 0;
    const timeB = b.lastMessage?.timestamp?.seconds || 0;
    return timeB - timeA;
  });

  let html = "";
  chats.forEach((chat) => {
    // Для DM-чатов определяем имя собеседника (сохраняется в lastMessage)
    let displayName = chat.name || "Чат";
    let emoji = getChatEmoji(chat.type);

    if (chat.type === "dm") {
      // Для DM формируем имя из lastMessage.senderName
      // или просто "Личный чат" если сообщений нет
      if (chat.lastMessage) {
        // Показываем имя собеседника (не своё)
        if (chat.lastMessage.senderId === state.currentUser.uid) {
          displayName = chat.lastMessage._otherName || "Личный чат";
        } else {
          displayName = chat.lastMessage.senderName || "Личный чат";
        }
      } else {
        displayName = "Личный чат";
      }
    }

    const isActive = state.currentChatId === chat.chatId ? "active" : "";
    const lastMsgText = chat.lastMessage
      ? `${chat.lastMessage.senderName}: ${chat.lastMessage.text}`
      : "Нет сообщений";
    const lastMsgTime = chat.lastMessage?.timestamp
      ? formatTime(chat.lastMessage.timestamp)
      : "";

    html += `
      <div class="chat-item ${isActive}" data-chatid="${chat.chatId}">
        <div class="chat-item-avatar">
          ${getInitials(displayName)}
          <span class="chat-item-badge">${emoji}</span>
        </div>
        <div class="chat-item-content">
          <div class="chat-item-name">${displayName}</div>
          <div class="chat-item-last-msg">${lastMsgText}</div>
        </div>
        <div class="chat-item-time">${lastMsgTime}</div>
      </div>
    `;
  });

  els.chatList.innerHTML = html;

  // Навешиваем обработчики клика на каждый чат
  els.chatList.querySelectorAll(".chat-item").forEach((item) => {
    item.addEventListener("click", () => {
      selectChat(item.dataset.chatid);

      // На мобильных — скрываем сайдбар
      if (window.innerWidth <= 768) {
        els.sidebar.classList.add("sidebar-hidden");
      }
    });
  });
}

// ============================================================
// ВЫБОР И ОТОБРАЖЕНИЕ ЧАТА
// ============================================================

/**
 * selectChat — выбирает чат по chatId.
 * Загружает данные чата, настраивает шапку и права, запускает слушатель сообщений.
 * @param {string} chatId — ID чата для открытия
 */
async function selectChat(chatId) {
  // Отписываемся от предыдущего слушателя сообщений
  if (state.unsubMessages) {
    state.unsubMessages();
    state.unsubMessages = null;
  }

  state.currentChatId = chatId;

  try {
    // Загружаем данные чата
    const chatRef = doc(db, "chats", chatId);
    const chatSnap = await getDoc(chatRef);

    if (!chatSnap.exists()) {
      showToast("Чат не найден", "error");
      return;
    }

    const chat = chatSnap.data();
    state.currentChat = chat;

    // Показываем область чата, скрываем заглушку
    els.chatPlaceholder.classList.add("hidden");
    els.activeChat.classList.remove("hidden");
    els.activeChat.style.display = "flex";

    // Настраиваем шапку чата
    await setupChatHeader(chat);

    // Настраиваем права ввода
    setupInputPermissions(chat);

    // Обновляем выделение в списке чатов
    els.chatList.querySelectorAll(".chat-item").forEach((item) => {
      item.classList.toggle("active", item.dataset.chatid === chatId);
    });

    // Запускаем слушатель сообщений
    listenToMessages(chatId);
  } catch (err) {
    console.error("Ошибка при выборе чата:", err);
    showToast("Ошибка при загрузке чата", "error");
  }
}

/**
 * deselectChat — сбрасывает выбранный чат и показывает заглушку.
 */
function deselectChat() {
  if (state.unsubMessages) {
    state.unsubMessages();
    state.unsubMessages = null;
  }
  state.currentChatId = null;
  state.currentChat = null;
  els.chatPlaceholder.classList.remove("hidden");
  els.activeChat.classList.add("hidden");
  els.activeChat.style.display = "none";
}

/**
 * setupChatHeader — настраивает шапку чата: название, тип, кнопку админ-панели.
 * Для DM-чатов определяет имя собеседника.
 */
async function setupChatHeader(chat) {
  let displayName = chat.name;
  let typeLabel = "";

  switch (chat.type) {
    case "dm":
      typeLabel = "Личный чат";
      // Для DM — определяем имя собеседника
      const otherUid = chat.members.find((m) => m !== state.currentUser.uid);
      if (otherUid) {
        try {
          const otherDoc = await getDoc(doc(db, "users", otherUid));
          if (otherDoc.exists()) {
            displayName = otherDoc.data().name;
            typeLabel = `@${otherDoc.data().username}`;
          }
        } catch {
          displayName = "Пользователь";
        }
      }
      break;
    case "group":
      typeLabel = `Группа · ${chat.members.length} участн.`;
      break;
    case "channel":
      typeLabel = `Канал · ${chat.members.length} подписч.`;
      break;
  }

  els.chatAvatar.textContent = getInitials(displayName);
  els.chatName.textContent = displayName;
  els.chatTypeLabel.textContent = typeLabel;

  // Показываем кнопку админ-панели для групп/каналов если пользователь — админ
  const isAdmin = chat.admins && chat.admins.includes(state.currentUser.uid);
  const isGroupOrChannel = chat.type === "group" || chat.type === "channel";

  if (isGroupOrChannel && isAdmin) {
    els.btnAdminPanel.classList.remove("hidden");
  } else {
    els.btnAdminPanel.classList.add("hidden");
  }
}

/**
 * setupInputPermissions — определяет, может ли текущий пользователь
 * писать сообщения в данном чате.
 * - DM: может всегда
 * - Channel: может только создатель (createdBy)
 * - Group: может, если не в bannedUsers
 */
function setupInputPermissions(chat) {
  const uid = state.currentUser.uid;
  let canWrite = true;
  let blockedMessage = "";

  if (chat.type === "channel") {
    // В канале писать может только создатель
    if (chat.createdBy !== uid) {
      canWrite = false;
      blockedMessage = "🔒 Только автор канала может публиковать сообщения";
    }
  } else if (chat.type === "group") {
    // В группе нельзя писать забаненным
    if (chat.bannedUsers && chat.bannedUsers.includes(uid)) {
      canWrite = false;
      blockedMessage = "🚫 Вы заблокированы в этой группе";
    }
  }

  if (canWrite) {
    els.messageInputBar.classList.remove("hidden");
    els.inputBlockedMsg.classList.add("hidden");
    els.messageInput.disabled = false;
    els.btnSend.disabled = false;
  } else {
    els.messageInputBar.classList.add("hidden");
    els.inputBlockedMsg.classList.remove("hidden");
    els.inputBlockedMsg.textContent = blockedMessage;
  }
}

// ============================================================
// СООБЩЕНИЯ: СЛУШАТЕЛЬ, ОТПРАВКА, РЕНДЕРИНГ
// ============================================================

/**
 * listenToMessages — подписывается на подколлекцию messages внутри чата.
 * onSnapshot обновляет DOM при каждом новом сообщении.
 * @param {string} chatId — ID чата
 */
function listenToMessages(chatId) {
  const q = query(
    collection(db, "chats", chatId, "messages"),
    orderBy("timestamp", "asc")
  );

  state.unsubMessages = onSnapshot(q, (snapshot) => {
    const messages = [];
    snapshot.forEach((docSnap) => {
      messages.push({ id: docSnap.id, ...docSnap.data() });
    });
    renderMessages(messages);
  });
}

/**
 * renderMessages — рендерит список сообщений в DOM.
 * Для каждого сообщения определяет, своё оно или чужое,
 * и показывает кнопку удаления для администраторов.
 * @param {Array} messages — массив объектов сообщений
 */
function renderMessages(messages) {
  const container = els.messagesContainer;
  const isAtBottom =
    container.scrollHeight - container.scrollTop - container.clientHeight < 100;

  if (messages.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-muted);">
        <div style="font-size: 48px; margin-bottom: 12px;">✉️</div>
        <p>Нет сообщений</p>
        <p style="font-size: 12px; margin-top: 4px;">Начните общение первым!</p>
      </div>
    `;
    return;
  }

  const uid = state.currentUser.uid;
  const chat = state.currentChat;
  const isAdmin = chat && chat.admins && chat.admins.includes(uid);

  let html = "";
  messages.forEach((msg) => {
    const isOwn = msg.senderId === uid;
    const msgClass = isOwn ? "own" : "other";
    const time = msg.timestamp ? formatTime(msg.timestamp) : "...";

    // Кнопка удаления: для своих сообщений или если текущий пользователь — админ
    const canDelete = isOwn || isAdmin;
    const deleteBtn = canDelete
      ? `<button class="message-delete-btn" data-msgid="${msg.id}" title="Удалить">✕</button>`
      : "";

    // В групповых/канальных чатах показываем имя отправителя
    const showSender = !isOwn && (chat.type === "group" || chat.type === "channel");
    const senderHtml = showSender
      ? `<div class="message-sender">@${msg.senderUsername || "user"}</div>`
      : "";

    html += `
      <div class="message ${msgClass}">
        ${senderHtml}
        <div class="message-bubble">
          ${escapeHtml(msg.text)}
          ${deleteBtn}
        </div>
        <div class="message-time">${time}</div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Навешиваем обработчики на кнопки удаления
  container.querySelectorAll(".message-delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteMessage(btn.dataset.msgid);
    });
  });

  // Прокрутка вниз при получении новых сообщений
  if (isAtBottom || true) {
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }
}

/**
 * escapeHtml — экранирует HTML-символы для безопасного отображения текста.
 * @param {string} text — исходный текст
 * @returns {string} — экранированный текст
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * sendMessage — отправляет новое сообщение в текущий чат.
 * Создаёт документ в подколлекции messages и обновляет lastMessage чата.
 */
async function sendMessage() {
  const text = els.messageInput.value.trim();
  if (!text || !state.currentChatId) return;

  // Очищаем поле ввода сразу (для UX)
  els.messageInput.value = "";
  els.messageInput.style.height = "auto";

  try {
    const chatId = state.currentChatId;
    const messagesRef = collection(db, "chats", chatId, "messages");

    // Формируем объект сообщения
    const messageData = {
      text: text,
      senderId: state.currentUser.uid,
      senderName: state.currentUser.name,
      senderUsername: state.currentUser.username,
      timestamp: serverTimestamp()
    };

    // Добавляем сообщение в подколлекцию
    await addDoc(messagesRef, messageData);

    // Обновляем lastMessage в документе чата (для отображения в списке)
    const chatRef = doc(db, "chats", chatId);
    await updateDoc(chatRef, {
      lastMessage: {
        text: text,
        senderId: state.currentUser.uid,
        senderName: state.currentUser.name,
        timestamp: serverTimestamp()
      }
    });
  } catch (err) {
    console.error("Ошибка отправки сообщения:", err);
    showToast("Ошибка при отправке сообщения", "error");
  }
}

/**
 * deleteMessage — удаляет сообщение из Firestore по его ID.
 * Доступно владельцу сообщения и админам.
 * @param {string} messageId — ID документа сообщения
 */
async function deleteMessage(messageId) {
  if (!state.currentChatId) return;
  try {
    await deleteDoc(doc(db, "chats", state.currentChatId, "messages", messageId));
    showToast("Сообщение удалено", "success");
  } catch (err) {
    console.error("Ошибка удаления сообщения:", err);
    showToast("Ошибка при удалении", "error");
  }
}

// Обработчик нажатия кнопки "Отправить"
els.btnSend.addEventListener("click", sendMessage);

// Обработчик нажатия Enter для отправки (Shift+Enter — новая строка)
els.messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Автоматическое изменение высоты textarea при вводе
els.messageInput.addEventListener("input", () => {
  els.messageInput.style.height = "auto";
  els.messageInput.style.height = Math.min(els.messageInput.scrollHeight, 120) + "px";
});

// ============================================================
// АДМИН-ПАНЕЛЬ (УПРАВЛЕНИЕ ГРУППОЙ / КАНАЛОМ)
// ============================================================

/**
 * Обработчик клика по кнопке админ-панели.
 * Открывает модальное окно со списком участников и действиями администратора.
 */
els.btnAdminPanel.addEventListener("click", () => {
  openAdminPanel();
});

/**
 * openAdminPanel — открывает модальное окно с инструментами управления чатом.
 * Доступные действия: переименование, добавление участника, управление участниками
 * (бан/разбан, назначение админом, удаление из чата).
 */
async function openAdminPanel() {
  const chat = state.currentChat;
  if (!chat) return;

  // Загружаем данные участников из Firestore
  const memberDetails = [];
  for (const uid of chat.members) {
    try {
      const userDoc = await getDoc(doc(db, "users", uid));
      if (userDoc.exists()) {
        memberDetails.push(userDoc.data());
      }
    } catch {
      memberDetails.push({ uid, name: "Unknown", username: "unknown" });
    }
  }

  const typeLabel = chat.type === "group" ? "группы" : "канала";

  let membersHtml = "";
  memberDetails.forEach((member) => {
    const isCreator = member.uid === chat.createdBy;
    const isAdminMember = chat.admins.includes(member.uid);
    const isBanned = chat.bannedUsers && chat.bannedUsers.includes(member.uid);
    const isSelf = member.uid === state.currentUser.uid;

    let roleTag = "";
    if (isCreator) roleTag = '<span class="member-role">создатель</span>';
    else if (isAdminMember) roleTag = '<span class="member-role">админ</span>';
    if (isBanned) roleTag += ' <span style="color:var(--danger);font-size:11px;">забанен</span>';

    // Кнопки действий (не для себя и не для создателя)
    let actionsHtml = "";
    if (!isSelf && !isCreator) {
      if (isBanned) {
        actionsHtml += `<button class="btn btn-ghost btn-sm admin-action" data-action="unban" data-uid="${member.uid}">Разбан</button>`;
      } else {
        actionsHtml += `<button class="btn btn-ghost btn-sm admin-action" data-action="ban" data-uid="${member.uid}">Бан</button>`;
      }
      if (!isAdminMember) {
        actionsHtml += `<button class="btn btn-ghost btn-sm admin-action" data-action="make-admin" data-uid="${member.uid}">Админ</button>`;
      }
    }

    membersHtml += `
      <div class="member-item">
        <div class="member-info">
          <div class="member-info-avatar">${getInitials(member.name)}</div>
          <div>
            <div class="member-name">${escapeHtml(member.name)} ${isSelf ? "(вы)" : ""}</div>
            <div style="font-size:11px;color:var(--text-muted);">@${member.username} ${roleTag}</div>
          </div>
        </div>
        <div class="member-actions">
          ${actionsHtml}
        </div>
      </div>
    `;
  });

  showModal(`
    <h3>Управление ${typeLabel}</h3>

    <div class="form-group">
      <label>Название</label>
      <div style="display:flex;gap:8px;">
        <input type="text" id="admin-chat-name" class="form-input" value="${escapeHtml(chat.name)}" maxlength="40" />
        <button class="btn btn-primary btn-sm" id="admin-btn-rename">✓</button>
      </div>
    </div>

    <div class="form-group">
      <label>Добавить участника</label>
      <div style="display:flex;gap:8px;">
        <input type="text" id="admin-add-username" class="form-input" placeholder="Юзернейм (без @)" />
        <button class="btn btn-primary btn-sm" id="admin-btn-add">+</button>
      </div>
      <div id="admin-add-error" class="form-error"></div>
    </div>

    <label style="font-size:13px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;">
      Участники (${chat.members.length})
    </label>
    <div class="member-list">
      ${membersHtml}
    </div>

    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Закрыть</button>
    </div>
  `);

  // ── Обработчик переименования ──
  document.getElementById("admin-btn-rename").addEventListener("click", async () => {
    const newName = document.getElementById("admin-chat-name").value.trim();
    if (!newName) return;
    try {
      await updateDoc(doc(db, "chats", chat.chatId), { name: newName });
      state.currentChat.name = newName;
      els.chatName.textContent = newName;
      showToast("Название обновлено", "success");
    } catch (err) {
      showToast("Ошибка переименования", "error");
    }
  });

  // ── Обработчик добавления участника ──
  document.getElementById("admin-btn-add").addEventListener("click", async () => {
    const username = document.getElementById("admin-add-username").value.trim().toLowerCase();
    const errorEl = document.getElementById("admin-add-error");

    if (!username) {
      errorEl.textContent = "Введите юзернейм";
      return;
    }

    try {
      // Ищем пользователя по юзернейму
      const q = query(collection(db, "users"), where("username", "==", username));
      const snap = await getDocs(q);

      if (snap.empty) {
        errorEl.textContent = "Пользователь не найден";
        return;
      }

      const foundUser = snap.docs[0].data();

      // Проверяем, не является ли уже участником
      if (chat.members.includes(foundUser.uid)) {
        errorEl.textContent = "Пользователь уже в чате";
        return;
      }

      // Добавляем участника
      await updateDoc(doc(db, "chats", chat.chatId), {
        members: arrayUnion(foundUser.uid)
      });

      showToast(`@${username} добавлен!`, "success");
      closeModal();
      // Обновляем данные чата
      const updatedChat = await getDoc(doc(db, "chats", chat.chatId));
      state.currentChat = updatedChat.data();
      setupChatHeader(state.currentChat);
    } catch (err) {
      console.error("Ошибка добавления участника:", err);
      errorEl.textContent = "Ошибка при добавлении";
    }
  });

  // ── Обработчики действий с участниками (бан, разбан, назначение админом) ──
  document.querySelectorAll(".admin-action").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.action;
      const targetUid = btn.dataset.uid;
      const chatRef = doc(db, "chats", chat.chatId);

      try {
        switch (action) {
          case "ban":
            // Бан — добавляем в bannedUsers
            await updateDoc(chatRef, {
              bannedUsers: arrayUnion(targetUid)
            });
            showToast("Пользователь заблокирован", "success");
            break;

          case "unban":
            // Разбан — удаляем из bannedUsers
            await updateDoc(chatRef, {
              bannedUsers: arrayRemove(targetUid)
            });
            showToast("Пользователь разблокирован", "success");
            break;

          case "make-admin":
            // Назначение админом — добавляем в admins
            await updateDoc(chatRef, {
              admins: arrayUnion(targetUid)
            });
            showToast("Пользователь назначен админом", "success");
            break;
        }

        // Обновляем данные чата и переоткрываем панель
        const updatedChat = await getDoc(chatRef);
        state.currentChat = updatedChat.data();
        closeModal();
        openAdminPanel();
      } catch (err) {
        console.error("Ошибка действия админа:", err);
        showToast("Ошибка", "error");
      }
    });
  });
}

// ============================================================
// МОБИЛЬНАЯ НАВИГАЦИЯ
// ============================================================

/**
 * Кнопка "Назад" на мобильных — показывает сайдбар и скрывает чат.
 */
els.btnBackMobile.addEventListener("click", () => {
  els.sidebar.classList.remove("sidebar-hidden");
});

// ============================================================
// ИНИЦИАЛИЗАЦИЯ — проверяем авторизацию при загрузке
// ============================================================
showScreen("loading");
checkAuth();
