/**
 * ws.js — WebSocket client for the Claude Code Limiter dashboard.
 * Auto-reconnect with exponential backoff (max 30s).
 *
 * Exports on window.WS:
 *   connect()
 *   disconnect()
 *   onEvent(callback) — register handler for all server events
 *   isConnected()
 */
(function () {
  'use strict';

  var socket = null;
  var listeners = [];
  var reconnectTimer = null;
  var reconnectDelay = 1000; // ms, grows exponentially
  var MAX_RECONNECT_DELAY = 30000;
  var intentionalClose = false;

  /**
   * Build the WebSocket URL based on the current page location.
   * @returns {string}
   */
  function buildUrl() {
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + location.host + '/ws';
  }

  /**
   * Update the connection indicator dots in the UI.
   * @param {'connected'|'connecting'|'disconnected'} state
   */
  function setIndicator(state) {
    var dots = document.querySelectorAll('.ws-dot');
    for (var i = 0; i < dots.length; i++) {
      dots[i].className = 'ws-dot ' + state;
    }
    var label = document.getElementById('ws-label');
    if (label) {
      var labels = {
        connected: 'Live',
        connecting: 'Reconnecting...',
        disconnected: 'Disconnected',
      };
      label.textContent = labels[state] || state;
    }
  }

  /**
   * Notify all registered listeners of an event.
   * @param {object} event
   */
  function emit(event) {
    for (var i = 0; i < listeners.length; i++) {
      try {
        listeners[i](event);
      } catch (err) {
        console.error('[WS] Listener error:', err);
      }
    }
  }

  /**
   * Open a WebSocket connection. Automatically reconnects on close.
   */
  function connect() {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    intentionalClose = false;
    setIndicator('connecting');

    try {
      socket = new WebSocket(buildUrl());
    } catch (err) {
      console.error('[WS] Failed to create WebSocket:', err);
      scheduleReconnect();
      return;
    }

    socket.onopen = function () {
      reconnectDelay = 1000; // reset backoff on successful connection
      setIndicator('connected');
      emit({ type: 'ws_connected', timestamp: new Date().toISOString() });
    };

    socket.onmessage = function (evt) {
      var data;
      try {
        data = JSON.parse(evt.data);
      } catch (err) {
        console.warn('[WS] Non-JSON message:', evt.data);
        return;
      }
      emit(data);
    };

    socket.onclose = function (evt) {
      socket = null;
      if (!intentionalClose) {
        setIndicator('disconnected');
        emit({ type: 'ws_disconnected', timestamp: new Date().toISOString() });
        scheduleReconnect();
      }
    };

    socket.onerror = function () {
      // onclose will fire after onerror, so reconnect is handled there
    };
  }

  /**
   * Schedule a reconnection attempt with exponential backoff.
   */
  function scheduleReconnect() {
    if (reconnectTimer) return;
    setIndicator('connecting');
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      connect();
    }, reconnectDelay);
    // Exponential backoff, capped at MAX_RECONNECT_DELAY
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
  }

  /**
   * Intentionally close the WebSocket (e.g. on logout). No auto-reconnect.
   */
  function disconnect() {
    intentionalClose = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (socket) {
      socket.close();
      socket = null;
    }
    setIndicator('disconnected');
  }

  /**
   * Register a callback for all WebSocket events from the server.
   * @param {function(object):void} callback
   * @returns {function} unsubscribe function
   */
  function onEvent(callback) {
    listeners.push(callback);
    return function unsubscribe() {
      var idx = listeners.indexOf(callback);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  }

  /**
   * Check if the WebSocket is currently open.
   * @returns {boolean}
   */
  function isConnected() {
    return socket !== null && socket.readyState === WebSocket.OPEN;
  }

  /* ---- Public API ---- */
  window.WS = {
    connect: connect,
    disconnect: disconnect,
    onEvent: onEvent,
    isConnected: isConnected,
  };
})();
