import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './supabase-config.js';

const STORAGE_KEY = 'daylight-plans-v1';
const TODO_STORAGE_KEY = 'daylight-todos-v1';
const PENDING_SYNC_KEY = 'daylight-cloud-pending-v1';
const DISPLAY_NAME_KEY = 'daylight-display-name-v1';
const $ = (selector) => document.querySelector(selector);

const elements = {
  todayLabel: $('#today-label'),
  weekday: $('#selected-weekday'),
  date: $('#selected-date'),
  list: $('#agenda-list'),
  count: $('#task-count'),
  progress: $('#progress-fill'),
  progressLabel: $('#progress-label'),
  grid: $('#planner-grid'),
  dateCard: $('#date-card'),
  agendaEyebrow: $('#agenda-eyebrow'),
  agendaTitle: $('#agenda-title'),
  paperNote: $('#paper-note'),
  todoDashboard: $('#todo-dashboard'),
  todoTitle: $('#todo-title'),
  nameDialog: $('#name-dialog'),
  nameForm: $('#name-form'),
  displayNameInput: $('#display-name'),
  saveDisplayName: $('#save-display-name'),
  viewSwitch: $('.view-switch'),
  todoView: $('#todo-view'),
  dailyView: $('#daily-view'),
  weeklyView: $('#weekly-view'),
  welcomeTitle: $('#welcome-title'),
  welcomeCopy: $('.welcome-copy'),
  dialog: $('#plan-dialog'),
  form: $('#plan-form'),
  title: $('#plan-title'),
  time: $('#plan-time'),
  note: $('#toast'),
  backupFile: $('#backup-file'),
  todoForm: $('#todo-form'),
  todoInput: $('#todo-input'),
  todoList: $('#todo-list'),
  todoCount: $('#todo-count'),
  todoEmpty: $('#todo-empty'),
  appShell: $('.app-shell'),
  clipboardMode: $('#clipboard-mode'),
  clipboardTitle: $('#clipboard-title'),
  clipboardDate: $('#clipboard-date'),
  clipboardList: $('#clipboard-list'),
  clipboardCount: $('#clipboard-count'),
  clipboardUndo: $('#clipboard-undo'),
  clipboardUndoCopy: $('#clipboard-undo-copy'),
  undoClipboardCompletion: $('#undo-clipboard-completion'),
  openClipboard: $('#open-clipboard'),
  usernameDisplay: $('#username-display'),
  signInButton: $('#sign-in-button'),
  cloudDialog: $('#cloud-dialog'),
  cloudDialogClose: $('#close-cloud-dialog'),
  cloudExplanation: $('#cloud-explanation'),
  cloudForm: $('#cloud-signin-form'),
  cloudEmail: $('#cloud-email'),
  cloudSubmit: $('#cloud-submit'),
  cloudUsernameForm: $('#cloud-username-form'),
  cloudUsername: $('#cloud-username'),
  cloudUsernameSubmit: $('#cloud-username-submit'),
  cloudSignout: $('#cloud-signout'),
  cloudFeedback: $('#cloud-feedback'),
  todoStorageCopy: $('#todo-storage-copy'),
  plannerStorageCopy: $('#planner-storage-copy'),
};

let selectedDate = new Date();
selectedDate.setHours(0, 0, 0, 0);
let plans = [];
let todos = [];
let activeView = 'todo';
let displayName = '';
let clipboardUndoStack = [];
let clipboardOpeningTimer;
const clipboardPhotoIds = [
  'photo-1498050108023-c5249f4df085',
  'photo-1507842217343-583bb7270b66',
  'photo-1497250681960-ef046c08a56e',
  'photo-1513364776144-60967b0f800f',
  'photo-1500530855697-b586d89ba3ee',
];
let storageReady = true;
let todoStorageReady = true;
let toastTimer;
let cloudClient = null;
let cloudUser = null;
let cloudUsername = null;
let cloudRequestedUsername = null;
let cloudProfileLoaded = false;
let cloudChannel = null;
let cloudReady = false;
let cloudDirty = false;
let applyingCloudData = false;
let cloudRevision = 0;
let cloudSyncQueue = Promise.resolve();

const dateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function validPlans(value) {
  if (!Array.isArray(value)) return false;
  const ids = new Set();
  return value.every((plan) => {
    if (!plan || typeof plan !== 'object' ||
      typeof plan.id !== 'string' || !plan.id ||
      typeof plan.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(plan.date) ||
      typeof plan.title !== 'string' || !plan.title.trim() || plan.title.length > 80 ||
      typeof plan.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(plan.time) ||
      typeof plan.category !== 'string' || typeof plan.done !== 'boolean' ||
      (plan.note !== undefined && (typeof plan.note !== 'string' || plan.note.length > 180)) ||
      ids.has(plan.id)
    ) return false;
    ids.add(plan.id);
    return true;
  });
}

function validTodos(value) {
  if (!Array.isArray(value)) return false;
  const ids = new Set();
  return value.every((todo) => {
    if (!todo || typeof todo !== 'object' ||
      typeof todo.id !== 'string' || !todo.id ||
      typeof todo.title !== 'string' || !todo.title.trim() || todo.title.length > 100 ||
      typeof todo.done !== 'boolean' || ids.has(todo.id)
    ) return false;
    ids.add(todo.id);
    return true;
  });
}

const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

function showToast(message) {
  elements.note.textContent = message;
  elements.note.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => elements.note.classList.remove('is-visible'), 2800);
}

function localStorageKey(key) {
  return cloudUser ? `${key}:${cloudUser.id}` : key;
}

function validDisplayName(value) {
  return /^[a-z0-9_]{3,20}$/i.test(value);
}

function saveDisplayName(value, animate = true) {
  const name = value.trim().replace(/^@/, '');
  if (!validDisplayName(name)) {
    elements.displayNameInput.setCustomValidity('Use 3–20 letters, numbers, or underscores.');
    elements.displayNameInput.reportValidity();
    return false;
  }
  elements.displayNameInput.setCustomValidity('');
  try {
    localStorage.setItem(DISPLAY_NAME_KEY, name);
  } catch (error) {
    console.error('Unable to save the planner display name:', error);
    showToast('Could not save your name on this device. Check available browser storage.');
    return false;
  }
  displayName = name;
  render();
  refreshAccountUI();
  elements.nameDialog.close();
  if (animate) {
    const welcomeRow = document.querySelector('.welcome-row');
    welcomeRow.classList.remove('name-enter');
    void welcomeRow.offsetWidth;
    welcomeRow.classList.add('name-enter');
  }
  return true;
}

function loadPlans(key = localStorageKey(STORAGE_KEY)) {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!validPlans(parsed)) {
      throw new Error('Saved planner data has an unexpected format.');
    }
    return parsed;
  } catch (error) {
    storageReady = false;
    console.error('Unable to load saved plans:', error);
    showToast('Saved plans could not be read. Your existing data has been left untouched.');
    return [];
  }
}

function savePlans() {
  if (!storageReady) {
    showToast('Changes are only temporary because saved data could not be read.');
    return false;
  }
  try {
    localStorage.setItem(localStorageKey(STORAGE_KEY), JSON.stringify(plans));
    scheduleCloudSync();
    return true;
  } catch (error) {
    console.error('Unable to save plans:', error);
    showToast('Could not save your plan on this device. Check available browser storage.');
    return false;
  }
}

function loadTodos(key = localStorageKey(TODO_STORAGE_KEY)) {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!validTodos(parsed)) throw new Error('Saved to-do data has an unexpected format.');
    return parsed;
  } catch (error) {
    todoStorageReady = false;
    console.error('Unable to load saved to-do items:', error);
    showToast('Saved to-do items could not be read. Existing data has been left untouched.');
    return [];
  }
}

function saveTodos() {
  if (!todoStorageReady) {
    showToast('To-do changes are temporary because saved items could not be read.');
    return false;
  }
  try {
    localStorage.setItem(localStorageKey(TODO_STORAGE_KEY), JSON.stringify(todos));
    scheduleCloudSync();
    return true;
  } catch (error) {
    console.error('Unable to save to-do items:', error);
    showToast('Could not save your to-do list on this device. Check available browser storage.');
    return false;
  }
}

function mergeById(remoteItems, localItems) {
  const merged = new Map(remoteItems.map((item) => [item.id, item]));
  for (const item of localItems) merged.set(item.id, item);
  return [...merged.values()];
}

function refreshAccountUI() {
  const shownName = displayName || cloudUsername;
  elements.usernameDisplay.innerHTML = shownName
    ? `<span class="username-label">${escapeHTML(shownName)}</span>`
    : '<span class="username-label">Your name</span>';
  elements.usernameDisplay.setAttribute('aria-label', shownName
    ? `Planner name: ${shownName}`
    : 'Set your planner name');
  elements.signInButton.textContent = cloudUser ? 'Sign out' : 'Sign in';
  elements.signInButton.setAttribute('aria-label', cloudUser ? 'Sign out' : 'Sign in');
  elements.cloudForm.hidden = Boolean(cloudUser);
  elements.cloudUsernameForm.hidden = !cloudUser || !cloudProfileLoaded || Boolean(cloudUsername);
  elements.cloudSignout.hidden = !cloudUser;
  elements.cloudDialogClose.hidden = Boolean(cloudUser && cloudProfileLoaded && !cloudUsername);
  elements.cloudUsername.value = cloudUsername || cloudRequestedUsername || '';
  const ownerLabel = displayName ? `${displayName}’s` : 'Your';
  const storageCopy = cloudUsername
    ? `${ownerLabel} plans and to-dos sync across devices.`
    : cloudUser && cloudProfileLoaded && !cloudUsername
      ? 'Choose your username to finish setting up account sync.'
      : cloudUser
        ? 'Connecting to your private account planner…'
      : `${ownerLabel} plans and to-dos are saved on this device until signing in.`;
  elements.todoStorageCopy.textContent = storageCopy;
  elements.plannerStorageCopy.textContent = storageCopy;
  elements.cloudExplanation.textContent = cloudUser
    ? cloudUsername
      ? `Signed in as @${cloudUsername}. The planner is private to this account and syncs across devices.`
      : cloudProfileLoaded
        ? 'Choose a unique account username to finish setting up sync.'
        : 'Loading the private account planner…'
    : 'Sign in with an email link to sync this planner across devices.';
}

function openAccountDialog() {
  refreshAccountUI();
  elements.cloudFeedback.textContent = '';
  elements.cloudDialog.showModal();
  if (cloudUser && !cloudReady) handleCloudSession(cloudUser);
  if (cloudUser && cloudProfileLoaded && !cloudUsername) elements.cloudUsername.focus();
  else if (!cloudUser) elements.cloudEmail.focus();
}

function openNameDialog() {
  elements.displayNameInput.value = displayName;
  elements.displayNameInput.setCustomValidity('');
  elements.nameDialog.showModal();
  elements.displayNameInput.focus();
}

function pendingSyncKey(userId) {
  return `${PENDING_SYNC_KEY}:${userId}`;
}

function scheduleCloudSync() {
  if (!cloudClient || !cloudUser || applyingCloudData) return;
  cloudDirty = true;
  const userId = cloudUser.id;
  const pendingKey = pendingSyncKey(userId);
  try {
    localStorage.setItem(pendingKey, 'true');
  } catch (error) {
    console.error('Unable to record pending cloud sync:', error);
    showToast('Saved on this device, but cloud retry could not be recorded.');
  }
  if (!cloudReady) return;
  if (!cloudUsername) {
    return;
  }
  const revision = ++cloudRevision;
  const snapshot = {
    user_id: userId,
    plans: JSON.parse(JSON.stringify(plans)),
    todos: JSON.parse(JSON.stringify(todos)),
    updated_at: new Date().toISOString(),
  };
  cloudSyncQueue = cloudSyncQueue
    .catch(() => {})
    .then(async () => {
      if (cloudUser?.id !== userId) return;
      const { error } = await cloudClient
        .from('planner_data')
        .upsert(snapshot, { onConflict: 'user_id' });
      if (error) throw error;
      if (revision !== cloudRevision) return;
      cloudDirty = false;
      try {
        localStorage.removeItem(pendingKey);
      } catch (error) {
        console.error('Unable to clear pending cloud sync:', error);
      }
      if (elements.cloudDialog.open) {
        elements.cloudFeedback.textContent = 'Your planner is up to date across your devices.';
      }
    })
    .catch((error) => {
      console.error('Cloud sync failed:', error);
      if (cloudUser?.id === userId) {
        showToast(`Saved on this device, but cloud sync failed: ${error.message || 'Check your connection.'}`);
      }
    });
}

function applyCloudRow(row) {
  if (!row || row.user_id !== cloudUser?.id) return;
  if (!validPlans(row.plans) || !validTodos(row.todos)) {
    const error = new Error('The saved planner data has an unexpected format.');
    console.error('Unable to apply cloud planner data:', error);
    showToast('Cloud data could not be read. Your device copy was left unchanged.');
    return;
  }
  if (JSON.stringify(row.plans) === JSON.stringify(plans) &&
    JSON.stringify(row.todos) === JSON.stringify(todos)
  ) return;
  const hadLocalChanges = cloudDirty;
  applyingCloudData = true;
  plans = hadLocalChanges ? mergeById(row.plans, plans) : row.plans;
  todos = hadLocalChanges ? mergeById(row.todos, todos) : row.todos;
  savePlans();
  saveTodos();
  renderPlans();
  renderTodos();
  if (!elements.clipboardMode.hidden) renderClipboard();
  applyingCloudData = false;
  if (hadLocalChanges) scheduleCloudSync();
}

function subscribeToCloud(userId) {
  if (cloudChannel) cloudClient.removeChannel(cloudChannel);
  cloudChannel = cloudClient
    .channel(`planner-data-${userId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'planner_data',
      filter: `user_id=eq.${userId}`,
    }, (payload) => {
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') applyCloudRow(payload.new);
    })
    .subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('Cloud live updates could not connect:', error);
        showToast('Live updates are paused. Your changes remain saved on this device.');
      }
    });
}

async function loadCloudAccount(user, version) {
  storageReady = true;
  todoStorageReady = true;
  const guestPlans = cloudUser ? [] : plans;
  const guestTodos = cloudUser ? [] : todos;
  const accountPlans = loadPlans(`${STORAGE_KEY}:${user.id}`);
  const accountTodos = loadTodos(`${TODO_STORAGE_KEY}:${user.id}`);
  const pendingKey = pendingSyncKey(user.id);
  const hasPendingChanges = localStorage.getItem(pendingKey) === 'true';
  cloudUser = user;
  cloudUsername = null;
  cloudRequestedUsername = null;
  cloudProfileLoaded = false;
  cloudReady = false;
  cloudDirty = false;
  plans = accountPlans;
  todos = accountTodos;
  render();
  renderTodos();

  const [plannerResult, profileResult] = await Promise.all([
    cloudClient
      .from('planner_data')
      .select('user_id, plans, todos')
      .eq('user_id', user.id)
      .maybeSingle(),
    cloudClient
      .from('planner_profiles')
      .select('username')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);
  if (plannerResult.error) throw plannerResult.error;
  if (profileResult.error) throw profileResult.error;
  const remotePlanner = plannerResult.data;
  let profile = profileResult.data;
  if (version !== cloudSessionVersion) return;
  const hasLocalEdits = cloudDirty || localStorage.getItem(pendingKey) === 'true';
  const localPlans = cloudDirty ? plans : accountPlans;
  const localTodos = cloudDirty ? todos : accountTodos;
  if (remotePlanner && (!validPlans(remotePlanner.plans) || !validTodos(remotePlanner.todos))) {
    throw new Error('The saved planner data has an unexpected format.');
  }
  const requestedUsername = user.user_metadata?.username;
  if (!profile && typeof requestedUsername === 'string' && /^[a-z0-9_]{3,20}$/.test(requestedUsername)) {
    const { data, error } = await cloudClient
      .from('planner_profiles')
      .insert({
        user_id: user.id,
        username: requestedUsername,
        updated_at: new Date().toISOString(),
      })
      .select('username')
      .single();
    if (error?.code === '23505') {
      cloudRequestedUsername = requestedUsername;
    } else if (error) {
      throw error;
    } else {
      profile = data;
    }
    if (!displayName) saveDisplayName(requestedUsername, false);
  }
  if (version !== cloudSessionVersion) return;
  if (profile && (typeof profile.username !== 'string' || !/^[a-z0-9_]{3,20}$/.test(profile.username))) {
    throw new Error('The account username has an unexpected format.');
  }

  cloudProfileLoaded = true;
  cloudUsername = profile?.username || null;
  if (cloudUsername) cloudRequestedUsername = null;
  if (!displayName && cloudUsername) saveDisplayName(cloudUsername, false);
  let shouldSync = false;
  if (remotePlanner) {
    plans = hasPendingChanges || hasLocalEdits
      ? mergeById(remotePlanner.plans, localPlans)
      : remotePlanner.plans;
    todos = hasPendingChanges || hasLocalEdits
      ? mergeById(remotePlanner.todos, localTodos)
      : remotePlanner.todos;
    shouldSync = hasPendingChanges || hasLocalEdits;
  } else if (localPlans.length || localTodos.length) {
    plans = localPlans;
    todos = localTodos;
    shouldSync = true;
  } else if (guestPlans.length || guestTodos.length) {
    const importGuestData = window.confirm(
      'This account has no saved planner yet. Import the plans and to-dos already on this device?',
    );
    plans = importGuestData ? guestPlans : [];
    todos = importGuestData ? guestTodos : [];
    shouldSync = importGuestData;
  }

  applyingCloudData = true;
  savePlans();
  saveTodos();
  applyingCloudData = false;
  cloudReady = true;
  render();
  renderTodos();
  subscribeToCloud(user.id);
  refreshAccountUI();
  if (shouldSync) scheduleCloudSync();
  if (!cloudUsername) {
    if (elements.nameDialog.open) elements.nameDialog.close();
    if (!elements.cloudDialog.open) elements.cloudDialog.showModal();
    elements.cloudUsername.focus();
    elements.cloudFeedback.textContent = cloudRequestedUsername
      ? 'That username is already taken. Choose another one to finish creating your account.'
      : 'Choose a unique username before using your account.';
  } else if (elements.cloudDialog.open) {
    elements.cloudDialog.close();
  }
}

let cloudSessionVersion = 0;
let cloudLoadingUserId = null;
let cloudLoadPromise = null;

function handleCloudSession(user) {
  if (!user) {
    cloudSessionVersion += 1;
    cloudRevision += 1;
    cloudLoadingUserId = null;
    cloudLoadPromise = null;
    if (cloudChannel && cloudClient) cloudClient.removeChannel(cloudChannel);
    cloudChannel = null;
    cloudUser = null;
    cloudUsername = null;
    cloudRequestedUsername = null;
    cloudProfileLoaded = false;
    cloudReady = false;
    cloudDirty = false;
    storageReady = true;
    todoStorageReady = true;
    plans = loadPlans(STORAGE_KEY);
    todos = loadTodos(TODO_STORAGE_KEY);
    render();
    renderTodos();
    refreshAccountUI();
    if (elements.cloudDialog.open) elements.cloudDialog.close();
    return Promise.resolve();
  }
  if (cloudUser?.id === user.id && cloudReady) return Promise.resolve();
  if (cloudLoadingUserId === user.id) return cloudLoadPromise;

  if (cloudUser?.id !== user.id) cloudRevision += 1;
  const version = ++cloudSessionVersion;
  cloudLoadingUserId = user.id;
  cloudLoadPromise = loadCloudAccount(user, version)
    .then(() => {
      if (version !== cloudSessionVersion) return;
    })
    .catch((error) => {
      if (version !== cloudSessionVersion) return;
      console.error('Unable to load the account planner:', error);
      cloudReady = false;
      refreshAccountUI();
      elements.cloudFeedback.textContent =
        `Your account data could not be loaded: ${error.message || 'Check your connection and try again.'}`;
      showToast('Could not load your account data. Saved cloud data was not overwritten.');
    })
    .finally(() => {
      if (version === cloudSessionVersion) {
        cloudLoadingUserId = null;
        cloudLoadPromise = null;
      }
    });
  return cloudLoadPromise;
}

async function initializeCloud() {
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    cloudClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    const { data, error } = await cloudClient.auth.getSession();
    if (error) throw error;
    cloudClient.auth.onAuthStateChange((event, session) => {
      window.setTimeout(() => {
        if (event === 'SIGNED_OUT' || !session?.user) {
          handleCloudSession(null);
        } else {
          handleCloudSession(session.user);
        }
      }, 0);
    });
    await handleCloudSession(data.session?.user || null);
  } catch (error) {
    console.error('Unable to initialize account sign-in:', error);
    elements.cloudFeedback.textContent =
      `Sign-in could not start: ${error.message || 'Check the account setup and connection.'}`;
  }
}

function exportBackup() {
  if (!storageReady || !todoStorageReady) {
    showToast('A backup is unavailable because saved planner data could not be read.');
    return;
  }
  try {
    const backup = {
      format: 'daylight-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      plans,
      todos,
    };
    const file = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `daylight-backup-${dateKey(new Date())}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Your backup has been downloaded.');
  } catch (error) {
    console.error('Unable to create backup:', error);
    showToast('Could not create a backup on this device.');
  }
}

async function restoreBackup(file) {
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    if (backup?.format !== 'daylight-backup' || backup.version !== 1 ||
      !validPlans(backup.plans) ||
      (backup.todos !== undefined && !validTodos(backup.todos))
    ) {
      throw new Error('The selected file is not a valid Daylight backup.');
    }
    if (!window.confirm('Restoring this backup replaces the plans and to-do list saved on this device. Continue?')) return;
    const previousPlans = plans;
    const previousTodos = todos;
    plans = backup.plans;
    todos = backup.todos || [];
    if (!savePlans() || !saveTodos()) {
      plans = previousPlans;
      todos = previousTodos;
      savePlans();
      saveTodos();
      return;
    }
    renderPlans();
    renderTodos();
    showToast('Your backup has been restored.');
  } catch (error) {
    console.error('Unable to restore backup:', error);
    showToast('That backup could not be read. Your current plans are unchanged.');
  } finally {
    elements.backupFile.value = '';
  }
}

function renderDate() {
  if (activeView === 'daily') {
    elements.weekday.textContent = selectedDate.toLocaleDateString(undefined, { weekday: 'long' });
    elements.date.textContent = selectedDate.toLocaleDateString(undefined, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    elements.todayLabel.textContent = dateKey(selectedDate) === dateKey(new Date())
      ? 'A NEW DAY, A NEW PAGE'
      : selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();
    return;
  }

  const start = weekStart(selectedDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  elements.weekday.textContent = 'WEEK OF';
  const sameMonth = start.getMonth() === end.getMonth();
  const startMonth = start.toLocaleDateString(undefined, { month: 'short' });
  const endMonth = end.toLocaleDateString(undefined, { month: 'short' });
  const startDay = start.toLocaleDateString(undefined, { day: 'numeric' });
  const endDay = end.toLocaleDateString(undefined, { day: 'numeric' });
  const year = end.toLocaleDateString(undefined, { year: 'numeric' });
  const range = sameMonth
    ? `${startMonth} ${startDay}–${endDay}, ${year}`
    : `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${year}`;
  elements.date.textContent = range;
  const currentWeek = weekStart(new Date()).getTime() === start.getTime();
  elements.todayLabel.textContent = currentWeek
    ? 'A NEW WEEK, A NEW PAGE'
    : range.toUpperCase();
}

function weekStart(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const daysSinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday);
  return start;
}

function renderPlans() {
  if (activeView === 'daily') {
    renderDailyPlans();
    return;
  }

  renderWeeklyPlans();
}

function renderTodos() {
  const remaining = todos.filter((todo) => !todo.done).length;
  elements.todoCount.textContent = `${remaining} left`;
  elements.todoEmpty.hidden = todos.length > 0;
  elements.todoList.innerHTML = todos.map((todo) => `
    <li class="todo-item${todo.done ? ' is-done' : ''}">
      <label class="todo-check-row">
        <input type="checkbox" data-todo-toggle="${escapeHTML(todo.id)}" ${todo.done ? 'checked' : ''}>
        <span class="custom-check" aria-hidden="true">${todo.done ? '✓' : ''}</span>
        <span class="todo-title">${escapeHTML(todo.title)}</span>
      </label>
      <button class="todo-delete" type="button" data-todo-delete="${escapeHTML(todo.id)}" aria-label="Remove to-do: ${escapeHTML(todo.title)}">×</button>
    </li>
  `).join('');
}

function clipboardPhotoFor(todo, index) {
  const title = todo.title.toLowerCase();
  const photoIndex = /read|book|study|learn|class|exam/.test(title)
    ? 1
    : /plant|garden|walk|outside|nature|water/.test(title)
      ? 2
      : /draw|paint|design|art|create|craft/.test(title)
        ? 3
        : /run|exercise|travel|trip|outside|picnic/.test(title)
          ? 4
          : index % clipboardPhotoIds.length;
  return `https://images.unsplash.com/${clipboardPhotoIds[photoIndex]}?auto=format&fit=crop&w=720&q=80`;
}

function renderClipboard({ returningIds = [] } = {}) {
  const remainingTodos = todos.filter((todo) => !todo.done);
  const existingCardIds = new Set(
    [...elements.clipboardList.querySelectorAll('[data-clipboard-card]')]
      .map((card) => card.dataset.clipboardCard),
  );
  const returningCardIds = new Set(returningIds);
  elements.clipboardCount.textContent = String(remainingTodos.length);
  const owner = displayName ? `${escapeHTML(displayName)}’s` : 'My';
  elements.clipboardTitle.innerHTML = `${owner} Clipboard <span aria-hidden="true">♡</span>`;
  elements.clipboardMode.setAttribute('aria-label', `${displayName ? `${displayName}’s` : 'Your'} to-do clipboard`);
  elements.clipboardDate.textContent = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());
  elements.clipboardList.innerHTML = remainingTodos.length
    ? remainingTodos.map((todo, index) => {
      const description = typeof todo.description === 'string' ? todo.description.trim() : '';
      const dueDate = typeof todo.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(todo.dueDate)
        ? new Date(`${todo.dueDate}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : '';
      const cardAnimation = returningCardIds.has(todo.id)
        ? 'is-returning'
        : !existingCardIds.has(todo.id) && !elements.clipboardMode.hidden
          ? 'is-arriving'
          : '';
      return `
        <article class="clipboard-task-card${cardAnimation ? ` ${cardAnimation}` : ''}${index === 0 ? ' is-newest' : ''}" data-clipboard-card="${escapeHTML(todo.id)}" style="--card-index:${index}">
          <span class="clipboard-pushpin" aria-hidden="true"></span>
          <div class="clipboard-photo">
            <img src="${clipboardPhotoFor(todo, index)}" alt="" loading="${index < 3 ? 'eager' : 'lazy'}" referrerpolicy="no-referrer">
            <span class="clipboard-photo-gloss" aria-hidden="true"></span>
          </div>
          <div class="clipboard-task-copy">
            <label class="clipboard-check-label">
              <input type="checkbox" data-clipboard-toggle="${escapeHTML(todo.id)}" aria-label="Complete ${escapeHTML(todo.title)}">
              <span class="clipboard-check" aria-hidden="true"></span>
              <span class="clipboard-task-title">${escapeHTML(todo.title)}</span>
            </label>
            ${description ? `<p class="clipboard-task-description">${escapeHTML(description)}</p>` : ''}
            ${dueDate ? `<time class="clipboard-due-date" datetime="${escapeHTML(todo.dueDate)}">By ${escapeHTML(dueDate)}</time>` : ''}
          </div>
        </article>`;
    }).join('')
    : `<div class="clipboard-empty">
        <span aria-hidden="true">✿</span>
        <h2>All the little things are done.</h2>
        <p>Take a breath. You’ve made room for something lovely.</p>
      </div>`;
  renderClipboardUndo();
}

function renderClipboardUndo() {
  const lastUndo = clipboardUndoStack[clipboardUndoStack.length - 1];
  elements.clipboardUndo.hidden = !lastUndo;
  elements.clipboardUndoCopy.textContent = lastUndo
    ? `Finished “${lastUndo.title}”.`
    : '';
  elements.undoClipboardCompletion.textContent = clipboardUndoStack.length > 1
    ? `Undo (${clipboardUndoStack.length})`
    : 'Undo';
}

function openClipboardMode() {
  window.clearTimeout(clipboardOpeningTimer);
  if (activeView !== 'todo') {
    activeView = 'todo';
    render();
  }
  renderClipboard();
  elements.clipboardMode.hidden = false;
  elements.clipboardMode.classList.add('is-opening');
  elements.clipboardMode.setAttribute('aria-hidden', 'false');
  elements.appShell.inert = true;
  elements.appShell.setAttribute('aria-hidden', 'true');
  document.body.classList.add('clipboard-open');
  elements.clipboardTitle.focus();
  clipboardOpeningTimer = window.setTimeout(() => {
    elements.clipboardMode.classList.remove('is-opening');
  }, 1200);
}

function closeClipboardMode() {
  window.clearTimeout(clipboardOpeningTimer);
  elements.clipboardMode.classList.remove('is-opening');
  elements.clipboardMode.hidden = true;
  elements.clipboardMode.setAttribute('aria-hidden', 'true');
  elements.appShell.inert = false;
  elements.appShell.removeAttribute('aria-hidden');
  document.body.classList.remove('clipboard-open');
  elements.openClipboard.focus();
}

function completeClipboardTodo(id) {
  const todo = todos.find((item) => item.id === id);
  const card = [...elements.clipboardList.querySelectorAll('[data-clipboard-card]')]
    .find((item) => item.dataset.clipboardCard === id);
  if (!todo || todo.done || !card) return;
  todo.done = true;
  clipboardUndoStack.push({ id: todo.id, title: todo.title });
  if (!saveTodos()) {
    todo.done = false;
    clipboardUndoStack.pop();
    return;
  }
  renderTodos();
  elements.clipboardCount.textContent = String(todos.filter((item) => !item.done).length);
  renderClipboardUndo();
  card.classList.add('is-falling');
  window.setTimeout(() => {
    if (!elements.clipboardMode.hidden) renderClipboard();
  }, 620);
}

function undoClipboardCompletion() {
  const previous = clipboardUndoStack.pop();
  if (!previous) return;
  const todo = todos.find((item) => item.id === previous.id);
  if (todo) {
    todo.done = false;
    if (!saveTodos()) {
      todo.done = true;
      clipboardUndoStack.push(previous);
      renderClipboardUndo();
      return;
    }
    renderTodos();
  }
  renderClipboard({ returningIds: [previous.id] });
}

function renderDailyPlans() {
  const dayPlans = plans
    .filter((plan) => plan.date === dateKey(selectedDate))
    .sort((first, second) => first.time.localeCompare(second.time));

  elements.count.textContent = `${dayPlans.length} ${dayPlans.length === 1 ? 'plan' : 'plans'}`;
  const doneCount = dayPlans.filter((plan) => plan.done).length;
  const progress = dayPlans.length ? Math.round((doneCount / dayPlans.length) * 100) : 0;
  elements.progress.style.width = `${progress}%`;
  elements.progressLabel.textContent = dayPlans.length
    ? doneCount === dayPlans.length ? 'All done, lovely' : `${doneCount} of ${dayPlans.length} done`
    : 'A fresh start';
  elements.paperNote.hidden = dayPlans.length === 0;
  elements.list.innerHTML = dayPlans.length
    ? dayPlans.map((plan) => {
      const timeLabel = new Date(`2000-01-01T${plan.time}`).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      });
      return `
        <article class="daily-plan${plan.done ? ' is-done' : ''}">
          <time class="daily-time" datetime="${escapeHTML(plan.time)}">${escapeHTML(timeLabel)}</time>
          <span class="daily-thread" aria-hidden="true"><span>${plan.done ? '✓' : '✿'}</span></span>
          <div class="daily-plan-card">
            <div class="daily-plan-heading">
              <h3 class="item-title">${escapeHTML(plan.title)}</h3>
              <span class="item-category">${escapeHTML(plan.category)}</span>
            </div>
            ${plan.note ? `<p class="item-note">${escapeHTML(plan.note)}</p>` : ''}
          </div>
          <button class="check-button" type="button" data-toggle="${escapeHTML(plan.id)}"
            aria-label="${plan.done ? 'Mark incomplete' : 'Mark complete'}: ${escapeHTML(plan.title)}"
            aria-pressed="${plan.done}">${plan.done ? '✓' : ''}</button>
        </article>`;
    }).join('')
    : `<div class="daily-empty">
        <span class="empty-doodle" aria-hidden="true">☼</span>
        <h3>A little room to begin</h3>
        <p>Add one thing you’d like to make time for today.</p>
        <button class="text-button" type="button" data-add-selected>＋ Add your first plan</button>
      </div>`;
}

function renderWeeklyPlans() {
  const start = weekStart(selectedDate);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
  const weekPlans = plans.filter((plan) => {
    const planDate = new Date(`${plan.date}T00:00:00`);
    return planDate >= start && planDate < new Date(start.getTime() + 7 * 86400000);
  });

  elements.count.textContent = `${weekPlans.length} ${weekPlans.length === 1 ? 'plan' : 'plans'}`;
  const doneCount = weekPlans.filter((plan) => plan.done).length;
  const progress = weekPlans.length ? Math.round((doneCount / weekPlans.length) * 100) : 0;
  elements.progress.style.width = `${progress}%`;
  elements.progressLabel.textContent = weekPlans.length
    ? doneCount === weekPlans.length ? 'All done, lovely' : `${doneCount} of ${weekPlans.length} done`
    : 'One step at a time';
  elements.list.innerHTML = days.map((date) => {
    const key = dateKey(date);
    const dayPlans = weekPlans
      .filter((plan) => plan.date === key)
      .sort((first, second) => first.time.localeCompare(second.time));
    const isToday = key === dateKey(new Date());
    const entries = dayPlans.length
      ? dayPlans.map((plan) => {
        const timeLabel = new Date(`2000-01-01T${plan.time}`).toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
        });
        return `
          <div class="week-plan${plan.done ? ' is-done' : ''}">
            <time class="item-time" datetime="${escapeHTML(plan.time)}">${escapeHTML(timeLabel)}</time>
            <span class="plan-bullet" aria-hidden="true">${plan.done ? '✓' : '✿'}</span>
            <div class="week-plan-copy">
              <h3 class="item-title">${escapeHTML(plan.title)}</h3>
              ${plan.note ? `<p class="item-note">${escapeHTML(plan.note)}</p>` : ''}
            </div>
            <span class="item-category">${escapeHTML(plan.category)}</span>
            <button class="check-button" type="button" data-toggle="${escapeHTML(plan.id)}"
              aria-label="${plan.done ? 'Mark incomplete' : 'Mark complete'}: ${escapeHTML(plan.title)}"
              aria-pressed="${plan.done}">${plan.done ? '✓' : ''}</button>
          </div>`;
      }).join('')
      : '<span class="day-breathing-room">a little room to breathe</span>';
    return `
      <section class="week-day${isToday ? ' is-today' : ''}">
        <div class="week-day-label">
          <span class="day-name">${escapeHTML(date.toLocaleDateString(undefined, { weekday: 'short' }))}</span>
          <span class="day-number">${escapeHTML(date.toLocaleDateString(undefined, { day: 'numeric' }))}</span>
        </div>
        <div class="week-day-plans">${entries}</div>
        <button class="day-add" type="button" data-add-date="${key}" aria-label="Add a plan for ${escapeHTML(date.toLocaleDateString(undefined, { weekday: 'long' }))}">＋</button>
      </section>`;
  }).join('');
}

function render() {
  const isTodo = activeView === 'todo';
  const isDaily = activeView === 'daily';
  elements.viewSwitch.dataset.view = activeView;
  elements.todoView.classList.toggle('is-active', isTodo);
  elements.todoView.setAttribute('aria-pressed', String(isTodo));
  elements.dailyView.classList.toggle('is-active', isDaily);
  elements.dailyView.setAttribute('aria-pressed', String(isDaily));
  elements.weeklyView.classList.toggle('is-active', activeView === 'weekly');
  elements.weeklyView.setAttribute('aria-pressed', String(activeView === 'weekly'));
  elements.todoDashboard.hidden = !isTodo;
  elements.grid.hidden = isTodo;
  $('#add-plan').hidden = isTodo;
  const owner = displayName
    ? `<span class="personal-name">${escapeHTML(displayName)}’s</span>`
    : 'Your';
  elements.welcomeTitle.innerHTML = isTodo
    ? `${owner} little list, <em>at a gentle pace.</em>`
    : isDaily ? `${owner} day, <em>at a glance.</em>` : `${owner} week, <em>gently.</em>`;
  elements.welcomeCopy.textContent = isTodo
    ? displayName
      ? `A soft place to gather what matters to ${displayName}.`
      : 'A soft place to gather all the things on your mind.'
    : isDaily
      ? displayName ? `A little space for ${displayName}’s plans today.` : 'A little space for everything on your mind.'
      : displayName ? `Little plans for ${displayName}, with room to breathe.` : 'Little plans, soft reminders, room to breathe.';
  elements.todoTitle.innerHTML = `${owner} to-do list <span aria-hidden="true">✳</span>`;
  elements.todoDashboard.setAttribute('aria-label', displayName ? `${displayName}’s to-do dashboard` : 'Your to-do dashboard');
  document.querySelectorAll('.daily-reminder').forEach((reminder) => {
    reminder.textContent = displayName
      ? `No need to do it all, ${displayName}. Just the next little thing.`
      : 'You don’t have to do it all. Just the next little thing.';
  });
  document.querySelectorAll('.quote-card .priority-line').forEach((priority) => {
    priority.innerHTML = displayName
      ? `<span>♡</span> Be kind to ${escapeHTML(displayName)} today`
      : '<span>♡</span> Be kind to yourself today';
  });
  const firstPriority = $('.priority-card .priority-line');
  if (firstPriority) {
    firstPriority.innerHTML = displayName
      ? `<span>01</span> Make time for ${escapeHTML(displayName)}`
      : '<span>01</span> Make time for yourself';
  }
  document.querySelectorAll('.todo-tools .note-footer').forEach((footer) => {
    footer.innerHTML = displayName
      ? `<span class="privacy-dot"></span> Just for ${escapeHTML(displayName)}, always`
      : '<span class="privacy-dot"></span> Just yours, always';
  });
  $('#plan-title-label').textContent = displayName ? `What’s on ${displayName}’s mind?` : 'What’s on your mind?';
  $('.footer').innerHTML = displayName
    ? `Made for ${escapeHTML(displayName)}’s days, just as they are <span aria-hidden="true">♡</span>`
    : 'Made for your days, just as they are <span aria-hidden="true">♡</span>';
  if (isTodo) {
    elements.todayLabel.textContent = 'A LITTLE SPACE FOR WHAT MATTERS';
    elements.grid.setAttribute('aria-label', displayName ? `${displayName}’s planner` : 'Your planner');
    renderTodos();
    return;
  }
  elements.grid.classList.toggle('daily-mode', isDaily);
  elements.grid.classList.toggle('weekly-mode', !isDaily);
  elements.grid.setAttribute(
    'aria-label',
    displayName
      ? `${displayName}’s ${isDaily ? 'daily' : 'weekly'} planner`
      : isDaily ? 'Your daily planner' : 'Your weekly planner',
  );
  elements.dateCard.setAttribute('aria-label', isDaily ? 'Choose a day' : 'Choose a week');
  elements.agendaEyebrow.textContent = isDaily ? 'A LITTLE PLAN FOR TODAY' : 'A FRESH PAGE';
  elements.agendaTitle.textContent = isDaily ? 'Today, at a glance' : 'The week, at a glance';
  $('#previous-day').setAttribute('aria-label', isDaily ? 'Previous day' : 'Previous week');
  $('#next-day').setAttribute('aria-label', isDaily ? 'Next day' : 'Next week');
  $('#go-today').textContent = isDaily ? 'Today' : 'This week';
  elements.paperNote.hidden = isDaily && !plans.some((plan) => plan.date === dateKey(selectedDate));
  renderDate();
  renderPlans();
}

function openDialog() {
  elements.form.reset();
  elements.time.value = '09:00';
  elements.dialog.showModal();
  elements.title.focus();
}

$('#previous-day').addEventListener('click', () => {
  selectedDate.setDate(selectedDate.getDate() + (activeView === 'daily' ? -1 : -7));
  render();
});

$('#next-day').addEventListener('click', () => {
  selectedDate.setDate(selectedDate.getDate() + (activeView === 'daily' ? 1 : 7));
  render();
});

$('#go-today').addEventListener('click', () => {
  selectedDate = new Date();
  selectedDate.setHours(0, 0, 0, 0);
  render();
});

elements.dailyView.addEventListener('click', () => {
  activeView = 'daily';
  render();
});

elements.weeklyView.addEventListener('click', () => {
  activeView = 'weekly';
  render();
});

elements.todoView.addEventListener('click', () => {
  activeView = 'todo';
  render();
});

$('#add-plan').addEventListener('click', openDialog);
$('#close-dialog').addEventListener('click', () => elements.dialog.close());
$('#export-backup').addEventListener('click', exportBackup);
$('#restore-backup').addEventListener('click', () => elements.backupFile.click());
elements.backupFile.addEventListener('change', () => restoreBackup(elements.backupFile.files[0]));
elements.usernameDisplay.addEventListener('click', openNameDialog);
elements.nameForm.addEventListener('submit', (event) => {
  event.preventDefault();
  saveDisplayName(elements.displayNameInput.value);
});
elements.nameDialog.addEventListener('cancel', (event) => {
  if (!displayName) event.preventDefault();
});
elements.signInButton.addEventListener('click', async () => {
  if (!cloudUser) {
    if (!displayName) openNameDialog();
    else openAccountDialog();
    return;
  }
  elements.signInButton.disabled = true;
  try {
    const { error } = await cloudClient.auth.signOut();
    if (error) throw error;
  } catch (error) {
    console.error('Unable to sign out:', error);
    elements.cloudFeedback.textContent = `Could not sign out: ${error.message || 'Try again.'}`;
    openAccountDialog();
  } finally {
    elements.signInButton.disabled = false;
  }
});
$('#close-cloud-dialog').addEventListener('click', () => elements.cloudDialog.close());
elements.cloudDialog.addEventListener('cancel', (event) => {
  if (cloudUser && !cloudUsername) event.preventDefault();
});
elements.cloudDialog.addEventListener('click', (event) => {
  if (event.target === elements.cloudDialog) elements.cloudDialog.close();
});

elements.cloudForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!cloudClient) {
    elements.cloudFeedback.textContent = 'Sign-in is still connecting. Please try again in a moment.';
    return;
  }
  if (!displayName || !validDisplayName(displayName)) {
    elements.cloudFeedback.textContent = 'Set your planner name before signing in.';
    openNameDialog();
    return;
  }
  const email = elements.cloudEmail.value.trim();
  elements.cloudSubmit.disabled = true;
  elements.cloudFeedback.textContent = 'Sending your sign-in link…';
  try {
    const { error } = await cloudClient.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${location.origin}${location.pathname}`,
        data: { username: displayName.toLowerCase() },
      },
    });
    if (error) throw error;
    elements.cloudFeedback.textContent = 'Check your email and open the sign-in link on this device.';
  } catch (error) {
    console.error('Unable to request a sign-in link:', error);
    elements.cloudFeedback.textContent =
      `Could not send the sign-in link: ${error.message || 'Check your email and try again.'}`;
  } finally {
    elements.cloudSubmit.disabled = false;
  }
});

elements.cloudUsernameForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!cloudClient || !cloudUser || !cloudProfileLoaded) {
    elements.cloudFeedback.textContent = 'Sign in before choosing a username.';
    return;
  }
  const username = elements.cloudUsername.value.trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    elements.cloudFeedback.textContent = 'Use 3–20 letters, numbers, or underscores.';
    elements.cloudUsername.focus();
    return;
  }

  elements.cloudUsernameSubmit.disabled = true;
  elements.cloudFeedback.textContent = 'Saving your username…';
  try {
    const { error } = await cloudClient
      .from('planner_profiles')
      .upsert({
        user_id: cloudUser.id,
        username,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    if (error?.code === '23505') throw new Error('That username is already taken. Try another one.');
    if (error) throw error;
    cloudUsername = username;
    cloudRequestedUsername = null;
    if (!displayName) saveDisplayName(username, false);
    refreshAccountUI();
    elements.cloudFeedback.textContent = `Your account is ready as @${username}.`;
    if (cloudDirty) scheduleCloudSync();
  } catch (error) {
    console.error('Unable to save the account username:', error);
    elements.cloudFeedback.textContent =
      `Could not save your username: ${error.message || 'Check your connection and try again.'}`;
  } finally {
    elements.cloudUsernameSubmit.disabled = false;
  }
});

elements.cloudSignout.addEventListener('click', async () => {
  if (!cloudClient) return;
  elements.cloudSignout.disabled = true;
  try {
    const { error } = await cloudClient.auth.signOut();
    if (error) throw error;
  } catch (error) {
    console.error('Unable to sign out:', error);
    elements.cloudFeedback.textContent = `Could not sign out: ${error.message || 'Try again.'}`;
  } finally {
    elements.cloudSignout.disabled = false;
  }
});

window.addEventListener('online', () => {
  if (cloudUser && !cloudReady) handleCloudSession(cloudUser);
  else if (cloudDirty) scheduleCloudSync();
});

elements.todoForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const title = elements.todoInput.value.trim();
  if (!title) {
    elements.todoInput.focus();
    return;
  }
  todos.unshift({
    id: globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `todo-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title,
    done: false,
  });
  saveTodos();
  renderTodos();
  elements.todoForm.reset();
  elements.todoInput.focus();
});

elements.todoList.addEventListener('change', (event) => {
  const checkbox = event.target.closest('[data-todo-toggle]');
  if (!checkbox) return;
  const todo = todos.find((item) => item.id === checkbox.dataset.todoToggle);
  if (!todo) return;
  todo.done = checkbox.checked;
  saveTodos();
  renderTodos();
});

elements.todoList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-todo-delete]');
  if (!button) return;
  todos = todos.filter((todo) => todo.id !== button.dataset.todoDelete);
  saveTodos();
  renderTodos();
});

elements.openClipboard.addEventListener('click', openClipboardMode);
$('#close-clipboard').addEventListener('click', closeClipboardMode);
$('#back-to-tasks').addEventListener('click', closeClipboardMode);
elements.clipboardList.addEventListener('change', (event) => {
  const checkbox = event.target.closest('[data-clipboard-toggle]');
  if (checkbox?.checked) completeClipboardTodo(checkbox.dataset.clipboardToggle);
});
elements.undoClipboardCompletion.addEventListener('click', undoClipboardCompletion);
document.addEventListener('keydown', (event) => {
  if (elements.clipboardMode.hidden) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeClipboardMode();
    return;
  }
  if (event.key === 'Tab') {
    const focusable = [...elements.clipboardMode.querySelectorAll('button:not([disabled]), input:not([disabled])')];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});

elements.dialog.addEventListener('click', (event) => {
  if (event.target === elements.dialog) elements.dialog.close();
});

elements.form.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(elements.form);
  const title = String(formData.get('title') || '').trim();
  if (!title) {
    elements.title.focus();
    return;
  }
  plans.push({
    id: globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    date: dateKey(selectedDate),
    title,
    time: String(formData.get('time')),
    category: String(formData.get('category')),
    note: String(formData.get('note') || '').trim(),
    done: false,
  });
  savePlans();
  renderPlans();
  elements.dialog.close();
});

elements.list.addEventListener('click', (event) => {
  if (event.target.closest('[data-add-selected]')) {
    openDialog();
    return;
  }
  const addButton = event.target.closest('[data-add-date]');
  if (addButton) {
    selectedDate = new Date(`${addButton.dataset.addDate}T00:00:00`);
    openDialog();
    return;
  }
  const button = event.target.closest('[data-toggle]');
  if (!button) return;
  const plan = plans.find((item) => item.id === button.dataset.toggle);
  if (!plan) return;
  plan.done = !plan.done;
  savePlans();
  renderPlans();
});

plans = loadPlans();
todos = loadTodos();
try {
  displayName = localStorage.getItem(DISPLAY_NAME_KEY) || '';
  if (displayName && !validDisplayName(displayName)) {
    console.error('The saved planner display name has an unexpected format.');
    displayName = '';
  }
} catch (error) {
  console.error('Unable to load the planner display name:', error);
  showToast('Your saved name could not be read on this device.');
}
render();
refreshAccountUI();
if (!displayName) {
  elements.nameDialog.showModal();
  elements.displayNameInput.focus();
}
initializeCloud();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.error('Unable to register offline support:', error);
      showToast('Offline support could not be enabled on this visit.');
    });
  });
}
