/**
 * Popup Logic for URL Redirector Chrome Extension
 */

const STORAGE_KEY = 'url_redirector_apps';

// Application State
let applications = [];

// DOM Elements
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

const activeList = document.getElementById('active-list');
const activeEmptyState = document.getElementById('active-empty-state');
const allAppsList = document.getElementById('all-apps-list');
const allEmptyState = document.getElementById('all-empty-state');

const tabActiveBadge = document.getElementById('tab-active-badge');
const tabAllBadge = document.getElementById('tab-all-badge');
const globalStatusChip = document.getElementById('global-status-chip');
const activeCountLabel = document.getElementById('active-count-label');

const searchAppsInput = document.getElementById('search-apps-input');

const addAppForm = document.getElementById('add-app-form');
const appNameInput = document.getElementById('app-name');
const appSourceInput = document.getElementById('app-source');
const appTargetInput = document.getElementById('app-target');

const editModal = document.getElementById('edit-modal');
const editAppForm = document.getElementById('edit-app-form');
const editAppIdInput = document.getElementById('edit-app-id');
const editAppNameInput = document.getElementById('edit-app-name');
const editAppSourceInput = document.getElementById('edit-app-source');
const editAppTargetInput = document.getElementById('edit-app-target');
const closeModalBtn = document.getElementById('close-modal-btn');
const cancelModalBtn = document.getElementById('cancel-modal-btn');

const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

// Initialize Extension Popup
document.addEventListener('DOMContentLoaded', async () => {
  setupTabListeners();
  setupFormListeners();
  setupSearchListener();
  setupPresets();
  await loadApplications();
});

/**
 * Storage Helpers
 */
function getStorageData(key) {
  return new Promise((resolve) => {
    if (chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get([key], (res) => {
        if (chrome.runtime.lastError || !res[key]) {
          chrome.storage.local.get([key], (localRes) => {
            resolve(localRes[key] || []);
          });
        } else {
          resolve(res[key] || []);
        }
      });
    } else if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([key], (res) => {
        resolve(res[key] || []);
      });
    } else {
      resolve([]);
    }
  });
}

function saveStorageData(key, data) {
  return new Promise((resolve) => {
    const payload = { [key]: data };
    if (chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.set(payload, () => {
        if (chrome.runtime.lastError) {
          chrome.storage.local.set(payload, () => resolve());
        } else {
          resolve();
        }
      });
    } else if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set(payload, () => resolve());
    } else {
      resolve();
    }
  });
}

async function loadApplications() {
  applications = await getStorageData(STORAGE_KEY);
  render();
}

async function saveApplications() {
  await saveStorageData(STORAGE_KEY, applications);
  // Request background script to sync dynamic rules
  if (chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ type: 'REFRESH_RULES' });
  }
  render();
}

/**
 * Render Lists and Badges
 */
function render() {
  const activeApps = applications.filter((app) => app.enabled);
  const filterQuery = (searchAppsInput.value || '').trim().toLowerCase();

  // Badges & Counters
  tabActiveBadge.textContent = activeApps.length;
  tabAllBadge.textContent = applications.length;

  if (activeApps.length > 0) {
    globalStatusChip.classList.add('active');
    activeCountLabel.textContent = `${activeApps.length} Active`;
  } else {
    globalStatusChip.classList.remove('active');
    activeCountLabel.textContent = '0 Active';
  }

  // Render TAB 1: Active Applications
  renderActiveApps(activeApps);

  // Render TAB 2: All Applications (Name & Actions)
  renderAllApps(filterQuery);
}

function renderActiveApps(activeApps) {
  activeList.innerHTML = '';
  if (activeApps.length === 0) {
    activeEmptyState.style.display = 'flex';
  } else {
    activeEmptyState.style.display = 'none';
    activeApps.forEach((app) => {
      const card = createActiveCardElement(app);
      activeList.appendChild(card);
    });
  }
}

function renderAllApps(filterQuery) {
  allAppsList.innerHTML = '';
  const filteredApps = applications.filter((app) =>
    app.name.toLowerCase().includes(filterQuery) ||
    app.sourceUrl.toLowerCase().includes(filterQuery) ||
    app.targetUrl.toLowerCase().includes(filterQuery)
  );

  if (filteredApps.length === 0) {
    allEmptyState.style.display = 'flex';
  } else {
    allEmptyState.style.display = 'none';
    filteredApps.forEach((app) => {
      const card = createAllCardElement(app);
      allAppsList.appendChild(card);
    });
  }
}

/**
 * Card Creators
 */
function createActiveCardElement(app) {
  const card = document.createElement('div');
  card.className = 'app-card';

  card.innerHTML = `
    <div class="card-top">
      <div class="app-title">
        <span class="active-dot"></span>
        ${escapeHtml(app.name)}
      </div>
      <label class="switch" title="Disable redirection">
        <input type="checkbox" checked data-id="${app.id}" class="toggle-active-btn">
        <span class="slider"></span>
      </label>
    </div>
    <div class="url-flow">
      <div class="url-node">
        <span class="node-tag source">FROM</span>
        <span class="url-text" title="${escapeHtml(app.sourceUrl)}">${escapeHtml(app.sourceUrl)}</span>
      </div>
      <div class="flow-arrow">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="7 13 12 18 17 13"></polyline>
          <line x1="12" y1="6" x2="12" y2="18"></line>
        </svg>
      </div>
      <div class="url-node">
        <span class="node-tag target">TO</span>
        <span class="url-text" title="${escapeHtml(app.targetUrl)}">${escapeHtml(app.targetUrl)}</span>
      </div>
    </div>
  `;

  // Listener for toggle in active tab
  const toggle = card.querySelector('.toggle-active-btn');
  toggle.addEventListener('change', (e) => {
    toggleAppStatus(app.id, e.target.checked);
  });

  return card;
}

function createAllCardElement(app) {
  const card = document.createElement('div');
  card.className = `app-card ${app.enabled ? '' : 'disabled'}`;

  card.innerHTML = `
    <div class="card-top">
      <div class="app-title">
        ${app.enabled ? '<span class="active-dot"></span>' : ''}
        ${escapeHtml(app.name)}
      </div>
      <label class="switch" title="${app.enabled ? 'Disable' : 'Enable'} redirection">
        <input type="checkbox" ${app.enabled ? 'checked' : ''} data-id="${app.id}" class="toggle-app-btn">
        <span class="slider"></span>
      </label>
    </div>
    <div class="url-flow">
      <div class="url-node">
        <span class="node-tag source">SRC</span>
        <span class="url-text">${escapeHtml(app.sourceUrl)}</span>
      </div>
      <div class="url-node">
        <span class="node-tag target">TGT</span>
        <span class="url-text">${escapeHtml(app.targetUrl)}</span>
      </div>
    </div>
    <div class="card-actions">
      <button type="button" class="btn-action edit-app-btn" data-id="${app.id}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
        Edit
      </button>
      <button type="button" class="btn-action delete delete-app-btn" data-id="${app.id}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
        Remove
      </button>
    </div>
  `;

  // Listeners
  const toggle = card.querySelector('.toggle-app-btn');
  toggle.addEventListener('change', (e) => {
    toggleAppStatus(app.id, e.target.checked);
  });

  const editBtn = card.querySelector('.edit-app-btn');
  editBtn.addEventListener('click', () => {
    openEditModal(app);
  });

  const deleteBtn = card.querySelector('.delete-app-btn');
  deleteBtn.addEventListener('click', () => {
    removeApp(app.id);
  });

  return card;
}

/**
 * App Actions
 */
async function toggleAppStatus(id, enabled) {
  const index = applications.findIndex((a) => a.id === id);
  if (index !== -1) {
    applications[index].enabled = enabled;
    await saveApplications();
    showToast(enabled ? 'Redirection enabled' : 'Redirection disabled');
  }
}

async function removeApp(id) {
  const app = applications.find((a) => a.id === id);
  if (confirm(`Remove application "${app ? app.name : ''}"?`)) {
    applications = applications.filter((a) => a.id !== id);
    await saveApplications();
    showToast('Application removed');
  }
}

function openEditModal(app) {
  editAppIdInput.value = app.id;
  editAppNameInput.value = app.name;
  editAppSourceInput.value = app.sourceUrl;
  editAppTargetInput.value = app.targetUrl;
  editModal.classList.remove('hidden');
}

function closeEditModal() {
  editModal.classList.add('hidden');
}

/**
 * Event Listeners Setup
 */
function setupTabListeners() {
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      tabBtns.forEach((b) => b.classList.remove('active'));
      tabContents.forEach((c) => c.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(targetTab).classList.add('active');
    });
  });
}

function setupFormListeners() {
  // Add App Form
  addAppForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = appNameInput.value.trim();
    let sourceUrl = appSourceInput.value.trim();
    let targetUrl = appTargetInput.value.trim();

    if (!name || !sourceUrl || !targetUrl) {
      showToast('Please fill in all fields');
      return;
    }

    // Auto prepend protocol if missing
    if (!/^https?:\/\//i.test(sourceUrl)) {
      sourceUrl = 'https://' + sourceUrl;
    }
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = 'http://' + targetUrl;
    }

    const newApp = {
      id: 'app_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      name: name,
      sourceUrl: sourceUrl,
      targetUrl: targetUrl,
      enabled: true,
      createdAt: Date.now()
    };

    applications.push(newApp);
    await saveApplications();

    // Reset Form
    addAppForm.reset();
    showToast(`Added "${name}"`);

    // Switch to Active Tab
    document.getElementById('btn-tab-active').click();
  });

  // Edit App Form
  editAppForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = editAppIdInput.value;
    const name = editAppNameInput.value.trim();
    let sourceUrl = editAppSourceInput.value.trim();
    let targetUrl = editAppTargetInput.value.trim();

    if (!/^https?:\/\//i.test(sourceUrl)) {
      sourceUrl = 'https://' + sourceUrl;
    }
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = 'http://' + targetUrl;
    }

    const index = applications.findIndex((a) => a.id === id);
    if (index !== -1) {
      applications[index].name = name;
      applications[index].sourceUrl = sourceUrl;
      applications[index].targetUrl = targetUrl;

      await saveApplications();
      closeEditModal();
      showToast(`Updated "${name}"`);
    }
  });

  closeModalBtn.addEventListener('click', closeEditModal);
  cancelModalBtn.addEventListener('click', closeEditModal);

  editModal.addEventListener('click', (e) => {
    if (e.target === editModal) {
      closeEditModal();
    }
  });
}

function setupSearchListener() {
  searchAppsInput.addEventListener('input', () => {
    const filterQuery = (searchAppsInput.value || '').trim().toLowerCase();
    renderAllApps(filterQuery);
  });
}

function setupPresets() {
  const presetBtns = document.querySelectorAll('.chip-btn');
  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetVal = btn.getAttribute('data-target');
      appTargetInput.value = targetVal;
    });
  });
}

function showToast(msg) {
  toastMessage.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 2200);
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
