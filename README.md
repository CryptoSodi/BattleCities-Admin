# Battle Cities Admin

Standalone Command Center at https://admin.battlecities.com.

- API: https://api.battlecities.com (existing database and server-side admin authorization).
- Game/replay viewer: https://play.battlecities.com.
- Wallet login signs a server challenge. No wallet keys, API secrets, or balances are stored in this repository.
- Authorized wallets are controlled by the API, not by this public frontend.
- Profiles, matches, replay sessions, notifications, live-user controls, and X campaign controls are preserved.
- Competitions: season pass SKR/SOL prices, cycle rank 1–10 and season rank 1–100 SKR tiers, optional shop SKR prices, and API-reported runtime readiness. Prices stay exact decimal strings. Blank shop prices disable SKR purchasing for that item.
- Match reviews: cursor-paged queue, saved replay access, evidence/reason, and explicit confirmation before an irreversible, audited accept/reject decision.

## Competition API

`GET /api/admin/competitions` loads settings and public runtime status. `PUT /api/admin/competitions` sends `{settings}` and replaces the entire document. The editor preserves trading-season policy and unrelated fields; it checks for intervening edits before saving (best-effort, not an atomic server lock). Settings changes do not start workers or send payouts. All policies retain their loaded state until an administrator explicitly saves changes.

`GET /api/admin/match-reviews?limit=50&before=<resultId>` loads unreviewed results. `POST /api/admin/match-reviews` sends `{resultId,decision:"accepted"|"rejected",reason}`. The backend remains authoritative for authorization, auditing, and finality. Only inspect/decide after checking trusted evidence; metadata alone does not prove legitimate play.

## Development

Node 22+: `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm start`.

The preview is http://127.0.0.1:8082 and connects to the production API. Production login cookies are same-site with `admin.battlecities.com`; a localhost preview can have browser cross-site cookie restrictions.

## Deployment

Push to `main` to build and deploy through GitHub Actions / GitHub Pages. This repository does not deploy or restart the API or game. `public/CNAME` owns the Pages custom domain; Cloudflare DNS points `admin` to `cryptosodi.github.io` (DNS-only) and GitHub Pages provides HTTPS.

The old game's `/admin/` route redirects here. Replay links always open the game's viewer; no game engine, Capacitor runtime, or game assets are bundled in this dashboard.
