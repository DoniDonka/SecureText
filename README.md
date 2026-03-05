# SecureText

Class-based chat with PIN entry, admin approval, and Firestore storage. Optimized for **GitHub Pages** (static hosting).

## Features

- **Classes** — Pick a class, enter PIN, submit your name, wait for admin approval.
- **Chat** — Real-time messages, typing indicator, presence (online count), announcements.
- **Admin** — Approve/reject/ban users, lock chat, force theme, pin message, bulk approve/reject, export chat.
- **Student** — Search messages, export chat, day/night theme, presets (neon/emerald/mono), data saver mode, @here notifications.

## Tech

- **Firebase v8** (CDN): Auth + Firestore. No build step.
- **GitHub Pages**: Serve `index.html`, `admin.html`, and assets at repo root or `docs/`.

## Deploy to GitHub Pages

1. Push this folder to a GitHub repo.
2. **Settings → Pages** → Source: Deploy from branch → branch `main` (or `master`) → folder **/ (root)** or **/docs** (if you put files in `docs/`).
3. Your site: `https://<username>.github.io/<repo>/`

## Firebase

- Create a project at [Firebase Console](https://console.firebase.google.com).
- Enable **Authentication** (Email/Password for admin).
- Enable **Firestore** and set rules (e.g. restrict writes to authenticated admin; allow reads for class docs with PIN check handled in your app or via rules).
- Put your config in `firebase.js` (already present; replace with your own keys if needed).

## Files

| File | Purpose |
|------|--------|
| `index.html` | Student flow: class → PIN → name → wait → chat |
| `admin.html` | Admin login and class management |
| `app.js` | Main app logic, chat, search, export, pinned, offline |
| `admin.js` | Admin logic, bulk actions, pin, export |
| `firebase.js` | Firebase init, persistence, `ST_REFS` |
| `st-helpers.js` | Shared helpers (escapeHtml, fmtTime, spam, export) |
| `style.css` | UI and themes |
| `manifest.json` | PWA manifest for “Add to home screen” |

## Security

- Do not commit real API keys if the repo is public; use environment variables or a separate config in CI. For demos, Firestore rules should restrict who can read/write what.
