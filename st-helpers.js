/* SecureText shared helpers — DOM, format, throttle, spam (no Firebase) */
(function (global) {
  "use strict";

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function fmtTime(ts) {
    try {
      if (ts && typeof ts.toDate === "function") return ts.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (ts && typeof ts.getTime === "function") return ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return "";
    } catch (e) { return ""; }
  }

  function fmtDate(ts) {
    try {
      if (ts && typeof ts.toDate === "function") return ts.toDate().toLocaleDateString();
      if (ts && typeof ts.getTime === "function") return ts.toLocaleDateString();
      return "";
    } catch (e) { return ""; }
  }

  function debounce(fn, ms) {
    let t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  function throttle(fn, ms) {
    let last = 0;
    return function () {
      const now = Date.now();
      if (now - last >= ms) { last = now; fn(); }
    };
  }

  function $(id) { return document.getElementById(id); }
  function qs(el, sel) { return (el || document).querySelector(sel); }
  function qsAll(el, sel) { return Array.from((el || document).querySelectorAll(sel)); }

  // Spam check config
  var SPAM_DEFAULTS = {
    minInterval: 1100,
    repeatWindow: 12000,
    maxRepeat: 2,
    maxLength: 350,
    muteDuration: 10000,
    maxSpamBlocks: 3
  };

  function createSpamChecker(opts) {
    var o = Object.assign({}, SPAM_DEFAULTS, opts || {});
    var lastSendAt = 0, lastSendText = "", recent = [], spamBlocks = 0, muteUntil = 0;

    function check(text) {
      var now = Date.now();
      if (now < muteUntil) return { ok: false, msg: "Muted (spam).", mute: true };
      text = String(text || "").trim().replace(/\s{3,}/g, "  ");
      if (text.length > o.maxLength) return { ok: false, msg: "Too long (max " + o.maxLength + ")." };
      if (now - lastSendAt < o.minInterval) return { ok: false, msg: "Slow down." };
      var cutoff = now - o.repeatWindow;
      while (recent.length && recent[0].at < cutoff) recent.shift();
      var reps = recent.filter(function (r) { return r.t === text; }).length;
      if (reps >= o.maxRepeat || (lastSendText === text && now - lastSendAt < o.repeatWindow))
        return { ok: false, msg: "Duplicate blocked." };
      return { ok: true };
    }

    function record(text) {
      var now = Date.now();
      lastSendAt = now;
      lastSendText = text;
      recent.push({ t: text, at: now });
      var cutoff = now - o.repeatWindow;
      while (recent.length && recent[0].at < cutoff) recent.shift();
    }

    function recordBlock() {
      spamBlocks++;
      if (spamBlocks >= o.maxSpamBlocks) {
        muteUntil = Date.now() + o.muteDuration;
        spamBlocks = 0;
        return true;
      }
      return false;
    }

    function isMuted() { return Date.now() < muteUntil; }
    return { check: check, record: record, recordBlock: recordBlock, isMuted: isMuted };
  }

  function downloadBlob(blob, filename) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename || "export.txt";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 200);
  }

  function exportMessagesAsText(messages) {
    return (messages || []).map(function (m) {
      var t = m.timestamp;
      var time = (t && t.toDate) ? t.toDate().toISOString() : (t || "");
      return "[" + time + "] " + (m.name || "User") + ": " + (m.text || "");
    }).join("\n");
  }

  global.ST_HELPERS = {
    escapeHtml: escapeHtml,
    fmtTime: fmtTime,
    fmtDate: fmtDate,
    debounce: debounce,
    throttle: throttle,
    $: $,
    qs: qs,
    qsAll: qsAll,
    createSpamChecker: createSpamChecker,
    downloadBlob: downloadBlob,
    exportMessagesAsText: exportMessagesAsText
  };
})(typeof window !== "undefined" ? window : this);
