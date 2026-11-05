# SubbieNet – PRD & Status

## Product
Paid crew-list app for subcontractors (AU). Members are found by mobile number / trade, add each other to a private crew, and chat.
- **Free**: can be found & added, accept/decline requests, reply to messages only, basic contact list. Cannot see who accepted.
- **Pro ($2.99/week, RevenueCat)**: start chats, business name/logo profile, crew list with phones, Radar map (approximate areas), find subbies within 25 km.
- **Lifetime Pro**: owner account `info@vicspark.com.au` (via `LIFETIME_PRO_EMAILS` in backend/.env, or `lifetime_pro: true` on the user doc).

## Stack
Expo (expo-router, native tabs) · FastAPI · MongoDB · RevenueCat · Emergent Google Auth · Emergent Object Storage · Twilio (SMS)

## Done
- Google sign-in, onboarding (name, mobile, trade, business [Pro], bio)
- Display picture: portrait photo or business logo (member chooses, no automated check) → Object Storage, served via `/api/files/{path}` (auth required). Logos render as rounded squares.
- Contacts sync (numbers only, names stay on device), search by name/number, crew requests, accept/decline
- Chat (free = reply-only, enforced server-side), inbox, Radar map, nearby (Pro, server-enforced)
- RevenueCat paywall; server-side Pro check via RevenueCat REST (`is_pro`), cached 60 s; lifetime Pro override
- Twilio SMS (code written, **credentials pending**): phone verification (Verify), SMS invites (25/day), crew-request text alert (opt-in toggle on Profile, verified numbers only). UI hides SMS features until `/api/sms/status` reports configured.
- Privacy: crew lists & contacts never visible to other members.
- Permissions declared in app.json (contacts, location, camera, photos).

## Key endpoints
`/api/auth/*`, `/api/profile` (PUT), `/api/profile/picture` (POST multipart file+kind, DELETE), `/api/files/{path}?token=`, `/api/settings` (PUT sms_alerts), `/api/sms/status`, `/api/phone/send-code`, `/api/phone/verify`, `/api/invites`, `/api/contacts/match`, `/api/contacts/check`, `/api/search`, `/api/connections*`, `/api/messages`, `/api/conversations`, `/api/nearby`, `/api/location`

## Env (backend/.env)
MONGO_URL, DB_NAME, EMERGENT_LLM_KEY (object storage), REVENUECAT_API_KEY, LIFETIME_PRO_EMAILS, APP_INVITE_URL, TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER / TWILIO_VERIFY_SERVICE_SID (to be added via secrets)

## Testing
- `backend/seed_test_users.py` seeds test_token_1 (free) / test_token_2 (lifetime Pro). See /app/memory/test_credentials.md
- Test reports: /app/test_reports/iteration_1.json, iteration_2.json (all passing after fixes)

## Backlog / next
- Add Twilio credentials and live-test SMS flows
- Native-only checks on device: contacts, camera, maps, RevenueCat store purchases
- Split server.py into routers
