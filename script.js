/* ============================================================
   DAYBOOK — script.js
   Vanilla JS Daily Task Reminder App
   Modular structure: state, storage, render, events
   ============================================================ */

(function () {
  'use strict';

  /* ---------------- STORAGE KEYS ---------------- */
  const STORAGE_KEYS = {
    TASKS: 'daybook_tasks',
    SETTINGS: 'daybook_settings',
    FILTERS: 'daybook_filters',
  };

  /* ---------------- STATE ---------------- */
  let state = {
    tasks: [],
    settings: {
      theme: 'light',
      notificationsEnabled: false,
      soundEnabled: true,
    },
    filters: {
      currentView: 'dashboard',
      sidebarFilter: 'all',
      searchTerm: '',
      todayPriority: 'all',
      todayStatus: 'all',
    },
    calendar: {
      viewYear: new Date().getFullYear(),
      viewMonth: new Date().getMonth(),
      selectedDate: null,
    }, // This closing brace was missing
  };

  /* ---------------- UTILS ---------------- */
  function uid() {
    return 'task_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function tomorrowISO() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function isoFromDate(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function formatDateLong(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  /* ---------------- STORAGE: LOAD / SAVE ---------------- */
  function loadTasks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.TASKS);
      state.tasks = raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('Failed to load tasks', e);
      state.tasks = [];
    }
  }

  function saveTasks() {
    try {
      localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(state.tasks));
    } catch (e) {
      console.error('Failed to save tasks', e);
      showToast('Could not save — storage may be full.', 'error');
    }
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (raw) state.settings = { ...state.settings, ...JSON.parse(raw) };
    } catch (e) { console.error('Failed to load settings', e); }
  }

  function saveSettings() {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(state.settings));
  }

  function loadFilters() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.FILTERS);
      if (raw) state.filters = { ...state.filters, ...JSON.parse(raw) };
    } catch (e) { console.error('Failed to load filters', e); }
  }

  function saveFilters() {
    localStorage.setItem(STORAGE_KEYS.FILTERS, JSON.stringify(state.filters));
  }

  /* ---------------- TOASTS ---------------- */
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  /* ============================================================
     TASK CRUD
     ============================================================ */
  function addTask(taskData) {
    const task = {
      id: uid(),
      title: taskData.title.trim(),
      description: (taskData.description || '').trim(),
      dueDate: taskData.dueDate,
      priority: taskData.priority,
      category: (taskData.category || 'General').trim() || 'General',
      status: taskData.status || 'Pending',
      createdAt: new Date().toISOString(),
    };
    state.tasks.push(task);
    saveTasks();
    return task;
  }

  function editTask(id, updates) {
    const idx = state.tasks.findIndex(t => t.id === id);
    if (idx === -1) return null;
    state.tasks[idx] = { ...state.tasks[idx], ...updates };
    saveTasks();
    return state.tasks[idx];
  }

  function deleteTask(id) {
    state.tasks = state.tasks.filter(t => t.id !== id);
    saveTasks();
  }

  function toggleTaskStatus(id) {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;
    task.status = task.status === 'Completed' ? 'Pending' : 'Completed';
    saveTasks();
    renderAll();
    showToast(task.status === 'Completed' ? 'Task marked complete 🎉' : 'Task reopened', 'success');
  }

  function toggleHighPriority(id) {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;
    const newPriority = task.priority === 'High' ? 'Medium' : 'High'; // Toggle between High and Medium/Low
    editTask(id, { priority: newPriority });
    renderAll();
    showToast(
      newPriority === 'High' ? 'Task marked High priority ⬆️' : 'Task priority adjusted', 'info'
    );
  }

  /* ============================================================
     QUERY HELPERS
     ============================================================ */
  function getTasksForDate(dateStr) {
    return state.tasks
      .filter(t => t.dueDate === dateStr);
  }

  function getWeekRange() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }

  function isInThisWeek(dateStr) {
    const { start, end } = getWeekRange();
    const d = new Date(dateStr + 'T00:00:00');
    return d >= start && d < end;
  }

  function matchesSearch(task, term) {
    if (!term) return true;
    const parts = term.toLowerCase().trim().split(/\s+/);

    return parts.every(part => {
      if (part.startsWith('p:') || part.startsWith('priority:')) {
        const val = part.split(':')[1];
        return val ? task.priority.toLowerCase().startsWith(val) : true;
      }
      if (part.startsWith('s:') || part.startsWith('status:')) {
        const val = part.split(':')[1];
        return val ? task.status.toLowerCase().startsWith(val) : true;
      }
      if (part.startsWith('c:') || part.startsWith('category:')) {
        const val = part.split(':')[1];
        return val ? task.category.toLowerCase().includes(val) : true;
      }
      if (part.startsWith('d:') || part.startsWith('date:')) {
        const val = part.split(':')[1];
        if (val === 'today') return task.dueDate === todayISO();
        if (val === 'tomorrow') return task.dueDate === tomorrowISO();
        return val ? task.dueDate.includes(val) : true;
      }
      return (
        task.title.toLowerCase().includes(part) ||
        (task.description || '').toLowerCase().includes(part) ||
        (task.category || '').toLowerCase().includes(part)
      );
    });
  }

  function filterTasks(criteria) {
    let list = [...state.tasks];
    const { sidebarFilter, searchTerm } = state.filters;

    switch (sidebarFilter) {
      case 'week':
        list = list.filter(t => isInThisWeek(t.dueDate));
        break;
      case 'completed':
        list = list.filter(t => t.status === 'Completed');
        break;
      case 'pending':
        list = list.filter(t => t.status === 'Pending');
        break;
      case 'high':
        list = list.filter(t => t.priority === 'High');
        break;
      default: break;
    }

    if (searchTerm) list = list.filter(t => matchesSearch(t, searchTerm));
    if (criteria) {
      if (criteria.priority && criteria.priority !== 'all') list = list.filter(t => t.priority === criteria.priority);
      if (criteria.status && criteria.status !== 'all') list = list.filter(t => t.status === criteria.status);
      if (criteria.dueDate) list = list.filter(t => t.dueDate === criteria.dueDate);
    }
    return list.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }

  function searchTasks(term) {
    state.filters.searchTerm = term;
    saveFilters();
    renderAll();
  }

  /* ============================================================
     RENDER: TASK CARD
     ============================================================ */
  function priorityBadgeClass(p) {
    return p === 'High' ? 'badge-high' : p === 'Medium' ? 'badge-medium' : 'badge-low';
  }

  function renderTaskCard(task) {
    const completed = task.status === 'Completed';
    const card = document.createElement('div');
    card.className = `task-card${completed ? ' completed' : ''}`;
    card.dataset.id = task.id;

    card.innerHTML = `
      <button class="task-check${completed ? ' checked' : ''}" aria-label="Toggle complete" data-action="toggle">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="task-body">
        <div class="task-top-row">
          <span class="task-title">${escapeHtml(task.title)}</span>
          <span class="badge ${priorityBadgeClass(task.priority)}" data-action="toggle-priority" title="Click to toggle priority">${escapeHtml(task.priority)}</span>
        </div>
        ${task.description ? `<div class="task-desc">${escapeHtml(task.description)}</div>` : ''}
        <div class="task-meta">
          <span>📅 ${escapeHtml(task.dueDate)}</span>
          <span class="badge badge-category">${escapeHtml(task.category)}</span>
        </div>
      </div>
      <div class="task-actions">
        <button class="icon-btn" data-action="edit" aria-label="Edit task" title="Edit">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 20h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
        </button>
        <button class="icon-btn" data-action="delete" aria-label="Delete task" title="Delete">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0l-1 14a1 1 0 01-1 1H7a1 1 0 01-1-1L5 6h14z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    `;

    card.querySelector('[data-action="toggle"]').addEventListener('click', () => toggleTaskStatus(task.id));
    card.querySelector('[data-action="edit"]').addEventListener('click', () => openTaskModal(task.id));
    card.querySelector('[data-action="toggle-priority"]').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleHighPriority(task.id);
    });
    card.querySelector('[data-action="delete"]').addEventListener('click', () => openConfirmDelete(task.id));

    return card;
  }

  function renderEmptyState(container, { emoji = '🗒️', title = 'Nothing here yet', sub = 'Add a task to get started.' } = {}) {
    container.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'empty-state';
    el.innerHTML = `
      <div class="empty-emoji">${emoji}</div>
      <div class="empty-title">${escapeHtml(title)}</div>
      <div class="empty-sub">${escapeHtml(sub)}</div>
    `;
    container.appendChild(el);
  }

  function renderListInto(container, tasks, emptyOpts) {
    container.innerHTML = '';
    if (!tasks.length) {
      renderEmptyState(container, emptyOpts);
      return;
    }
    tasks.forEach(t => container.appendChild(renderTaskCard(t)));
  }

  /* ============================================================
     RENDER: DASHBOARD
     ============================================================ */
  function renderDashboard() {
    const today = todayISO();
    const tomorrow = tomorrowISO();
    const todayTasks = getTasksForDate(today);
    const tomorrowTasks = getTasksForDate(tomorrow);
    const completed = state.tasks.filter(t => t.status === 'Completed').length;
    const pending = state.tasks.filter(t => t.status === 'Pending').length;

    document.getElementById('sumToday').textContent = todayTasks.length;
    document.getElementById('sumTomorrow').textContent = tomorrowTasks.length;
    document.getElementById('sumCompleted').textContent = completed;
    document.getElementById('sumPending').textContent = pending;

    document.getElementById('dashboardDateLine').textContent = formatDateLong(today);

    renderListInto(document.getElementById('dashTodayList'), todayTasks.slice(0, 5), {
      emoji: '☕', title: 'Nothing scheduled today', sub: 'Enjoy the calm, or add a new task.'
    });
    renderListInto(document.getElementById('dashTomorrowList'), tomorrowTasks.slice(0, 5), {
      emoji: '🌙', title: 'Tomorrow is wide open', sub: 'Plan ahead by adding a task.'
    });

    document.getElementById('badgeToday').textContent = todayTasks.filter(t => t.status !== 'Completed').length;
    document.getElementById('badgeTomorrow').textContent = tomorrowTasks.length;
  }

  /* ============================================================
     RENDER: TODAY VIEW
     ============================================================ */
  function renderTodayTasks() {
    const today = todayISO();
    document.getElementById('todayDateLine').textContent = formatDateLong(today);

    let tasks = getTasksForDate(today);
    const { todayPriority, todayStatus, searchTerm } = state.filters;
    if (todayPriority !== 'all') tasks = tasks.filter(t => t.priority === todayPriority);
    if (todayStatus !== 'all') tasks = tasks.filter(t => t.status === todayStatus);
    if (searchTerm) tasks = tasks.filter(t => matchesSearch(t, searchTerm));

    renderListInto(document.getElementById('todayList'), tasks, {
      emoji: '✅', title: 'No matching tasks for today', sub: 'Try adjusting filters or add a new task.'
    });
  }

  /* ============================================================
     RENDER: TOMORROW VIEW
     ============================================================ */
  function renderTomorrowTasks() {
    const tomorrow = tomorrowISO();
    document.getElementById('tomorrowDateLine').textContent = formatDateLong(tomorrow);
    let tasks = getTasksForDate(tomorrow);
    const { searchTerm } = state.filters;
    if (searchTerm) tasks = tasks.filter(t => matchesSearch(t, searchTerm));

    const container = document.getElementById('tomorrowList');
    container.innerHTML = '';
    if (!tasks.length) {
      renderEmptyState(container, { emoji: '🌙', title: 'Nothing planned for tomorrow', sub: 'Add a task to prep ahead.' });
    } else {
      tasks.forEach(t => {
        const card = renderTaskCard(t);
        if (t.priority === 'High') card.style.borderLeft = '4px solid var(--high)';
        container.appendChild(card);
      });
    }
    updateTomorrowCountdown();
  }

  function updateTomorrowCountdown() {
    const el = document.getElementById('countdownText');
    if (!el) return;
    const now = new Date();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    const diff = midnight - now;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    el.textContent = `${pad(h)}h ${pad(m)}m ${pad(s)}s until tomorrow`;
  }

  /* ============================================================
     RENDER: CALENDAR
     ============================================================ */
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  function renderCalendar() {
    const { viewYear, viewMonth } = state.calendar;
    document.getElementById('calMonthLabel').textContent = `${MONTH_NAMES[viewMonth]} ${viewYear}`;

    const grid = document.getElementById('calGrid');
    grid.innerHTML = '';

    const firstDay = new Date(viewYear, viewMonth, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();
    const todayStr = todayISO();

    // Build task-by-date map for this month view (also need prev/next overflow)
    const totalCells = 42; // 6 rows x 7
    for (let i = 0; i < totalCells; i++) {
      const cellIndex = i - startWeekday + 1;
      let cellDate, outside = false;
      if (cellIndex < 1) {
        cellDate = new Date(viewYear, viewMonth - 1, daysInPrevMonth + cellIndex);
        outside = true;
      } else if (cellIndex > daysInMonth) {
        cellDate = new Date(viewYear, viewMonth + 1, cellIndex - daysInMonth);
        outside = true;
      } else {
        cellDate = new Date(viewYear, viewMonth, cellIndex);
      }
      const iso = isoFromDate(cellDate);
      const dayTasks = outside ? [] : getTasksForDate(iso);
      const hasPending = dayTasks.some(t => t.status === 'Pending');
      const hasCompleted = dayTasks.some(t => t.status === 'Completed');

      const cell = document.createElement('button');
      cell.className = 'cal-day' + (outside ? ' outside' : '') + (iso === todayStr ? ' is-today' : '') + (iso === state.calendar.selectedDate ? ' is-selected' : '');
      cell.dataset.date = iso;
      cell.innerHTML = `
        <span>${cellDate.getDate()}</span>
        <span class="cal-dots">
          ${hasPending ? '<span class="dot-pending"></span>' : ''}
          ${hasCompleted ? '<span class="dot-completed"></span>' : ''}
        </span>
      `;
      if (!outside) {
        cell.addEventListener('click', () => {
          state.calendar.selectedDate = iso;
          renderCalendar();
          renderCalendarDayPanel();
        });
      }
      grid.appendChild(cell);
    }
  }

  function renderCalendarDayPanel() {
    const label = document.getElementById('calSelectedLabel');
    const list = document.getElementById('calDayList');
    const selected = state.calendar.selectedDate;
    if (!selected) {
      label.textContent = 'Select a date';
      renderEmptyState(list, { emoji: '👆', title: 'Pick a date', sub: 'Tap any day on the calendar to see its tasks.' });
      return;
    }
    label.textContent = formatDateLong(selected);
    const tasks = getTasksForDate(selected);
    renderListInto(list, tasks, { emoji: '🗒️', title: 'No tasks this day', sub: 'Add one to fill the page.' });
  }

  /* ============================================================
     RENDER: STATISTICS
     ============================================================ */
  function updateStatistics() {
    const total = state.tasks.length;
    const completed = state.tasks.filter(t => t.status === 'Completed').length;
    const pending = total - completed;
    const high = state.tasks.filter(t => t.priority === 'High').length;
    const pct = total ? Math.round((completed / total) * 100) : 0;

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statCompleted').textContent = completed;
    document.getElementById('statPending').textContent = pending;
    document.getElementById('statHigh').textContent = high;
    document.getElementById('completionPctText').textContent = `${pct}%`;
    document.getElementById('completionFill').style.width = `${pct}%`;

    const byCategory = {};
    state.tasks.forEach(t => {
      byCategory[t.category] = (byCategory[t.category] || 0) + 1;
    });
    const maxCount = Math.max(1, ...Object.values(byCategory));
    const container = document.getElementById('categoryBars');
    container.innerHTML = '';
    const entries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    if (!entries.length) {
      renderEmptyState(container, { emoji: '📊', title: 'No data yet', sub: 'Add tasks to see category breakdown.' });
      return;
    }
    entries.forEach(([cat, count]) => {
      const row = document.createElement('div');
      row.className = 'category-bar-row';
      row.innerHTML = `
        <span class="cat-name" title="${escapeHtml(cat)}">${escapeHtml(cat)}</span>
        <span class="category-bar-track"><span class="category-bar-fill" style="width:${(count / maxCount) * 100}%"></span></span>
        <span class="cat-count">${count}</span>
      `;
      container.appendChild(row);
    });
  }

  /* ============================================================
     CATEGORY SUGGESTIONS (datalist)
     ============================================================ */
  function refreshCategorySuggestions() {
    const datalist = document.getElementById('categorySuggestions');
    const cats = [...new Set(state.tasks.map(t => t.category).filter(Boolean))];
    datalist.innerHTML = cats.map(c => `<option value="${escapeHtml(c)}"></option>`).join('');
  }

  /* ============================================================
     MASTER RENDER
     ============================================================ */
  function renderAll() {
    renderDashboard();
    renderTodayTasks();
    renderTomorrowTasks();
    renderCalendar();
    renderCalendarDayPanel();
    updateStatistics();
    refreshCategorySuggestions();
  }

  /* ============================================================
     NOTIFICATIONS
     ============================================================ */
  function requestNotificationPermission() {
    if (!('Notification' in window)) {
      showToast('Browser notifications are not supported here.', 'error');
      return;
    }
    Notification.requestPermission().then(perm => {
      state.settings.notificationsEnabled = perm === 'granted';
      saveSettings();
      updateNotifBtn();
      showToast(perm === 'granted' ? 'Notifications enabled 🔔' : 'Notifications were not allowed', perm === 'granted' ? 'success' : 'info');
    });
  }

  function updateNotifBtn() {
    const dot = document.getElementById('notifDot');
    const enabled = state.settings.notificationsEnabled && 'Notification' in window && Notification.permission === 'granted';
    dot.classList.toggle('show', !enabled);
  }

  /* ============================================================
     CLOCK
     ============================================================ */
  function tickClock() {
    const now = new Date();
    document.getElementById('sidebarDate').textContent = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    document.getElementById('sidebarTime').textContent = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    updateTomorrowCountdown();
  }

  /* ============================================================
     VIEW SWITCHING
     ============================================================ */
  function switchView(viewName) {
    document.querySelectorAll('.view').forEach(v => v.hidden = true);
    const target = document.getElementById('view-' + viewName);
    if (target) target.hidden = false;
    state.filters.currentView = viewName;
    saveFilters();

    document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });
    document.querySelectorAll('.mobile-nav-item[data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    closeSidebarMobile();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeSidebarMobile() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('show');
  }

  /* ============================================================
     TASK MODAL
     ============================================================ */
  let editingTaskId = null;

  function openTaskModal(taskId = null) {
    editingTaskId = taskId;
    const backdrop = document.getElementById('taskModalBackdrop');
    const form = document.getElementById('taskForm');
    form.reset();

    if (taskId) {
      const task = state.tasks.find(t => t.id === taskId);
      document.getElementById('taskModalTitle').textContent = 'Edit task';
      document.getElementById('taskId').value = task.id;
      document.getElementById('taskTitle').value = task.title;
      document.getElementById('taskDescription').value = task.description;
      document.getElementById('taskDueDate').value = task.dueDate;
      document.getElementById('taskPriority').value = task.priority;
      document.getElementById('taskCategory').value = task.category;
      document.getElementById('taskStatus').value = task.status;
      document.getElementById('saveTaskBtn').textContent = 'Save changes';
    } else {
      document.getElementById('taskModalTitle').textContent = 'New task';
      document.getElementById('taskId').value = '';
      document.getElementById('taskDueDate').value = todayISO();
      document.getElementById('saveTaskBtn').textContent = 'Save task';
    }

    backdrop.classList.add('open');
    setTimeout(() => document.getElementById('taskTitle').focus(), 50);
  }

  function closeTaskModal() {
    document.getElementById('taskModalBackdrop').classList.remove('open');
    editingTaskId = null;
  }

  function handleTaskFormSubmit(e) {
    e.preventDefault();
    const data = {
      title: document.getElementById('taskTitle').value,
      description: document.getElementById('taskDescription').value,
      dueDate: document.getElementById('taskDueDate').value,
      priority: document.getElementById('taskPriority').value,
      category: document.getElementById('taskCategory').value,
      status: document.getElementById('taskStatus').value,
    };

    if (!data.title.trim()) {
      showToast('Task title is required', 'error');
      return;
    }

    const id = document.getElementById('taskId').value;
    if (id) {
      editTask(id, data);
      showToast('Task updated', 'success');
    } else {
      addTask(data);
      showToast('Task added', 'success');
    }
    closeTaskModal();
    renderAll();
  }

  /* ============================================================
     DELETE CONFIRMATION
     ============================================================ */
  let pendingDeleteId = null;

  function openConfirmDelete(taskId) {
    pendingDeleteId = taskId;
    document.getElementById('confirmModalBackdrop').classList.add('open');
  }

  function closeConfirmDelete() {
    pendingDeleteId = null;
    document.getElementById('confirmModalBackdrop').classList.remove('open');
  }

  function confirmDelete() {
    if (pendingDeleteId) {
      deleteTask(pendingDeleteId);
      showToast('Task deleted', 'success');
      renderAll();
    }
    closeConfirmDelete();
  }

  /* ============================================================
     EXPORT / IMPORT
     ============================================================ */
  function exportTasks() {
    const payload = {
      exportedAt: new Date().toISOString(),
      tasks: state.tasks,
      settings: state.settings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daybook-backup-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Backup exported', 'success');
  }

  function importTasksFromFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const incoming = Array.isArray(parsed) ? parsed : parsed.tasks;
        if (!Array.isArray(incoming)) throw new Error('Invalid format');
        const existingIds = new Set(state.tasks.map(t => t.id));
        let added = 0;
        incoming.forEach(t => {
          if (t && t.title && t.dueDate) {
            const task = { ...t, id: existingIds.has(t.id) ? uid() : (t.id || uid()) };
            state.tasks.push(task);
            added++;
          }
        });
        saveTasks();
        renderAll();
        showToast(`Imported ${added} task(s)`, 'success');
      } catch (err) {
        console.error(err);
        showToast('Import failed — invalid JSON file', 'error');
      }
    };
    reader.readAsText(file);
  }

  /* ============================================================
     THEME
     ============================================================ */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.getElementById('themeIconSun').style.display = theme === 'dark' ? 'none' : 'block';
    document.getElementById('themeIconMoon').style.display = theme === 'dark' ? 'block' : 'none';
  }

  function toggleTheme() {
    state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
    saveSettings();
    applyTheme(state.settings.theme);
  }

  /* ============================================================
     EVENT BINDING
     ============================================================ */
  function bindEvents() {
    // Nav (sidebar + mobile)
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });
    document.querySelectorAll('[data-goto]').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.goto));
    });

    // Sidebar filters
    document.querySelectorAll('.filter-item').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.filters.sidebarFilter = btn.dataset.filter;
        saveFilters();
        renderAll();
      });
    });

    // Today view priority/status chips
    document.querySelectorAll('#priorityFilterToday .chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#priorityFilterToday .chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.filters.todayPriority = chip.dataset.priority;
        saveFilters();
        renderTodayTasks();
      });
    });
    document.querySelectorAll('#statusFilterToday .chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#statusFilterToday .chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.filters.todayStatus = chip.dataset.status;
        saveFilters();
        renderTodayTasks();
      });
    });

    // Search
    const debouncedSearch = debounce((val) => searchTasks(val), 200);
    document.getElementById('searchInput').addEventListener('input', (e) => debouncedSearch(e.target.value));

    // Add task buttons
    document.getElementById('openAddTask').addEventListener('click', () => openTaskModal());
    document.getElementById('mobileAddTask').addEventListener('click', () => openTaskModal());

    // Task modal
    document.getElementById('closeTaskModal').addEventListener('click', closeTaskModal);
    document.getElementById('cancelTaskBtn').addEventListener('click', closeTaskModal);
    document.getElementById('taskForm').addEventListener('submit', handleTaskFormSubmit);
    document.getElementById('taskModalBackdrop').addEventListener('click', (e) => {
      if (e.target.id === 'taskModalBackdrop') closeTaskModal();
    });

    // Enter-to-save inside text/select fields (not textarea, to allow line breaks)
    document.querySelectorAll('#taskForm input, #taskForm select').forEach(el => {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          document.getElementById('taskForm').requestSubmit();
        }
      });
    });

    // Delete confirmation
    document.getElementById('cancelDeleteBtn').addEventListener('click', closeConfirmDelete);
    document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDelete);
    document.getElementById('confirmModalBackdrop').addEventListener('click', (e) => {
      if (e.target.id === 'confirmModalBackdrop') closeConfirmDelete();
    });

    // Escape key closes modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeTaskModal();
        closeConfirmDelete();
      }
    });

    // Theme
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);

    // Notifications
    document.getElementById('notifBtn').addEventListener('click', requestNotificationPermission);

    // Export / Import
    document.getElementById('exportBtn').addEventListener('click', exportTasks);
    document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
    document.getElementById('importFile').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) importTasksFromFile(file);
      e.target.value = '';
    });

    // Calendar nav
    document.getElementById('calPrev').addEventListener('click', () => {
      state.calendar.viewMonth--;
      if (state.calendar.viewMonth < 0) { state.calendar.viewMonth = 11; state.calendar.viewYear--; }
      renderCalendar();
    });
    document.getElementById('calNext').addEventListener('click', () => {
      state.calendar.viewMonth++;
      if (state.calendar.viewMonth > 11) { state.calendar.viewMonth = 0; state.calendar.viewYear++; }
      renderCalendar();
    });
    document.getElementById('calToday').addEventListener('click', () => {
      const now = new Date();
      state.calendar.viewYear = now.getFullYear();
      state.calendar.viewMonth = now.getMonth();
      state.calendar.selectedDate = todayISO();
      renderCalendar();
      renderCalendarDayPanel();
    });

    // Mobile sidebar toggle
    document.getElementById('navToggle').addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      if (sidebar.classList.contains('open')) {
        closeSidebarMobile();
      } else {
        sidebar.classList.add('open');
        document.getElementById('sidebarOverlay').classList.add('show');
      }
    });
    document.getElementById('sidebarOverlay').addEventListener('click', closeSidebarMobile);
  }

  /* ============================================================
     INIT
     ============================================================ */
  function init() {
    loadTasks();
    loadSettings();
    loadFilters();

    applyTheme(state.settings.theme);
    updateNotifBtn();
    bindEvents();

    state.calendar.selectedDate = todayISO();

    // Restore last view
    switchView(state.filters.currentView || 'dashboard');
    // Restore last sidebar filter UI state
    document.querySelectorAll('.filter-item').forEach(b => {
      b.classList.toggle('active', b.dataset.filter === state.filters.sidebarFilter);
    });
    document.getElementById('searchInput').value = state.filters.searchTerm || '';

    renderAll();
    tickClock();
    setInterval(tickClock, 1000);
  }

  document.addEventListener('DOMContentLoaded', init);

})();
