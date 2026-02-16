// utils.js

export function showError(msg) {
  console.error(msg);
  alert(msg);
}

export function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

export function timestamp() {
  return Date.now();
}
