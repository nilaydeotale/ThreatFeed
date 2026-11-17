# Technical Overview for ThreatFeed

This document contains the key architectural and implementation details for the "ThreatFeed" client‑side security reader.

---

## 1. Project structure
```
/src
├─ App.tsx          # Router & high‑level state
├─ index.css
├─ main.tsx
├─ services/        # Data fetching, utilities, caching
├─ context/        # React context for feeds, settings, etc.
├─ hooks/          # Custom hooks (routing, keyboard, etc.)
├─ pages/          # Top‑level pages (Feed, Actors, NVDCve, etc.)
├─ components/     # UI components (Newspaper, Reader, charts)
└─ assets/         # SVG icons, fonts, etc.
```

## 2. Data sources & snapshot
- Real‑time feeds are fetched via 6 concurrent workers; the service worker caches requests.
- A periodic GitHub Action builds a static `snapshot.json` containing all article meta, CVE enrichment, and internal stats.
- The snapshot is served from `public/` and read in the browser at first load.
- Subsequent live feeds are refreshed on demand.

## 3. Architecture
- **React 18 + TypeScript CK** with `vite`.
- **IndexedDB** (`idb`) for persistent storage (read/unread flags, bookmarks, settings).
- **DOMPurify** for all untrusted article HTML.
- **MiniSearch** for client‑side full‑text search.
- **Tailwind CSS** for styling.
- **ESLint** + `no-unsanitized` rule to enforce safety.

## 4. Key features
- “Newspaper” layout, list & compact view.
- Alerts & notifications based on user‑defined rules.
- CVE enrichment (KEV, NVD, EPSS, GitHub Advisories).
- OPML import/export and JSON backup.
- Built‑in PWA and service worker.
- Reduced‑motion and dark/light modes.
- Keyboard shortcuts and deep linking.

---

For more detailed implementation notes, see the GitHub repository files.
