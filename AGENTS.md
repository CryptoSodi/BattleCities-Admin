# Admin-only repository

Maintain the standalone HTML dashboard. API code and game simulation remain in the Battle-Cities repository.
Use https://api.battlecities.com with credentials included. Never embed credentials or private keys.
Keep server-side admin checks authoritative. Preserve the dark steel / amber / green / red UI, responsive layouts, and deliberate keyboard focus states. Use the existing CSS variables and components.
Run `npm run check`, `npm test`, and `npm run build` before shipping. Bump package.json for application updates.
