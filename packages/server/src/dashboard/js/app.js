/**
 * app.js — Main SPA logic for the Claude Code Limiter dashboard.
 * Hash-based routing, API client, page renderers, event delegation.
 */
(function () {
  'use strict';

  /* ================================================================
     STATE
     ================================================================ */
  var state = {
    token: localStorage.getItem('clm_token') || null,
    team: null,
    users: [],
    events: [],         // live feed events
    refreshTimer: null,
    currentRoute: null,
  };

  /* ================================================================
     API CLIENT
     ================================================================ */
  var API = {
    /** @param {string} path @param {object} [opts] @returns {Promise<object>} */
    _fetch: function (path, opts) {
      opts = opts || {};
      var headers = { 'Content-Type': 'application/json' };
      if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
      return fetch(path, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      }).then(function (res) {
        if (res.status === 401) {
          state.token = null;
          localStorage.removeItem('clm_token');
          navigate('login');
          return Promise.reject(new Error('Session expired'));
        }
        return res.json().then(function (data) {
          if (!res.ok) return Promise.reject(new Error(data.error || 'Request failed'));
          return data;
        });
      });
    },

    login: function (password) {
      return API._fetch('/api/admin/login', { method: 'POST', body: { password: password } });
    },

    getUsers: function () {
      return API._fetch('/api/admin/users');
    },

    getUser: function (id) {
      return API._fetch('/api/admin/users').then(function (data) {
        var user = null;
        for (var i = 0; i < data.users.length; i++) {
          if (data.users[i].id === id) { user = data.users[i]; break; }
        }
        if (!user) return Promise.reject(new Error('User not found'));
        return user;
      });
    },

    createUser: function (body) {
      return API._fetch('/api/admin/users', { method: 'POST', body: body });
    },

    updateUser: function (id, body) {
      return API._fetch('/api/admin/users/' + id, { method: 'PUT', body: body });
    },

    deleteUser: function (id) {
      return API._fetch('/api/admin/users/' + id, { method: 'DELETE' });
    },

    getUsage: function (params) {
      var qs = '';
      if (params) {
        var parts = [];
        for (var k in params) {
          if (params[k] != null) parts.push(k + '=' + encodeURIComponent(params[k]));
        }
        qs = '?' + parts.join('&');
      }
      return API._fetch('/api/admin/usage' + qs);
    },

    getEvents: function (params) {
      var qs = '';
      if (params) {
        var parts = [];
        for (var k in params) {
          if (params[k] != null) parts.push(k + '=' + encodeURIComponent(params[k]));
        }
        qs = '?' + parts.join('&');
      }
      return API._fetch('/api/admin/events' + qs);
    },

    updateSettings: function (body) {
      return API._fetch('/api/admin/settings', { method: 'PUT', body: body });
    },
  };

  /* ================================================================
     TOAST NOTIFICATIONS
     ================================================================ */
  var toastCounter = 0;

  /**
   * Show a toast notification.
   * @param {string} title
   * @param {string} message
   * @param {'info'|'success'|'warning'|'error'} [type]
   * @param {number} [duration] - ms, default 5000
   */
  function showToast(title, message, type, duration) {
    type = type || 'info';
    duration = duration || 5000;
    var id = 'toast-' + (++toastCounter);
    var icons = { info: '\u2139\uFE0F', success: '\u2705', warning: '\u26A0\uFE0F', error: '\u274C' };

    var container = document.getElementById('toast-container');
    var el = document.createElement('div');
    el.className = 'toast toast-' + type;
    el.id = id;
    el.innerHTML =
      '<span class="toast-icon">' + (icons[type] || '') + '</span>' +
      '<div class="toast-body">' +
        '<div class="toast-title">' + escapeHtml(title) + '</div>' +
        '<div class="toast-message">' + escapeHtml(message) + '</div>' +
      '</div>' +
      '<button class="toast-close" data-toast-close="' + id + '">&times;</button>';
    container.appendChild(el);

    var removeTimer = setTimeout(function () { removeToast(id); }, duration);

    el.querySelector('.toast-close').addEventListener('click', function () {
      clearTimeout(removeTimer);
      removeToast(id);
    });
  }

  function removeToast(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.add('removing');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 250);
  }

  /* ================================================================
     CONFIRM DIALOG
     ================================================================ */
  /**
   * Show a confirm dialog. Returns a Promise that resolves true/false.
   * @param {string} title
   * @param {string} message
   * @param {string} [okLabel]
   * @returns {Promise<boolean>}
   */
  function confirmDialog(title, message, okLabel) {
    return new Promise(function (resolve) {
      var overlay = document.getElementById('confirm-overlay');
      document.getElementById('confirm-title').textContent = title;
      document.getElementById('confirm-message').textContent = message;
      var okBtn = document.getElementById('confirm-ok');
      okBtn.textContent = okLabel || 'Confirm';
      overlay.classList.remove('hidden');

      function cleanup(result) {
        overlay.classList.add('hidden');
        document.getElementById('confirm-cancel').removeEventListener('click', onCancel);
        okBtn.removeEventListener('click', onOk);
        resolve(result);
      }
      function onCancel() { cleanup(false); }
      function onOk() { cleanup(true); }

      document.getElementById('confirm-cancel').addEventListener('click', onCancel);
      okBtn.addEventListener('click', onOk);
    });
  }

  /* ================================================================
     MODAL HELPERS
     ================================================================ */
  function openModal(html) {
    var overlay = document.getElementById('modal-overlay');
    document.getElementById('modal-content').innerHTML = html;
    overlay.classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('modal-content').innerHTML = '';
  }

  /* ================================================================
     COPY TO CLIPBOARD
     ================================================================ */
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        showToast('Copied', 'Command copied to clipboard', 'success', 2500);
      }).catch(function () {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast('Copied', 'Command copied to clipboard', 'success', 2500);
    } catch (e) {
      showToast('Error', 'Could not copy to clipboard', 'error');
    }
    document.body.removeChild(ta);
  }

  /* ================================================================
     UTILITY HELPERS
     ================================================================ */
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function timeAgo(dateStr) {
    if (!dateStr) return 'never';
    var d = new Date(dateStr);
    var now = Date.now();
    var diff = now - d.getTime();
    if (diff < 0) return 'just now';
    var seconds = Math.floor(diff / 1000);
    if (seconds < 60) return seconds + 's ago';
    var minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + 'm ago';
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + 'h ago';
    var days = Math.floor(hours / 24);
    return days + 'd ago';
  }

  function formatTime(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    var h = d.getHours();
    var m = d.getMinutes();
    var s = d.getSeconds();
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  /** Generate a deterministic color from a string (for avatars). */
  function hashColor(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    var hues = [210, 150, 340, 40, 280, 180, 20, 100, 300, 60];
    var hue = hues[Math.abs(hash) % hues.length];
    return 'hsl(' + hue + ', 60%, 55%)';
  }

  function initials(name) {
    if (!name) return '?';
    var parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function statusBadge(status) {
    var cls = 'badge badge-' + (status || 'active');
    return '<span class="' + cls + '">' + escapeHtml(status || 'active') + '</span>';
  }

  /** Get a usage percentage for progress bars. */
  function usagePct(used, limit) {
    if (limit <= 0) return 0;
    var p = used / limit;
    return p > 1 ? 1 : p;
  }

  function progressClass(pct) {
    if (pct >= 0.9) return 'progress-fill-danger';
    if (pct >= 0.7) return 'progress-fill-warn';
    return 'progress-fill-ok';
  }

  function renderProgressBar(label, used, limit, large) {
    var pct = limit > 0 ? usagePct(used, limit) : 0;
    var cls = progressClass(pct);
    var barCls = large ? 'progress-bar progress-bar-lg' : 'progress-bar';
    var valStr = used + (limit > 0 ? ' / ' + limit : (limit === -1 ? ' / unlimited' : ''));
    return (
      '<div class="progress-row">' +
        '<div class="progress-label">' +
          '<span class="progress-label-name">' + escapeHtml(label) + '</span>' +
          '<span class="progress-label-value">' + valStr + '</span>' +
        '</div>' +
        '<div class="' + barCls + '">' +
          '<div class="progress-fill ' + cls + '" style="width:' + (pct * 100).toFixed(1) + '%"></div>' +
        '</div>' +
      '</div>'
    );
  }

  /** Extract the per-model limit value for a given model and window from a user's limits array. */
  function getModelLimit(limits, model, windowType) {
    windowType = windowType || 'daily';
    for (var i = 0; i < limits.length; i++) {
      var r = limits[i];
      if (r.type === 'per_model' && r.model === model && r.window === windowType) return r.value;
    }
    return -1; // unlimited
  }

  function getCreditRule(limits) {
    for (var i = 0; i < limits.length; i++) {
      if (limits[i].type === 'credits') return limits[i];
    }
    return null;
  }

  /* ================================================================
     ROUTER
     ================================================================ */
  function getRoute() {
    var hash = location.hash.replace(/^#\/?/, '');
    if (!hash) return { page: 'overview', params: {} };
    var parts = hash.split('/');
    var page = parts[0];
    var params = {};
    if (page === 'user' && parts[1]) params.id = parts[1];
    return { page: page, params: params };
  }

  function navigate(page, params) {
    var hash = '#' + page;
    if (params && params.id) hash += '/' + params.id;
    location.hash = hash;
  }

  function handleRoute() {
    var route = getRoute();
    state.currentRoute = route;

    // Auth gate
    if (!state.token && route.page !== 'login') {
      navigate('login');
      return;
    }
    if (state.token && route.page === 'login') {
      navigate('overview');
      return;
    }

    // Show/hide screens
    var loginScreen = document.getElementById('login-screen');
    var appShell = document.getElementById('app-shell');

    if (route.page === 'login') {
      loginScreen.classList.remove('hidden');
      appShell.classList.add('hidden');
      stopAutoRefresh();
      WS.disconnect();
      return;
    }

    loginScreen.classList.add('hidden');
    appShell.classList.remove('hidden');

    // Connect WS if not connected
    if (!WS.isConnected()) WS.connect();

    // Update sidebar active state
    var links = document.querySelectorAll('.nav-link');
    for (var i = 0; i < links.length; i++) {
      var linkPage = links[i].getAttribute('data-page');
      if (linkPage === route.page || (linkPage === 'users' && route.page === 'user')) {
        links[i].classList.add('active');
      } else {
        links[i].classList.remove('active');
      }
    }

    // Close mobile sidebar
    closeMobileSidebar();

    // Render the page
    renderPage(route);
  }

  function renderPage(route) {
    var content = document.getElementById('content');
    content.innerHTML = '<div class="spinner"></div>';

    switch (route.page) {
      case 'overview':
      case 'users':
        renderOverview(content);
        break;
      case 'user':
        renderUserDetail(content, route.params.id);
        break;
      case 'settings':
        renderSettings(content);
        break;
      default:
        content.innerHTML = '<div class="empty-state"><p>Page not found</p></div>';
    }
  }

  /* ================================================================
     PAGE: OVERVIEW / USERS
     ================================================================ */
  function renderOverview(container) {
    Promise.all([API.getUsers(), API.getEvents({ limit: 30 })])
      .then(function (results) {
        var usersData = results[0];
        var eventsData = results[1];
        state.users = usersData.users;

        var users = usersData.users;
        var events = eventsData.events || [];

        // Stats
        var totalUsers = users.length;
        var activeUsers = users.filter(function (u) { return u.status === 'active'; }).length;
        var pausedUsers = users.filter(function (u) { return u.status === 'paused'; }).length;
        var killedUsers = users.filter(function (u) { return u.status === 'killed'; }).length;
        var totalCreditsUsed = 0;
        var totalCreditBudget = 0;
        for (var ci = 0; ci < users.length; ci++) {
          if (users[ci].credit_budget && users[ci].credit_budget > 0) {
            totalCreditsUsed += (users[ci].credit_budget - (users[ci].credit_balance || 0));
            totalCreditBudget += users[ci].credit_budget;
          }
        }

        var html = '';
        html += '<div class="page-header">';
        html += '  <h2>Overview</h2>';
        html += '  <div class="page-header-actions">';
        html += '    <button class="btn btn-primary" data-action="add-user">+ Add User</button>';
        html += '  </div>';
        html += '</div>';

        // Stats row
        html += '<div class="stats-row">';
        html += statCard('Total Users', totalUsers, '');
        html += statCard('Active', activeUsers, '', 'text-green');
        html += statCard('Paused', pausedUsers, '', 'text-yellow');
        html += statCard('Killed', killedUsers, '', 'text-red');
        html += '</div>';

        // Two column: user cards + live feed
        html += '<div class="two-col">';

        // User cards
        html += '<div>';
        html += '<div class="card mb-2"><div class="card-header"><h3>Users</h3></div>';
        if (users.length === 0) {
          html += '<div class="card-body"><div class="empty-state"><p>No users yet. Click "Add User" to get started.</p></div></div>';
        } else {
          html += '<div class="card-body"><div class="user-grid" style="margin-bottom:0">';
          for (var i = 0; i < users.length; i++) {
            html += renderUserCard(users[i]);
          }
          html += '</div></div>';
        }
        html += '</div></div>';

        // Live feed
        html += '<div>';
        html += '<div class="card"><div class="card-header"><h3>Live Feed</h3></div>';
        html += '<div class="card-body-flush"><div class="live-feed" id="live-feed">';
        if (events.length === 0) {
          html += '<div class="feed-empty">No events yet. Activity will appear here in real time.</div>';
        } else {
          for (var j = 0; j < events.length; j++) {
            html += renderFeedItem(eventToFeed(events[j]));
          }
        }
        html += '</div></div></div>';
        html += '</div>';

        html += '</div>'; // .two-col

        container.innerHTML = html;
        startAutoRefresh();
      })
      .catch(function (err) {
        container.innerHTML = '<div class="empty-state"><p>Failed to load data: ' + escapeHtml(err.message) + '</p></div>';
      });
  }

  function statCard(label, value, sub, colorClass) {
    return (
      '<div class="stat-card">' +
        '<div class="stat-label">' + escapeHtml(label) + '</div>' +
        '<div class="stat-value ' + (colorClass || '') + '">' + escapeHtml(String(value)) + '</div>' +
        (sub ? '<div class="stat-sub">' + escapeHtml(sub) + '</div>' : '') +
      '</div>'
    );
  }

  function renderUserCard(user) {
    var limits = user.limits || [];
    var usage = user.usage || {};
    var dailyUsage = (usage.daily && usage.daily.counts) ? usage.daily.counts : {};

    // Primary progress: credit budget or total daily prompts
    var progressHtml = '';
    var creditRule = getCreditRule(limits);
    if (creditRule && user.credit_budget > 0) {
      var creditUsed = user.credit_budget - (user.credit_balance || 0);
      progressHtml += renderProgressBar('Credits', creditUsed, user.credit_budget, false);
    }

    // Per-model bars
    var models = ['opus', 'sonnet', 'haiku'];
    for (var mi = 0; mi < models.length; mi++) {
      var m = models[mi];
      var mLimit = getModelLimit(limits, m);
      var mUsed = dailyUsage[m] || 0;
      if (mLimit > 0 || mUsed > 0) {
        progressHtml += renderProgressBar(m, mUsed, mLimit > 0 ? mLimit : 0, false);
      }
    }
    if (!progressHtml) {
      progressHtml = '<div class="text-muted text-sm">No limits configured</div>';
    }

    var color = hashColor(user.name || user.slug);

    return (
      '<div class="user-card" data-action="view-user" data-user-id="' + user.id + '">' +
        '<div class="user-card-head">' +
          '<div class="user-card-info">' +
            '<div class="user-avatar" style="background:' + color + '">' + initials(user.name) + '</div>' +
            '<div>' +
              '<div class="user-card-name">' + escapeHtml(user.name) + '</div>' +
              '<div class="user-card-slug">@' + escapeHtml(user.slug) + '</div>' +
            '</div>' +
          '</div>' +
          statusBadge(user.status) +
        '</div>' +
        '<div class="user-card-usage">' + progressHtml + '</div>' +
        '<div class="user-card-actions">' +
          (user.status === 'active'
            ? '<button class="btn btn-sm btn-warning" data-action="pause-user" data-user-id="' + user.id + '" data-user-name="' + escapeHtml(user.name) + '">Pause</button>'
              + '<button class="btn btn-sm btn-danger" data-action="kill-user" data-user-id="' + user.id + '" data-user-name="' + escapeHtml(user.name) + '">Kill</button>'
            : user.status === 'paused'
            ? '<button class="btn btn-sm btn-success" data-action="reinstate-user" data-user-id="' + user.id + '" data-user-name="' + escapeHtml(user.name) + '">Reinstate</button>'
              + '<button class="btn btn-sm btn-danger" data-action="kill-user" data-user-id="' + user.id + '" data-user-name="' + escapeHtml(user.name) + '">Kill</button>'
            : '<button class="btn btn-sm btn-success" data-action="reinstate-user" data-user-id="' + user.id + '" data-user-name="' + escapeHtml(user.name) + '">Reinstate</button>'
          ) +
        '</div>' +
      '</div>'
    );
  }

  /* ================================================================
     LIVE FEED HELPERS
     ================================================================ */
  /** Convert a usage_event DB row into a feed display object. */
  function eventToFeed(evt) {
    return {
      type: 'counted',
      user: evt.user_name || evt.userName || 'Unknown',
      detail: evt.model + ' (+' + evt.credit_cost + ' credits)',
      time: evt.timestamp,
    };
  }

  /** Convert a WebSocket event into a feed display object. */
  function wsEventToFeed(evt) {
    switch (evt.type) {
      case 'user_check':
        return { type: 'check', user: evt.userName, detail: 'Checking ' + (evt.model || ''), time: evt.timestamp };
      case 'user_blocked':
        return { type: 'blocked', user: evt.userName, detail: 'Blocked on ' + (evt.model || '') + (evt.reason ? ': ' + evt.reason.split('\n')[0] : ''), time: evt.timestamp };
      case 'user_counted':
        return { type: 'counted', user: evt.userName, detail: (evt.model || '') + ' (+' + (evt.creditCost || 0) + ' credits)', time: evt.timestamp };
      case 'user_status_change':
      case 'user_killed':
        return { type: 'status', user: evt.userName, detail: (evt.oldStatus || '?') + ' -> ' + (evt.newStatus || '?'), time: evt.timestamp };
      case 'user_status':
        return { type: 'check', user: evt.userName, detail: 'Session start (' + (evt.model || '') + ')', time: evt.timestamp };
      default:
        return null;
    }
  }

  function renderFeedItem(feed) {
    if (!feed) return '';
    var dotCls = 'feed-dot feed-dot-' + (feed.type || 'system');
    return (
      '<div class="feed-item">' +
        '<span class="' + dotCls + '"></span>' +
        '<div class="feed-content">' +
          '<span class="feed-user">' + escapeHtml(feed.user) + '</span> ' +
          '<span class="feed-detail">' + escapeHtml(feed.detail) + '</span>' +
        '</div>' +
        '<span class="feed-time">' + formatTime(feed.time) + '</span>' +
      '</div>'
    );
  }

  function addLiveFeedItem(feed) {
    var feedEl = document.getElementById('live-feed');
    if (!feedEl) return;

    // Remove empty state message if present
    var empty = feedEl.querySelector('.feed-empty');
    if (empty) empty.remove();

    var div = document.createElement('div');
    div.innerHTML = renderFeedItem(feed);
    var newItem = div.firstElementChild;
    if (newItem) {
      feedEl.insertBefore(newItem, feedEl.firstChild);
      // Keep feed to 50 items max
      while (feedEl.children.length > 50) {
        feedEl.removeChild(feedEl.lastChild);
      }
    }
  }

  /* ================================================================
     PAGE: USER DETAIL
     ================================================================ */
  function renderUserDetail(container, userId) {
    Promise.all([API.getUser(userId), API.getUsage({ user_id: userId, days: 30 }), API.getEvents({ user_id: userId, limit: 20 })])
      .then(function (results) {
        var user = results[0];
        var usageData = results[1];
        var eventsData = results[2];
        var limits = user.limits || [];
        var usage = user.usage || {};
        var dailyUsage = (usage.daily && usage.daily.counts) ? usage.daily.counts : {};
        var color = hashColor(user.name || user.slug);

        var html = '';
        // Breadcrumb
        html += '<div class="breadcrumb"><a href="#overview">Overview</a> / <span>' + escapeHtml(user.name) + '</span></div>';
        html += '<div class="page-header"><h2>' + escapeHtml(user.name) + '</h2>';
        html += '<div class="page-header-actions">';
        html += '<button class="btn btn-sm" data-action="edit-limits" data-user-id="' + user.id + '">Edit Limits</button>';
        html += '<button class="btn btn-sm btn-danger" data-action="delete-user" data-user-id="' + user.id + '" data-user-name="' + escapeHtml(user.name) + '">Delete User</button>';
        html += '</div></div>';

        html += '<div class="detail-grid">';

        // Left sidebar card
        html += '<div class="card"><div class="card-body detail-sidebar-card">';
        html += '<div class="detail-avatar" style="background:' + color + '">' + initials(user.name) + '</div>';
        html += '<div class="detail-name">' + escapeHtml(user.name) + '</div>';
        html += '<div class="detail-meta">@' + escapeHtml(user.slug) + '</div>';
        html += statusBadge(user.status);
        html += '<div class="detail-meta">Last seen: ' + timeAgo(user.last_seen) + '</div>';
        html += '<div class="detail-meta">Created: ' + (user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A') + '</div>';
        html += '<div class="detail-actions">';
        if (user.status === 'active') {
          html += '<button class="btn btn-sm btn-warning btn-block" data-action="pause-user" data-user-id="' + user.id + '" data-user-name="' + escapeHtml(user.name) + '">Pause User</button>';
          html += '<button class="btn btn-sm btn-danger btn-block" data-action="kill-user" data-user-id="' + user.id + '" data-user-name="' + escapeHtml(user.name) + '">Kill User</button>';
        } else if (user.status === 'paused') {
          html += '<button class="btn btn-sm btn-success btn-block" data-action="reinstate-user" data-user-id="' + user.id + '" data-user-name="' + escapeHtml(user.name) + '">Reinstate</button>';
          html += '<button class="btn btn-sm btn-danger btn-block" data-action="kill-user" data-user-id="' + user.id + '" data-user-name="' + escapeHtml(user.name) + '">Kill User</button>';
        } else {
          html += '<button class="btn btn-sm btn-success btn-block" data-action="reinstate-user" data-user-id="' + user.id + '" data-user-name="' + escapeHtml(user.name) + '">Reinstate</button>';
        }
        html += '</div>';

        // Credit gauge
        var creditRule = getCreditRule(limits);
        if (creditRule && user.credit_budget > 0) {
          html += '<div class="gauge-wrap"><canvas id="credit-gauge" width="180" height="180"></canvas></div>';
        }

        html += '</div></div>'; // card

        // Right content area
        html += '<div>';

        // Per-model usage bars
        html += '<div class="card mb-2"><div class="card-header"><h3>Per-Model Usage (Daily)</h3></div>';
        html += '<div class="card-body"><div class="chart-container"><canvas id="model-bars"></canvas></div></div>';
        html += '</div>';

        // Active limits
        html += '<div class="card mb-2"><div class="card-header"><h3>Active Limits</h3>';
        html += '<button class="btn btn-sm" data-action="edit-limits" data-user-id="' + user.id + '">Edit</button>';
        html += '</div>';
        html += '<div class="card-body">';
        if (limits.length === 0) {
          html += '<div class="text-muted text-sm">No limits configured. This user has unlimited access.</div>';
        } else {
          html += '<ul class="limits-list">';
          for (var li = 0; li < limits.length; li++) {
            html += renderLimitItem(limits[li]);
          }
          html += '</ul>';
        }
        html += '</div></div>';

        // 30-day trend
        html += '<div class="card mb-2"><div class="card-header"><h3>30-Day Usage Trend</h3></div>';
        html += '<div class="card-body"><div class="chart-container"><canvas id="trend-chart"></canvas></div></div>';
        html += '</div>';

        // Recent events
        html += '<div class="card"><div class="card-header"><h3>Recent Activity</h3></div>';
        html += '<div class="card-body-flush"><div class="table-wrap"><table>';
        html += '<thead><tr><th>Time</th><th>Model</th><th>Credits</th></tr></thead><tbody>';
        var events = eventsData.events || [];
        if (events.length === 0) {
          html += '<tr><td colspan="3" class="text-center text-muted">No recent activity</td></tr>';
        } else {
          for (var ei = 0; ei < events.length; ei++) {
            var ev = events[ei];
            html += '<tr>';
            html += '<td class="text-mono text-sm">' + timeAgo(ev.timestamp) + '</td>';
            html += '<td><span class="badge badge-model">' + escapeHtml(ev.model) + '</span></td>';
            html += '<td class="text-mono">' + ev.credit_cost + '</td>';
            html += '</tr>';
          }
        }
        html += '</tbody></table></div></div></div>';

        html += '</div>'; // right column
        html += '</div>'; // detail-grid

        container.innerHTML = html;

        // Render charts after DOM is ready
        requestAnimationFrame(function () {
          // Credit gauge
          if (creditRule && user.credit_budget > 0) {
            var gaugeCanvas = document.getElementById('credit-gauge');
            if (gaugeCanvas) {
              var creditUsed = user.credit_budget - (user.credit_balance || 0);
              Charts.creditGauge(gaugeCanvas, creditUsed, user.credit_budget);
            }
          }

          // Horizontal bars
          var barsCanvas = document.getElementById('model-bars');
          if (barsCanvas) {
            var barData = [];
            var models = ['opus', 'sonnet', 'haiku'];
            for (var b = 0; b < models.length; b++) {
              var mdl = models[b];
              var used = dailyUsage[mdl] || 0;
              var lim = getModelLimit(limits, mdl);
              barData.push({ label: mdl.charAt(0).toUpperCase() + mdl.slice(1), value: used, limit: lim > 0 ? lim : 0 });
            }
            Charts.horizontalBar(barsCanvas, barData);
          }

          // Trend line
          var trendCanvas = document.getElementById('trend-chart');
          if (trendCanvas && usageData.daily) {
            var dayMap = {};
            for (var di = 0; di < usageData.daily.length; di++) {
              var row = usageData.daily[di];
              dayMap[row.day] = (dayMap[row.day] || 0) + row.count;
            }
            var trendPts = [];
            var today = new Date();
            for (var td = 29; td >= 0; td--) {
              var d = new Date(today);
              d.setDate(d.getDate() - td);
              var key = d.toISOString().split('T')[0];
              trendPts.push({ day: key, value: dayMap[key] || 0 });
            }
            Charts.trendLine(trendCanvas, trendPts);
          }
        });

        startAutoRefresh();
      })
      .catch(function (err) {
        container.innerHTML = '<div class="empty-state"><p>Failed to load user: ' + escapeHtml(err.message) + '</p><a href="#overview">Back to overview</a></div>';
      });
  }

  function renderLimitItem(rule) {
    var desc = '';
    if (rule.type === 'credits') {
      desc = 'Credit Budget (' + (rule.window || 'daily') + ')';
    } else if (rule.type === 'per_model') {
      desc = (rule.model || 'all models') + ' (' + (rule.window || 'daily') + ')';
    } else if (rule.type === 'time_of_day') {
      desc = (rule.model || 'all') + ' time restriction';
    }

    var valStr = '';
    if (rule.type === 'time_of_day') {
      valStr = (rule.schedule_start || '?') + ' - ' + (rule.schedule_end || '?') + ' ' + (rule.schedule_tz || '');
    } else {
      valStr = rule.value === -1 ? 'unlimited' : (rule.value === 0 ? 'blocked' : String(rule.value));
    }

    return (
      '<li class="limit-item">' +
        '<div class="limit-type">' +
          '<span class="badge badge-model">' + escapeHtml(rule.type) + '</span>' +
          '<span>' + escapeHtml(desc) + '</span>' +
        '</div>' +
        '<span class="limit-value">' + escapeHtml(valStr) + '</span>' +
      '</li>'
    );
  }

  /* ================================================================
     PAGE: SETTINGS
     ================================================================ */
  function renderSettings(container) {
    // We need team info. Fetch users to get the team context, or read from state.
    // The login response stores team info in state.team.
    if (!state.team) {
      container.innerHTML = '<div class="spinner"></div>';
      // Try getting users to refresh state
      API.getUsers().then(function () {
        renderSettingsInner(container);
      }).catch(function (err) {
        container.innerHTML = '<div class="empty-state"><p>Failed to load settings: ' + escapeHtml(err.message) + '</p></div>';
      });
    } else {
      renderSettingsInner(container);
    }
  }

  function renderSettingsInner(container) {
    var team = state.team || { name: 'Team', credit_weights: { opus: 10, sonnet: 3, haiku: 1 } };
    var cw = team.credit_weights || { opus: 10, sonnet: 3, haiku: 1 };

    var html = '';
    html += '<div class="page-header"><h2>Settings</h2></div>';

    // Team name
    html += '<div class="card mb-2"><div class="card-body">';
    html += '<div class="settings-section">';
    html += '<h3>Team Name</h3>';
    html += '<div class="form-group">';
    html += '<input type="text" id="settings-team-name" value="' + escapeHtml(team.name) + '" placeholder="Team name">';
    html += '</div>';
    html += '<button class="btn btn-primary btn-sm" data-action="save-team-name">Save Name</button>';
    html += '</div>';
    html += '</div></div>';

    // Credit Weights
    html += '<div class="card mb-2"><div class="card-body">';
    html += '<div class="settings-section">';
    html += '<h3>Credit Weights</h3>';
    html += '<p class="text-muted text-sm mb-2">Define how many credits each model costs per turn. Higher weight = more expensive.</p>';
    html += '<div class="weight-grid">';
    var models = ['opus', 'sonnet', 'haiku'];
    for (var i = 0; i < models.length; i++) {
      var m = models[i];
      html += '<div class="weight-card">';
      html += '<div class="weight-model">' + m + '</div>';
      html += '<input type="number" id="weight-' + m + '" min="0" value="' + (cw[m] || 0) + '">';
      html += '</div>';
    }
    html += '</div>';
    html += '<div class="mt-2"><button class="btn btn-primary btn-sm" data-action="save-weights">Save Weights</button></div>';
    html += '</div>';
    html += '</div></div>';

    // Change Password
    html += '<div class="card mb-2"><div class="card-body">';
    html += '<div class="settings-section">';
    html += '<h3>Change Admin Password</h3>';
    html += '<div class="form-row">';
    html += '<div class="form-group"><label for="settings-new-pw">New Password</label>';
    html += '<input type="password" id="settings-new-pw" placeholder="New password"></div>';
    html += '<div class="form-group"><label for="settings-confirm-pw">Confirm Password</label>';
    html += '<input type="password" id="settings-confirm-pw" placeholder="Confirm password"></div>';
    html += '</div>';
    html += '<button class="btn btn-danger btn-sm" data-action="change-password">Change Password</button>';
    html += '</div>';
    html += '</div></div>';

    container.innerHTML = html;
  }

  /* ================================================================
     MODAL: ADD USER
     ================================================================ */
  function openAddUserModal() {
    var html = '';
    html += '<div class="modal-header"><h3>Add User</h3><button class="modal-close" data-action="close-modal">&times;</button></div>';
    html += '<div class="modal-body">';

    html += '<div class="form-group"><label for="new-user-name">Name</label>';
    html += '<input type="text" id="new-user-name" placeholder="e.g. Alice, Dev Team, Intern"></div>';

    html += '<div class="form-group"><label for="new-user-slug">Slug (username)</label>';
    html += '<input type="text" id="new-user-slug" placeholder="e.g. alice, dev-team, intern">';
    html += '<p class="form-hint">Lowercase, no spaces. Used in install commands and logs.</p></div>';

    html += '<hr class="section-divider">';
    html += '<h4 class="mb-1">Limits Preset</h4>';
    html += '<div class="presets-row">';
    html += '<button class="preset-btn selected" data-preset="light">Light</button>';
    html += '<button class="preset-btn" data-preset="medium">Medium</button>';
    html += '<button class="preset-btn" data-preset="heavy">Heavy</button>';
    html += '<button class="preset-btn" data-preset="unlimited">Unlimited</button>';
    html += '<button class="preset-btn" data-preset="custom">Custom</button>';
    html += '</div>';

    html += '<div id="preset-description" class="text-muted text-sm mb-2">50 credits/day. Opus: 3, Sonnet: 10, Haiku: 30.</div>';

    // Custom limits form (hidden by default)
    html += '<div id="custom-limits-form" class="hidden">';
    html += '<div class="form-group"><label>Credit Budget (daily)</label>';
    html += '<input type="number" id="custom-credits" min="-1" value="100" placeholder="-1 for unlimited"></div>';
    html += '<div class="form-row-3">';
    html += '<div class="form-group"><label>Opus (daily)</label>';
    html += '<input type="number" id="custom-opus" min="-1" value="5"></div>';
    html += '<div class="form-group"><label>Sonnet (daily)</label>';
    html += '<input type="number" id="custom-sonnet" min="-1" value="20"></div>';
    html += '<div class="form-group"><label>Haiku (daily)</label>';
    html += '<input type="number" id="custom-haiku" min="-1" value="50"></div>';
    html += '</div>';
    html += '</div>';

    html += '</div>'; // modal-body
    html += '<div class="modal-footer">';
    html += '<button class="btn btn-ghost" data-action="close-modal">Cancel</button>';
    html += '<button class="btn btn-primary" data-action="submit-add-user">Create User</button>';
    html += '</div>';

    openModal(html);

    // Auto-generate slug from name
    var nameInput = document.getElementById('new-user-name');
    var slugInput = document.getElementById('new-user-slug');
    if (nameInput && slugInput) {
      nameInput.addEventListener('input', function () {
        slugInput.value = nameInput.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      });
    }
  }

  var PRESETS = {
    light:     { credits: 50,  opus: 3,  sonnet: 10, haiku: 30, desc: '50 credits/day. Opus: 3, Sonnet: 10, Haiku: 30.' },
    medium:    { credits: 100, opus: 5,  sonnet: 20, haiku: 50, desc: '100 credits/day. Opus: 5, Sonnet: 20, Haiku: 50.' },
    heavy:     { credits: 200, opus: 10, sonnet: 40, haiku: 100, desc: '200 credits/day. Opus: 10, Sonnet: 40, Haiku: 100.' },
    unlimited: { credits: -1,  opus: -1, sonnet: -1, haiku: -1, desc: 'No limits. User has full unrestricted access.' },
  };

  var selectedPreset = 'light';

  function selectPreset(preset) {
    selectedPreset = preset;

    // Update button states
    var btns = document.querySelectorAll('.preset-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('selected', btns[i].getAttribute('data-preset') === preset);
    }

    var descEl = document.getElementById('preset-description');
    var customForm = document.getElementById('custom-limits-form');

    if (preset === 'custom') {
      if (descEl) descEl.textContent = 'Set your own limits below.';
      if (customForm) customForm.classList.remove('hidden');
    } else {
      var p = PRESETS[preset];
      if (descEl) descEl.textContent = p.desc;
      if (customForm) customForm.classList.add('hidden');
    }
  }

  function buildLimitsFromPreset() {
    var p;
    if (selectedPreset === 'custom') {
      p = {
        credits: parseInt(document.getElementById('custom-credits').value, 10),
        opus: parseInt(document.getElementById('custom-opus').value, 10),
        sonnet: parseInt(document.getElementById('custom-sonnet').value, 10),
        haiku: parseInt(document.getElementById('custom-haiku').value, 10),
      };
    } else {
      p = PRESETS[selectedPreset];
    }

    var limits = [];
    if (p.credits !== -1) {
      limits.push({ type: 'credits', window: 'daily', value: p.credits });
    }
    if (p.opus !== -1) {
      limits.push({ type: 'per_model', model: 'opus', window: 'daily', value: p.opus });
    }
    if (p.sonnet !== -1) {
      limits.push({ type: 'per_model', model: 'sonnet', window: 'daily', value: p.sonnet });
    }
    if (p.haiku !== -1) {
      limits.push({ type: 'per_model', model: 'haiku', window: 'daily', value: p.haiku });
    }
    return limits;
  }

  function submitAddUser() {
    var name = (document.getElementById('new-user-name').value || '').trim();
    var slug = (document.getElementById('new-user-slug').value || '').trim();

    if (!name) { showToast('Error', 'Name is required', 'error'); return; }
    if (!slug) { showToast('Error', 'Slug is required', 'error'); return; }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) { showToast('Error', 'Slug must be lowercase letters, numbers, and hyphens', 'error'); return; }

    var limits = buildLimitsFromPreset();

    API.createUser({ name: name, slug: slug, limits: limits })
      .then(function (result) {
        closeModal();
        showToast('User Created', name + ' has been added', 'success');

        // Show install command modal
        var installCode = result.install_code;
        var serverUrl = location.protocol + '//' + location.host;
        var installCmd = 'sudo npx claude-code-limiter setup --code ' + installCode + ' --server ' + serverUrl;

        var installHtml = '';
        installHtml += '<div class="modal-header"><h3>Install Command</h3><button class="modal-close" data-action="close-modal">&times;</button></div>';
        installHtml += '<div class="modal-body">';
        installHtml += '<p class="mb-2">Run this command on <strong>' + escapeHtml(name) + '</strong>\'s machine to set up rate limiting:</p>';
        installHtml += '<div class="install-box">';
        installHtml += '<code>' + escapeHtml(installCmd) + '</code>';
        installHtml += '<button class="btn btn-sm btn-primary" data-action="copy-install" data-command="' + escapeHtml(installCmd) + '">Copy</button>';
        installHtml += '</div>';
        installHtml += '<p class="form-hint mt-2">This code can only be used once. Generate a new one from the user detail page if needed.</p>';
        installHtml += '</div>';
        installHtml += '<div class="modal-footer"><button class="btn btn-primary" data-action="close-modal">Done</button></div>';

        openModal(installHtml);

        // Refresh overview
        var route = getRoute();
        if (route.page === 'overview' || route.page === 'users') {
          renderPage(route);
        }
      })
      .catch(function (err) {
        showToast('Error', err.message, 'error');
      });
  }

  /* ================================================================
     MODAL: EDIT LIMITS
     ================================================================ */
  function openEditLimitsModal(userId) {
    API.getUser(userId).then(function (user) {
      var limits = user.limits || [];
      var creditRule = getCreditRule(limits);
      var creditVal = creditRule ? creditRule.value : '';
      var creditWindow = creditRule ? creditRule.window : 'daily';

      var html = '';
      html += '<div class="modal-header"><h3>Edit Limits: ' + escapeHtml(user.name) + '</h3><button class="modal-close" data-action="close-modal">&times;</button></div>';
      html += '<div class="modal-body">';

      // Credit budget
      html += '<div class="form-group"><label>Credit Budget</label>';
      html += '<div class="form-row">';
      html += '<div class="form-group"><label class="text-sm">Value (-1 = unlimited, 0 = blocked)</label>';
      html += '<input type="number" id="edit-credits" min="-1" value="' + (creditVal !== '' ? creditVal : '-1') + '"></div>';
      html += '<div class="form-group"><label class="text-sm">Window</label>';
      html += '<select id="edit-credits-window">';
      var windows = ['daily', 'weekly', 'monthly', 'sliding_24h'];
      for (var wi = 0; wi < windows.length; wi++) {
        html += '<option value="' + windows[wi] + '"' + (creditWindow === windows[wi] ? ' selected' : '') + '>' + windows[wi] + '</option>';
      }
      html += '</select></div>';
      html += '</div></div>';

      html += '<hr class="section-divider">';

      // Per-model limits
      html += '<h4 class="mb-1">Per-Model Limits (Daily)</h4>';
      html += '<p class="form-hint mb-2">-1 = unlimited, 0 = blocked</p>';
      var models = ['opus', 'sonnet', 'haiku'];
      html += '<div class="form-row-3">';
      for (var mi = 0; mi < models.length; mi++) {
        var m = models[mi];
        var mVal = getModelLimit(limits, m, 'daily');
        html += '<div class="form-group"><label>' + m.charAt(0).toUpperCase() + m.slice(1) + '</label>';
        html += '<input type="number" id="edit-' + m + '" min="-1" value="' + mVal + '"></div>';
      }
      html += '</div>';

      // Time-of-day rules
      html += '<hr class="section-divider">';
      html += '<h4 class="mb-1">Time-of-Day Restrictions</h4>';
      var timeRules = limits.filter(function (r) { return r.type === 'time_of_day'; });
      html += '<div id="time-rules-list">';
      if (timeRules.length > 0) {
        for (var ti = 0; ti < timeRules.length; ti++) {
          html += renderTimeRuleRow(ti, timeRules[ti]);
        }
      }
      html += '</div>';
      html += '<button class="btn btn-sm mt-1" data-action="add-time-rule">+ Add Time Rule</button>';

      html += '</div>'; // modal-body
      html += '<div class="modal-footer">';
      html += '<button class="btn btn-ghost" data-action="close-modal">Cancel</button>';
      html += '<button class="btn btn-primary" data-action="submit-edit-limits" data-user-id="' + userId + '">Save Limits</button>';
      html += '</div>';

      openModal(html);
    }).catch(function (err) {
      showToast('Error', err.message, 'error');
    });
  }

  var timeRuleIndex = 0;

  function renderTimeRuleRow(idx, rule) {
    rule = rule || {};
    return (
      '<div class="form-row-3 mb-1" id="time-rule-' + idx + '">' +
        '<div class="form-group"><label class="text-sm">Model</label>' +
        '<select class="time-rule-model">' +
          '<option value="opus"' + (rule.model === 'opus' ? ' selected' : '') + '>Opus</option>' +
          '<option value="sonnet"' + (rule.model === 'sonnet' ? ' selected' : '') + '>Sonnet</option>' +
          '<option value="haiku"' + (rule.model === 'haiku' ? ' selected' : '') + '>Haiku</option>' +
        '</select></div>' +
        '<div class="form-group"><label class="text-sm">Start - End</label>' +
        '<div style="display:flex;gap:0.3rem;align-items:center">' +
          '<input type="time" class="time-rule-start" value="' + (rule.schedule_start || '09:00') + '" style="flex:1">' +
          '<span class="text-muted">-</span>' +
          '<input type="time" class="time-rule-end" value="' + (rule.schedule_end || '18:00') + '" style="flex:1">' +
        '</div></div>' +
        '<div class="form-group"><label class="text-sm">Timezone</label>' +
        '<input type="text" class="time-rule-tz" value="' + escapeHtml(rule.schedule_tz || Intl.DateTimeFormat().resolvedOptions().timeZone) + '" placeholder="America/New_York"></div>' +
      '</div>'
    );
  }

  function addTimeRuleRow() {
    var list = document.getElementById('time-rules-list');
    if (!list) return;
    timeRuleIndex++;
    var div = document.createElement('div');
    div.innerHTML = renderTimeRuleRow(timeRuleIndex, {});
    list.appendChild(div.firstElementChild);
  }

  function submitEditLimits(userId) {
    var limits = [];

    // Credits
    var creditsVal = parseInt(document.getElementById('edit-credits').value, 10);
    var creditsWindow = document.getElementById('edit-credits-window').value;
    if (!isNaN(creditsVal) && creditsVal !== -1) {
      limits.push({ type: 'credits', window: creditsWindow, value: creditsVal });
    }

    // Per-model
    var models = ['opus', 'sonnet', 'haiku'];
    for (var i = 0; i < models.length; i++) {
      var val = parseInt(document.getElementById('edit-' + models[i]).value, 10);
      if (!isNaN(val) && val !== -1) {
        limits.push({ type: 'per_model', model: models[i], window: 'daily', value: val });
      }
    }

    // Time-of-day rules
    var modelEls = document.querySelectorAll('.time-rule-model');
    var startEls = document.querySelectorAll('.time-rule-start');
    var endEls = document.querySelectorAll('.time-rule-end');
    var tzEls = document.querySelectorAll('.time-rule-tz');
    for (var t = 0; t < modelEls.length; t++) {
      limits.push({
        type: 'time_of_day',
        model: modelEls[t].value,
        schedule_start: startEls[t].value,
        schedule_end: endEls[t].value,
        schedule_tz: tzEls[t].value,
      });
    }

    API.updateUser(userId, { limits: limits })
      .then(function () {
        closeModal();
        showToast('Limits Updated', 'Limits have been saved', 'success');
        renderPage(getRoute());
      })
      .catch(function (err) {
        showToast('Error', err.message, 'error');
      });
  }

  /* ================================================================
     USER ACTIONS
     ================================================================ */
  function pauseUser(userId, userName) {
    confirmDialog('Pause User', 'Pause ' + userName + '? They will not be able to use Claude Code until reinstated.', 'Pause')
      .then(function (ok) {
        if (!ok) return;
        return API.updateUser(userId, { status: 'paused' }).then(function () {
          showToast('User Paused', userName + ' has been paused', 'warning');
          renderPage(getRoute());
        });
      })
      .catch(function (err) { if (err) showToast('Error', err.message, 'error'); });
  }

  function killUser(userId, userName) {
    confirmDialog('Kill User', 'Kill ' + userName + '? This will revoke their Claude Code access and log them out. They will need manual re-setup to restore access.', 'Kill')
      .then(function (ok) {
        if (!ok) return;
        return API.updateUser(userId, { status: 'killed' }).then(function () {
          showToast('User Killed', userName + ' has been killed. Their session will be revoked.', 'error');
          renderPage(getRoute());
        });
      })
      .catch(function (err) { if (err) showToast('Error', err.message, 'error'); });
  }

  function reinstateUser(userId, userName) {
    API.updateUser(userId, { status: 'active' })
      .then(function () {
        showToast('User Reinstated', userName + ' is now active', 'success');
        renderPage(getRoute());
      })
      .catch(function (err) { showToast('Error', err.message, 'error'); });
  }

  function deleteUser(userId, userName) {
    confirmDialog('Delete User', 'Permanently delete ' + userName + '? This removes all their usage data and cannot be undone.', 'Delete')
      .then(function (ok) {
        if (!ok) return;
        return API.deleteUser(userId).then(function () {
          showToast('User Deleted', userName + ' has been removed', 'success');
          navigate('overview');
        });
      })
      .catch(function (err) { if (err) showToast('Error', err.message, 'error'); });
  }

  /* ================================================================
     SETTINGS ACTIONS
     ================================================================ */
  function saveTeamName() {
    var name = (document.getElementById('settings-team-name').value || '').trim();
    if (!name) { showToast('Error', 'Team name cannot be empty', 'error'); return; }
    API.updateSettings({ name: name })
      .then(function (data) {
        state.team = data.team;
        updateTeamNameDisplay();
        showToast('Saved', 'Team name updated', 'success');
      })
      .catch(function (err) { showToast('Error', err.message, 'error'); });
  }

  function saveWeights() {
    var cw = {};
    var models = ['opus', 'sonnet', 'haiku'];
    for (var i = 0; i < models.length; i++) {
      var el = document.getElementById('weight-' + models[i]);
      cw[models[i]] = parseInt(el.value, 10) || 0;
    }
    API.updateSettings({ credit_weights: cw })
      .then(function (data) {
        state.team = data.team;
        showToast('Saved', 'Credit weights updated', 'success');
      })
      .catch(function (err) { showToast('Error', err.message, 'error'); });
  }

  function changePassword() {
    var newPw = (document.getElementById('settings-new-pw').value || '');
    var confirmPw = (document.getElementById('settings-confirm-pw').value || '');
    if (!newPw) { showToast('Error', 'Password cannot be empty', 'error'); return; }
    if (newPw !== confirmPw) { showToast('Error', 'Passwords do not match', 'error'); return; }
    if (newPw.length < 6) { showToast('Error', 'Password must be at least 6 characters', 'error'); return; }

    API.updateSettings({ admin_password: newPw })
      .then(function () {
        showToast('Saved', 'Admin password changed. You will need to log in again.', 'success');
        document.getElementById('settings-new-pw').value = '';
        document.getElementById('settings-confirm-pw').value = '';
      })
      .catch(function (err) { showToast('Error', err.message, 'error'); });
  }

  /* ================================================================
     AUTO-REFRESH
     ================================================================ */
  function startAutoRefresh() {
    stopAutoRefresh();
    state.refreshTimer = setInterval(function () {
      var route = getRoute();
      if (route.page === 'overview' || route.page === 'users') {
        silentRefreshOverview();
      }
    }, 30000);
  }

  function stopAutoRefresh() {
    if (state.refreshTimer) {
      clearInterval(state.refreshTimer);
      state.refreshTimer = null;
    }
  }

  /** Refresh overview data without full re-render (avoids flicker). */
  function silentRefreshOverview() {
    API.getUsers().then(function (data) {
      state.users = data.users;
      // Only re-render user cards if we are on overview
      var route = getRoute();
      if (route.page === 'overview' || route.page === 'users') {
        var grid = document.querySelector('.user-grid');
        if (grid) {
          var html = '';
          for (var i = 0; i < data.users.length; i++) {
            html += renderUserCard(data.users[i]);
          }
          grid.innerHTML = html;
        }
        // Update stats
        updateOverviewStats(data.users);
      }
    }).catch(function () {
      // Silently ignore refresh errors
    });
  }

  function updateOverviewStats(users) {
    var statCards = document.querySelectorAll('.stat-card');
    if (statCards.length < 4) return;
    var totalUsers = users.length;
    var activeUsers = users.filter(function (u) { return u.status === 'active'; }).length;
    var pausedUsers = users.filter(function (u) { return u.status === 'paused'; }).length;
    var killedUsers = users.filter(function (u) { return u.status === 'killed'; }).length;

    var vals = statCards[0].querySelector('.stat-value');
    if (vals) vals.textContent = totalUsers;
    vals = statCards[1].querySelector('.stat-value');
    if (vals) vals.textContent = activeUsers;
    vals = statCards[2].querySelector('.stat-value');
    if (vals) vals.textContent = pausedUsers;
    vals = statCards[3].querySelector('.stat-value');
    if (vals) vals.textContent = killedUsers;
  }

  function updateTeamNameDisplay() {
    var el = document.getElementById('sidebar-team-name');
    if (el && state.team) el.textContent = state.team.name;
  }

  /* ================================================================
     LOGIN
     ================================================================ */
  function handleLogin(e) {
    e.preventDefault();
    var pw = document.getElementById('login-password').value;
    var errEl = document.getElementById('login-error');
    var btn = document.getElementById('login-btn');

    if (!pw) { errEl.textContent = 'Password is required'; errEl.classList.remove('hidden'); return; }

    btn.disabled = true;
    btn.textContent = 'Signing in...';
    errEl.classList.add('hidden');

    API.login(pw)
      .then(function (data) {
        state.token = data.token;
        state.team = data.team;
        localStorage.setItem('clm_token', data.token);
        updateTeamNameDisplay();
        navigate('overview');
      })
      .catch(function (err) {
        errEl.textContent = err.message || 'Login failed';
        errEl.classList.remove('hidden');
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = 'Sign In';
      });
  }

  function handleLogout() {
    state.token = null;
    state.team = null;
    localStorage.removeItem('clm_token');
    stopAutoRefresh();
    WS.disconnect();
    navigate('login');
  }

  /* ================================================================
     MOBILE SIDEBAR
     ================================================================ */
  function openMobileSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-overlay').classList.remove('hidden');
  }

  function closeMobileSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.add('hidden');
  }

  /* ================================================================
     EVENT DELEGATION
     ================================================================ */
  function setupEventDelegation() {
    document.addEventListener('click', function (e) {
      var target = e.target.closest('[data-action]');
      if (!target) return;

      var action = target.getAttribute('data-action');
      var userId = target.getAttribute('data-user-id');
      var userName = target.getAttribute('data-user-name');

      switch (action) {
        case 'view-user':
          e.preventDefault();
          if (userId) navigate('user', { id: userId });
          break;

        case 'add-user':
          openAddUserModal();
          break;

        case 'submit-add-user':
          submitAddUser();
          break;

        case 'pause-user':
          e.stopPropagation();
          if (userId) pauseUser(userId, userName);
          break;

        case 'kill-user':
          e.stopPropagation();
          if (userId) killUser(userId, userName);
          break;

        case 'reinstate-user':
          e.stopPropagation();
          if (userId) reinstateUser(userId, userName);
          break;

        case 'delete-user':
          if (userId) deleteUser(userId, userName);
          break;

        case 'edit-limits':
          if (userId) openEditLimitsModal(userId);
          break;

        case 'submit-edit-limits':
          submitEditLimits(userId);
          break;

        case 'add-time-rule':
          addTimeRuleRow();
          break;

        case 'close-modal':
          closeModal();
          break;

        case 'copy-install':
          var cmd = target.getAttribute('data-command');
          if (cmd) copyToClipboard(cmd);
          break;

        case 'save-team-name':
          saveTeamName();
          break;

        case 'save-weights':
          saveWeights();
          break;

        case 'change-password':
          changePassword();
          break;
      }
    });

    // Preset buttons (inside modal)
    document.addEventListener('click', function (e) {
      var presetBtn = e.target.closest('.preset-btn');
      if (!presetBtn) return;
      var preset = presetBtn.getAttribute('data-preset');
      if (preset) selectPreset(preset);
    });

    // Modal overlay click-outside to close
    document.getElementById('modal-overlay').addEventListener('click', function (e) {
      if (e.target === this) closeModal();
    });

    document.getElementById('confirm-overlay').addEventListener('click', function (e) {
      if (e.target === this) {
        document.getElementById('confirm-cancel').click();
      }
    });

    // Login form
    document.getElementById('login-form').addEventListener('submit', handleLogin);

    // Logout
    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    // Hamburger
    document.getElementById('hamburger-btn').addEventListener('click', function () {
      var sidebar = document.getElementById('sidebar');
      if (sidebar.classList.contains('open')) {
        closeMobileSidebar();
      } else {
        openMobileSidebar();
      }
    });

    // Sidebar overlay
    document.getElementById('sidebar-overlay').addEventListener('click', closeMobileSidebar);

    // Hash change
    window.addEventListener('hashchange', handleRoute);

    // Keyboard: Escape closes modals
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var modalOverlay = document.getElementById('modal-overlay');
        if (!modalOverlay.classList.contains('hidden')) {
          closeModal();
          return;
        }
        var confirmOverlay = document.getElementById('confirm-overlay');
        if (!confirmOverlay.classList.contains('hidden')) {
          document.getElementById('confirm-cancel').click();
        }
      }
    });
  }

  /* ================================================================
     WEBSOCKET EVENT HANDLING
     ================================================================ */
  function setupWSListeners() {
    WS.onEvent(function (event) {
      if (!event || !event.type) return;

      // Handle live feed events
      var feed = wsEventToFeed(event);
      if (feed) {
        addLiveFeedItem(feed);
      }

      // Show toast for blocked events
      if (event.type === 'user_blocked') {
        showToast(
          'User Blocked',
          (event.userName || 'Unknown') + ' was blocked on ' + (event.model || 'unknown'),
          'warning',
          8000
        );
      }

      // Show toast for kill events
      if (event.type === 'user_killed' || (event.type === 'user_status_change' && event.newStatus === 'killed')) {
        showToast(
          'User Killed',
          (event.userName || 'Unknown') + ' has been killed',
          'error',
          8000
        );
      }

      // Refresh user cards on status changes
      if (event.type === 'user_status_change' || event.type === 'user_killed' || event.type === 'user_counted') {
        silentRefreshOverview();
      }
    });
  }

  /* ================================================================
     INIT
     ================================================================ */
  function init() {
    setupEventDelegation();
    setupWSListeners();

    // If we have a token, try to load team info
    if (state.token) {
      API.getUsers().then(function (data) {
        state.users = data.users;
        // Try to get team info from login endpoint's stored state
        // We do not have a dedicated /team endpoint, so we store it on login
        var storedTeam = localStorage.getItem('clm_team');
        if (storedTeam) {
          try { state.team = JSON.parse(storedTeam); } catch (e) { /* ignore */ }
        }
        updateTeamNameDisplay();
      }).catch(function () {
        // Token might be expired
      });
    }

    // Route
    handleRoute();
  }

  // Patch login to also store team info
  var originalLogin = API.login;
  API.login = function (password) {
    return originalLogin(password).then(function (data) {
      if (data.team) {
        localStorage.setItem('clm_team', JSON.stringify(data.team));
      }
      return data;
    });
  };

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
