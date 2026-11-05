import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './supabase-config.js';

const STORAGE_KEY = 'daylight-plans-v1';
const TODO_STORAGE_KEY = 'daylight-todos-v1';
const ANONYMOUS_MIGRATION_KEY = 'daylight-anonymous-migrated-v1';
const PENDING_SYNC_KEY = 'daylight-cloud-pending-v1';
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
  viewSwitch: $('.view-switch'),
  todoView: $('#todo-view'),
  dailyView: $('#daily-view'),
  weeklyView: $('#weekly-view'),
  collabView: $('#collab-view'),
  usernameTab: $('#username-tab'),
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
  cloudAccount: $('#cloud-account'),
  cloudStatus: $('#cloud-status'),
  cloudDialog: $('#cloud-dialog'),
  cloudForm: $('#cloud-signin-form'),
  cloudEmail: $('#cloud-email'),
  cloudExplanation: $('#cloud-explanation'),
  cloudSetupNote: $('#cloud-setup-note'),
  cloudAuthControls: $('#cloud-auth-controls'),
  cloudSubmit: $('#cloud-submit'),
  cloudUsernameForm: $('#cloud-username-form'),
  cloudUsername: $('#cloud-username'),
  cloudUsernameSubmit: $('#cloud-username-submit'),
  cloudSignout: $('#cloud-signout'),
  cloudFeedback: $('#cloud-feedback'),
  collabDashboard: $('#collab-dashboard'),
  collabSigninNote: $('#collab-signin-note'),
  collabSignin: $('#collab-signin'),
  collabCreateForm: $('#collab-create-form'),
  collabListName: $('#collab-list-name'),
  collabLayout: $('#collab-layout'),
  collabListNav: $('#collab-list-nav'),
  collabNoLists: $('#collab-no-lists'),
  collabEmptyState: $('#collab-empty-state'),
  collabListDetail: $('#collab-list-detail'),
  collabSelectedName: $('#collab-selected-name'),
  collabOwnerNote: $('#collab-owner-note'),
  collabRenameList: $('#collab-rename-list'),
  collabDeleteList: $('#collab-delete-list'),
  collabLeaveList: $('#collab-leave-list'),
  collabMemberList: $('#collab-member-list'),
  collabInviteForm: $('#collab-invite-form'),
  collabInviteUsername: $('#collab-invite-username'),
  collabInviteNote: $('#collab-invite-note'),
  collabTaskForm: $('#collab-task-form'),
  collabTaskTitle: $('#collab-task-title'),
  collabTaskCount: $('#collab-task-count'),
  collabTaskList: $('#collab-task-list'),
  collabTaskEmpty: $('#collab-task-empty'),
  collabFeedback: $('#collab-feedback'),
};

let selectedDate = new Date();
selectedDate.setHours(0, 0, 0, 0);
let plans = [];
let todos = [];
let activeView = 'todo';
let storageReady = true;
let todoStorageReady = true;
let toastTimer;
let cloudClient = null;
let cloudUser = null;
let cloudUsername = null;
let cloudChannel = null;
let collabLists = [];
let collabTasks = [];
let collabMembers = [];
let selectedCollabListId = null;
let collabRefreshPromise = null;
let activeLocalUserId = null;
let cloudReady = false;
let cloudLoadingUserId = null;
let cloudLoadPromise = null;
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

function loadPlans(key = STORAGE_KEY) {
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
    localStorage.setItem(activeLocalUserId ? `${STORAGE_KEY}:${activeLocalUserId}` : STORAGE_KEY, JSON.stringify(plans));
    scheduleCloudSync();
    return true;
  } catch (error) {
    console.error('Unable to save plans:', error);
    showToast('Could not save your plan on this device. Check available browser storage.');
    return false;
  }
}

function loadTodos(key = TODO_STORAGE_KEY) {
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
    localStorage.setItem(activeLocalUserId ? `${TODO_STORAGE_KEY}:${activeLocalUserId}` : TODO_STORAGE_KEY, JSON.stringify(todos));
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

function setCloudStatus(label, detail = '') {
  elements.cloudStatus.textContent = label;
  elements.cloudAccount.setAttribute('aria-label', detail || label);
}

function refreshCloudDialog() {
  const configured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
  elements.cloudSetupNote.hidden = configured;
  elements.cloudAuthControls.hidden = !configured || Boolean(cloudUser);
  elements.cloudUsernameForm.hidden = !configured || !cloudUser;
  elements.cloudSignout.hidden = !configured || !cloudUser;
  elements.usernameTab.textContent = cloudUser
    ? cloudUsername ? `@${cloudUsername}` : 'Choose name'
    : 'Username';
  elements.usernameTab.setAttribute('aria-label', cloudUsername
    ? `Manage username @${cloudUsername}`
    : 'Sign in and choose a username');
  if (document.activeElement !== elements.cloudUsername) {
    elements.cloudUsername.value = cloudUsername || '';
  }
  elements.cloudUsernameSubmit.textContent = cloudUsername ? 'Update username ✳' : 'Save username ✳';
  elements.cloudFeedback.textContent = '';
  if (!configured) {
    elements.cloudExplanation.textContent = 'Your plans are saved on this device. Connect a free Supabase project to sync them across your devices.';
    return;
  }
  if (cloudUser) {
    elements.cloudExplanation.textContent = cloudUsername
      ? `Signed in as @${cloudUsername}${cloudUser.email ? ` (${cloudUser.email})` : ''}. Your plans and to-dos sync privately to your cloud account.`
      : 'Choose a unique username for your planner. You can still sync your plans while you set it up.';
    return;
  }
  elements.cloudExplanation.textContent = 'Create an account or sign in with an email link. The first time you sign in, choose your unique username.';
  elements.cloudSubmit.hidden = false;
}

function openCloudDialog() {
  refreshCloudDialog();
  elements.cloudDialog.showModal();
}

function scheduleCloudSync() {
  if (!cloudClient || !cloudUser || !cloudReady || applyingCloudData) return;
  cloudDirty = true;
  const revision = ++cloudRevision;
  const userId = cloudUser.id;
  const pendingKey = `${PENDING_SYNC_KEY}:${userId}`;
  try {
    localStorage.setItem(pendingKey, 'true');
  } catch (error) {
    console.error('Unable to record pending cloud sync:', error);
    showToast('This change is saved for now, but this device could not mark it for cloud retry.');
  }
  const snapshot = {
    user_id: userId,
    plans: JSON.parse(JSON.stringify(plans)),
    todos: JSON.parse(JSON.stringify(todos)),
    updated_at: new Date().toISOString(),
  };
  setCloudStatus('Syncing…', 'Cloud sync is in progress');
  cloudSyncQueue = cloudSyncQueue
    .catch(() => {})
    .then(async () => {
      if (cloudUser?.id !== userId) return;
      const { error } = await cloudClient
        .from('planner_data')
        .upsert(snapshot, { onConflict: 'user_id' });
      if (error) throw error;
      if (revision === cloudRevision) {
        cloudDirty = false;
        try {
          localStorage.setItem(ANONYMOUS_MIGRATION_KEY, 'true');
          localStorage.removeItem(pendingKey);
        } catch (error) {
          console.error('Unable to record cloud sync state:', error);
        }
        setCloudStatus('Synced', `Synced as ${cloudUser?.email || 'your account'}`);
      }
    })
    .catch((error) => {
      console.error('Cloud sync failed:', error);
      setCloudStatus('Sync paused', 'Cloud sync failed; your device copy is safe');
      showToast(`Saved on this device, but cloud sync failed: ${error.message || 'Check your connection.'}`);
    });
}

function applyCloudRow(row) {
  if (!row || row.user_id !== cloudUser?.id) return;
  if (!validPlans(row.plans) || !validTodos(row.todos)) {
    const error = new Error('The cloud planner data has an unexpected format.');
    console.error('Unable to apply cloud planner data:', error);
    setCloudStatus('Sync issue', error.message);
    showToast('Cloud data could not be read. Your device copy was left unchanged.');
    return;
  }
  const hadLocalChanges = cloudDirty;
  applyingCloudData = true;
  plans = hadLocalChanges ? mergeById(row.plans, plans) : row.plans;
  todos = hadLocalChanges ? mergeById(row.todos, todos) : row.todos;
  savePlans();
  saveTodos();
  renderPlans();
  renderTodos();
  applyingCloudData = false;
  if (hadLocalChanges) {
    scheduleCloudSync();
  } else {
    setCloudStatus('Synced', `Synced as ${cloudUser?.email || 'your account'}`);
  }
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
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'planner_profiles',
      filter: `user_id=eq.${userId}`,
    }, (payload) => {
      if (typeof payload.new?.username === 'string') {
        cloudUsername = payload.new.username;
        refreshCloudDialog();
        renderCollab();
      }
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'planner_collab_lists',
    }, () => refreshCollabData())
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'planner_collab_members',
    }, () => refreshCollabData())
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'planner_collab_tasks',
    }, () => refreshCollabData())
    .subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('Cloud live updates could not connect:', error);
        setCloudStatus('Sync paused', 'Live cloud updates could not connect');
        showToast('Cloud live updates could not connect. Your changes remain saved on this device.');
      }
    });
}

function selectedCollabList() {
    return collabLists.find((list) => list.id === selectedCollabListId) || null;
}

function renderCollab() {
    const signedIn = Boolean(cloudUser);
    const canCreate = signedIn && Boolean(cloudUsername);
    const selectedList = selectedCollabList();
    const currentMembership = collabMembers.find((member) => member.user_id === cloudUser?.id);
    const isOwner = currentMembership?.role === 'owner';
    elements.collabSigninNote.hidden = canCreate;
    elements.collabCreateForm.hidden = !canCreate;
    elements.collabLayout.hidden = !signedIn;
    elements.collabSigninNote.querySelector('p').textContent = signedIn
      ? 'Choose a username before creating lists or inviting people.'
      : 'Sign in and choose a username to create or join a shared list.';
    elements.collabSignin.hidden = canCreate;
    elements.collabNoLists.hidden = collabLists.length > 0;
    elements.collabListNav.innerHTML = collabLists.map((list) => {
      return `<li><button type="button" data-collab-list="${escapeHTML(list.id)}" aria-current="${list.id === selectedCollabListId}"><strong>${escapeHTML(list.name)}</strong><span>${list.owner_id === cloudUser?.id ? 'created by you' : 'shared with you'}</span></button></li>`;
    }).join('');
    elements.collabEmptyState.hidden = !signedIn || Boolean(selectedList);
    elements.collabListDetail.hidden = !signedIn || !selectedList;
    if (!selectedList) return;

    elements.collabSelectedName.textContent = selectedList.name;
    elements.collabOwnerNote.textContent = isOwner ? 'You made this list.' : 'You’re a member of this shared list.';
    elements.collabRenameList.hidden = !isOwner;
    elements.collabDeleteList.hidden = !isOwner;
    elements.collabLeaveList.hidden = isOwner || !currentMembership;
    elements.collabInviteForm.hidden = !isOwner;
    elements.collabInviteNote.hidden = isOwner;
    elements.collabMemberList.innerHTML = collabMembers.map((member) => `
      <li>
        @${escapeHTML(member.username)}
        <span>${member.role === 'owner' ? 'creator' : 'member'}</span>
        ${isOwner && member.role !== 'owner' ? `<button type="button" data-remove-collab-member="${escapeHTML(member.user_id)}" aria-label="Remove @${escapeHTML(member.username)}">×</button>` : ''}
      </li>
    `).join('');
    const remaining = collabTasks.filter((task) => !task.done).length;
    elements.collabTaskCount.textContent = `${remaining} left`;
    elements.collabTaskEmpty.hidden = collabTasks.length > 0;
    elements.collabTaskList.innerHTML = collabTasks.map((task) => `
      <li class="collab-task-item${task.done ? ' is-done' : ''}">
        <label class="collab-task-check">
          <input type="checkbox" data-collab-task-toggle="${escapeHTML(task.id)}" ${task.done ? 'checked' : ''}>
          <span>${escapeHTML(task.title)}</span>
        </label>
        <button class="collab-task-delete" type="button" data-collab-task-delete="${escapeHTML(task.id)}" aria-label="Remove shared task: ${escapeHTML(task.title)}">×</button>
      </li>
    `).join('');
}

async function loadCollabListDetails(listId) {
    if (!cloudClient || !cloudUser || !listId) {
      collabTasks = [];
      collabMembers = [];
      renderCollab();
      return;
    }
    const [tasksResult, membersResult] = await Promise.all([
      cloudClient
        .from('planner_collab_tasks')
        .select('id, list_id, title, done, created_by, created_at')
        .eq('list_id', listId)
        .order('created_at', { ascending: true }),
      cloudClient.rpc('list_planner_collab_members', { p_list_id: listId }),
    ]);
    if (tasksResult.error) throw tasksResult.error;
    if (membersResult.error) throw membersResult.error;
    collabTasks = tasksResult.data || [];
    collabMembers = membersResult.data || [];
    renderCollab();
}

async function loadCollabLists() {
    if (!cloudClient || !cloudUser) {
      collabLists = [];
      selectedCollabListId = null;
      collabTasks = [];
      collabMembers = [];
      renderCollab();
      return;
    }
    const { data, error } = await cloudClient
      .from('planner_collab_lists')
      .select('id, name, owner_id, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    collabLists = data || [];
    if (!collabLists.some((list) => list.id === selectedCollabListId)) {
      selectedCollabListId = collabLists[0]?.id || null;
    }
    if (selectedCollabListId) await loadCollabListDetails(selectedCollabListId);
    else {
      collabTasks = [];
      collabMembers = [];
    }
    renderCollab();
}

function refreshCollabData() {
    if (!cloudUser || collabRefreshPromise) return collabRefreshPromise;
    collabRefreshPromise = loadCollabLists()
      .catch((error) => {
        console.error('Unable to refresh collaborative lists:', error);
        elements.collabFeedback.textContent = `Shared lists could not refresh: ${error.message || 'Check your connection.'}`;
      })
      .finally(() => {
        collabRefreshPromise = null;
      });
    return collabRefreshPromise;
}

async function loadCloudAccount(user) {
  const accountPlansKey = `${STORAGE_KEY}:${user.id}`;
  const accountTodosKey = `${TODO_STORAGE_KEY}:${user.id}`;
  const previousUserId = activeLocalUserId;
  const shouldImportAnonymous = previousUserId === null &&
    localStorage.getItem(ANONYMOUS_MIGRATION_KEY) !== 'true';
  const hasPendingChanges = localStorage.getItem(`${PENDING_SYNC_KEY}:${user.id}`) === 'true';
  const localPlans = mergeById(
    loadPlans(accountPlansKey),
    shouldImportAnonymous ? plans : [],
  );
  const localTodos = mergeById(
    loadTodos(accountTodosKey),
    shouldImportAnonymous ? todos : [],
  );

  activeLocalUserId = user.id;
  cloudUser = user;
  cloudReady = false;
  plans = localPlans;
  todos = localTodos;
  applyingCloudData = true;
  savePlans();
  saveTodos();
  applyingCloudData = false;
  render();
  renderTodos();
  setCloudStatus('Loading…', 'Loading your private cloud planner');
  cloudUsername = null;
  refreshCloudDialog();

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
  const { data, error } = plannerResult;
  const { data: profile, error: profileError } = profileResult;
  if (error) throw error;
  if (profileError) throw profileError;
  if (data && (!validPlans(data.plans) || !validTodos(data.todos))) {
    throw new Error('The cloud planner data has an unexpected format.');
  }
  if (profile && (typeof profile.username !== 'string' || !/^[a-z0-9_]{3,20}$/.test(profile.username))) {
    throw new Error('The cloud profile has an unexpected username format.');
  }

  cloudUsername = profile?.username || null;
  const mergeLocalChanges = hasPendingChanges || shouldImportAnonymous;
  plans = data
    ? mergeLocalChanges ? mergeById(data.plans, localPlans) : data.plans
    : localPlans;
  todos = data
    ? mergeLocalChanges ? mergeById(data.todos, localTodos) : data.todos
    : localTodos;
  applyingCloudData = true;
  savePlans();
  saveTodos();
  applyingCloudData = false;
  cloudReady = true;
  render();
  renderTodos();
  subscribeToCloud(user.id);
  scheduleCloudSync();
  await loadCollabLists().catch((error) => {
    console.error('Unable to load collaborative lists:', error);
    elements.collabFeedback.textContent = `Shared lists could not load: ${error.message || 'Check your database setup.'}`;
  });
  refreshCloudDialog();
  if (!cloudUsername) {
    if (!elements.cloudDialog.open) elements.cloudDialog.showModal();
    elements.cloudUsername.focus();
    elements.cloudFeedback.textContent = 'Your account is ready. Choose a unique username to finish setting it up.';
  }
  elements.cloudFeedback.textContent = 'Your device data and cloud data are together.';
}

function handleCloudSession(user) {
  if (!user) {
    if (cloudChannel && cloudClient) cloudClient.removeChannel(cloudChannel);
    cloudChannel = null;
    cloudUser = null;
    cloudUsername = null;
    collabLists = [];
    collabTasks = [];
    collabMembers = [];
    selectedCollabListId = null;
    cloudReady = false;
    cloudDirty = false;
    activeLocalUserId = null;
    plans = loadPlans();
    todos = loadTodos();
    setCloudStatus(SUPABASE_URL ? 'Signed out' : 'Set up sync', 'Cloud sync account');
    render();
    renderTodos();
    renderCollab();
    refreshCloudDialog();
    return Promise.resolve();
  }
  if (cloudUser?.id === user.id && cloudReady) return Promise.resolve();
  if (cloudLoadingUserId === user.id) return cloudLoadPromise;

  cloudLoadingUserId = user.id;
  cloudLoadPromise = loadCloudAccount(user)
    .catch((error) => {
      console.error('Unable to load cloud planner:', error);
      cloudReady = false;
      setCloudStatus('Sync issue', 'Unable to load cloud data; device copy is safe');
      elements.cloudFeedback.textContent = `Cloud sync could not load: ${error.message || 'Check your project setup and connection.'}`;
      showToast('Could not load cloud data. Your device copy is safe and unchanged.');
    })
    .finally(() => {
      cloudLoadingUserId = null;
      cloudLoadPromise = null;
    });
  return cloudLoadPromise;
}

async function initializeCloud() {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    setCloudStatus('Set up sync', 'Cloud sync is not configured yet');
    return;
  }
  setCloudStatus('Connecting…', 'Connecting to your cloud planner');
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    cloudClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    const { data, error } = await cloudClient.auth.getSession();
    if (error) throw error;
    await handleCloudSession(data.session?.user || null);
    cloudClient.auth.onAuthStateChange((event, session) => {
      window.setTimeout(() => {
        if (event === 'SIGNED_OUT' || !session?.user) {
          handleCloudSession(null);
        } else {
          handleCloudSession(session.user);
        }
      }, 0);
    });
    if (!data.session) setCloudStatus('Sign in to sync', 'Cloud project connected; sign in to sync');
  } catch (error) {
    console.error('Unable to initialize cloud sync:', error);
    setCloudStatus('Cloud unavailable', 'Cloud setup or connection needs attention');
    elements.cloudFeedback.textContent = `Cloud connection could not start: ${error.message || 'Check the setup guide.'}`;
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
  elements.collabView.classList.toggle('is-active', activeView === 'collab');
  elements.collabView.setAttribute('aria-pressed', String(activeView === 'collab'));
  elements.todoDashboard.hidden = !isTodo;
  elements.grid.hidden = isTodo || activeView === 'collab';
  elements.collabDashboard.hidden = activeView !== 'collab';
  $('#add-plan').hidden = isTodo || activeView === 'collab';
  elements.welcomeTitle.innerHTML = isTodo
    ? 'Your little list, <em>your pace.</em>'
    : activeView === 'collab' ? 'Little plans, <em>together.</em>'
      : isDaily ? 'Make today <em>yours.</em>' : 'Your week, <em>gently.</em>';
  elements.welcomeCopy.textContent = isTodo
    ? 'A soft place to gather all the things on your mind.'
    : activeView === 'collab' ? 'Your own planner stays yours. These lists are for sharing.'
      : isDaily ? 'A little space for everything on your mind.' : 'Little plans, soft reminders, room to breathe.';
  if (isTodo) {
    elements.todayLabel.textContent = 'A LITTLE SPACE FOR WHAT MATTERS';
    elements.grid.setAttribute('aria-label', 'Your planner');
    renderTodos();
    return;
  }
  if (activeView === 'collab') {
    elements.todayLabel.textContent = 'A LITTLE SPACE, SHARED';
    renderCollab();
    return;
  }
  elements.grid.classList.toggle('daily-mode', isDaily);
  elements.grid.classList.toggle('weekly-mode', !isDaily);
  elements.grid.setAttribute('aria-label', isDaily ? 'Your daily planner' : 'Your weekly planner');
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

elements.collabView.addEventListener('click', () => {
  activeView = 'collab';
  render();
  if (cloudUser) refreshCollabData();
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
elements.cloudAccount.addEventListener('click', openCloudDialog);
elements.usernameTab.addEventListener('click', openCloudDialog);
elements.collabSignin.addEventListener('click', openCloudDialog);
$('#close-cloud-dialog').addEventListener('click', () => elements.cloudDialog.close());
elements.cloudDialog.addEventListener('click', (event) => {
  if (event.target === elements.cloudDialog) elements.cloudDialog.close();
});

elements.cloudForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!cloudClient) {
    elements.cloudFeedback.textContent = 'Cloud sync is not connected yet. Follow the setup guide first.';
    return;
  }
  const email = elements.cloudEmail.value.trim();
  elements.cloudSubmit.disabled = true;
  elements.cloudFeedback.textContent = 'Sending your sign-in link…';
  try {
    const { error } = await cloudClient.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}${location.pathname}` },
    });
    if (error) throw error;
    elements.cloudFeedback.textContent = 'Check your email for a sign-in link. Open it on this device to connect your planner.';
  } catch (error) {
    console.error('Unable to request cloud sign-in:', error);
    elements.cloudFeedback.textContent = `Could not send the sign-in link: ${error.message || 'Check your email and Supabase settings.'}`;
  } finally {
    elements.cloudSubmit.disabled = false;
  }
});

elements.cloudUsernameForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!cloudClient || !cloudUser) {
    elements.cloudFeedback.textContent = 'Sign in before choosing a username.';
    return;
  }
  const username = elements.cloudUsername.value.trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    elements.cloudFeedback.textContent = 'Use 3–20 letters, numbers, or underscores.';
    elements.cloudUsername.focus();
    return;
  }

  elements.cloudUsername.value = username;
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
    if (error?.code === '23505') {
      throw new Error('That username is already taken. Try another one.');
    }
    if (error) throw error;
    cloudUsername = username;
    refreshCloudDialog();
    renderCollab();
    elements.cloudFeedback.textContent = `Your username is saved as @${username}.`;
  } catch (error) {
    console.error('Unable to save cloud username:', error);
    elements.cloudFeedback.textContent = `Could not save your username: ${error.message || 'Check your connection and try again.'}`;
  } finally {
    elements.cloudUsernameSubmit.disabled = false;
  }
});

elements.collabCreateForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!cloudUser || !cloudUsername) {
    elements.collabFeedback.textContent = 'Sign in and choose a username before creating a shared list.';
    return;
  }
  const name = elements.collabListName.value.trim();
  if (!name) return;
  const submit = elements.collabCreateForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  elements.collabFeedback.textContent = 'Making your shared list…';
  try {
    const { data, error } = await cloudClient.rpc('create_planner_collab_list', { p_name: name });
    if (error) throw error;
    selectedCollabListId = data;
    elements.collabCreateForm.reset();
    await loadCollabLists();
    elements.collabFeedback.textContent = 'Your shared list is ready. Invite someone by their exact username.';
  } catch (error) {
    console.error('Unable to create collaborative list:', error);
    elements.collabFeedback.textContent = `Could not create the shared list: ${error.message || 'Check your connection.'}`;
  } finally {
    submit.disabled = false;
  }
});

elements.collabListNav.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-collab-list]');
  if (!button) return;
  selectedCollabListId = button.dataset.collabList;
  elements.collabFeedback.textContent = '';
  try {
    await loadCollabListDetails(selectedCollabListId);
  } catch (error) {
    console.error('Unable to load collaborative list:', error);
    elements.collabFeedback.textContent = `Could not open this list: ${error.message || 'Check your connection.'}`;
  }
});

elements.collabInviteForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!selectedCollabListId) return;
  const username = elements.collabInviteUsername.value.trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    elements.collabFeedback.textContent = 'Enter a username with 3–20 letters, numbers, or underscores.';
    return;
  }
  const submit = elements.collabInviteForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  elements.collabFeedback.textContent = `Inviting @${username}…`;
  try {
    const { data, error } = await cloudClient.rpc('invite_planner_collab_user', {
      p_list_id: selectedCollabListId,
      p_username: username,
    });
    if (error) throw error;
    elements.collabInviteForm.reset();
    await loadCollabLists();
    elements.collabFeedback.textContent = `@${data} can now see and update this list.`;
  } catch (error) {
    console.error('Unable to invite collaborative list member:', error);
    const message = error.code === 'P0001'
      ? error.message
      : error.message || 'Check that the username exists and try again.';
    elements.collabFeedback.textContent = `Could not invite that person: ${message}`;
  } finally {
    submit.disabled = false;
  }
});

elements.collabDeleteList.addEventListener('click', async () => {
  const list = selectedCollabList();
  if (!list || !window.confirm(`Delete “${list.name}” and its shared tasks for everyone?`)) return;
  elements.collabDeleteList.disabled = true;
  try {
    const { error } = await cloudClient.from('planner_collab_lists').delete().eq('id', list.id);
    if (error) throw error;
    selectedCollabListId = null;
    await loadCollabLists();
    elements.collabFeedback.textContent = 'The shared list was deleted.';
  } catch (error) {
    console.error('Unable to delete collaborative list:', error);
    elements.collabFeedback.textContent = `Could not delete the list: ${error.message || 'Check your connection.'}`;
  } finally {
    elements.collabDeleteList.disabled = false;
  }
});

elements.collabRenameList.addEventListener('click', async () => {
  const list = selectedCollabList();
  if (!list) return;
  const name = window.prompt('What would you like to call this shared list?', list.name)?.trim();
  if (!name || name === list.name) return;
  if (name.length > 60) {
    elements.collabFeedback.textContent = 'List names can be up to 60 characters.';
    return;
  }
  elements.collabRenameList.disabled = true;
  try {
    const { error } = await cloudClient
      .from('planner_collab_lists')
      .update({ name })
      .eq('id', list.id);
    if (error) throw error;
    await loadCollabLists();
    elements.collabFeedback.textContent = 'The shared list name was updated.';
  } catch (error) {
    console.error('Unable to rename collaborative list:', error);
    elements.collabFeedback.textContent = `Could not rename the list: ${error.message || 'Check your connection.'}`;
  } finally {
    elements.collabRenameList.disabled = false;
  }
});

elements.collabLeaveList.addEventListener('click', async () => {
  const list = selectedCollabList();
  if (!list || !window.confirm(`Leave “${list.name}”? You’ll no longer see its shared tasks.`)) return;
  elements.collabLeaveList.disabled = true;
  try {
    const { error } = await cloudClient.from('planner_collab_members')
      .delete()
      .eq('list_id', list.id)
      .eq('user_id', cloudUser.id);
    if (error) throw error;
    selectedCollabListId = null;
    await loadCollabLists();
    elements.collabFeedback.textContent = 'You left the shared list.';
  } catch (error) {
    console.error('Unable to leave collaborative list:', error);
    elements.collabFeedback.textContent = `Could not leave the list: ${error.message || 'Check your connection.'}`;
  } finally {
    elements.collabLeaveList.disabled = false;
  }
});

elements.collabMemberList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-remove-collab-member]');
  const list = selectedCollabList();
  if (!button || !list || !window.confirm('Remove this person from the shared list?')) return;
  button.disabled = true;
  try {
    const { error } = await cloudClient.from('planner_collab_members')
      .delete()
      .eq('list_id', list.id)
      .eq('user_id', button.dataset.removeCollabMember);
    if (error) throw error;
    await loadCollabLists();
    elements.collabFeedback.textContent = 'The person was removed from this list.';
  } catch (error) {
    console.error('Unable to remove collaborative list member:', error);
    elements.collabFeedback.textContent = `Could not remove this person: ${error.message || 'Check your connection.'}`;
  }
});

elements.collabTaskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const list = selectedCollabList();
  const title = elements.collabTaskTitle.value.trim();
  if (!list || !title) return;
  const submit = elements.collabTaskForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const { error } = await cloudClient.from('planner_collab_tasks').insert({
      list_id: list.id,
      title,
      done: false,
      created_by: cloudUser.id,
    });
    if (error) throw error;
    elements.collabTaskForm.reset();
    await loadCollabListDetails(list.id);
  } catch (error) {
    console.error('Unable to add shared task:', error);
    elements.collabFeedback.textContent = `Could not add that task: ${error.message || 'Check your connection.'}`;
  } finally {
    submit.disabled = false;
  }
});

elements.collabTaskList.addEventListener('change', async (event) => {
  const checkbox = event.target.closest('[data-collab-task-toggle]');
  if (!checkbox) return;
  const task = collabTasks.find((item) => item.id === checkbox.dataset.collabTaskToggle);
  if (!task) return;
  const { error } = await cloudClient.from('planner_collab_tasks')
    .update({ done: checkbox.checked })
    .eq('id', task.id)
    .eq('list_id', task.list_id);
  if (error) {
    console.error('Unable to update shared task:', error);
    elements.collabFeedback.textContent = `Could not update that task: ${error.message || 'Check your connection.'}`;
    checkbox.checked = task.done;
    return;
  }
  task.done = checkbox.checked;
  renderCollab();
});

elements.collabTaskList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-collab-task-delete]');
  if (!button) return;
  const task = collabTasks.find((item) => item.id === button.dataset.collabTaskDelete);
  if (!task) return;
  button.disabled = true;
  const { error } = await cloudClient.from('planner_collab_tasks')
    .delete()
    .eq('id', task.id)
    .eq('list_id', task.list_id);
  if (error) {
    console.error('Unable to remove shared task:', error);
    elements.collabFeedback.textContent = `Could not remove that task: ${error.message || 'Check your connection.'}`;
    button.disabled = false;
    return;
  }
  collabTasks = collabTasks.filter((item) => item.id !== task.id);
  renderCollab();
});

elements.cloudSignout.addEventListener('click', async () => {
  if (!cloudClient) return;
  elements.cloudSignout.disabled = true;
  try {
    const { error } = await cloudClient.auth.signOut();
    if (error) throw error;
    elements.cloudDialog.close();
  } catch (error) {
    console.error('Unable to sign out of cloud sync:', error);
    elements.cloudFeedback.textContent = `Could not sign out: ${error.message || 'Try again.'}`;
  } finally {
    elements.cloudSignout.disabled = false;
  }
});

window.addEventListener('online', () => {
  if (cloudDirty) scheduleCloudSync();
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
render();
initializeCloud();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.error('Unable to register offline support:', error);
      showToast('Offline support could not be enabled on this visit.');
    });
  });
}
