# ChopOut independent migration — working branch

This branch is a **migration in progress**. Do **not** deploy it as production or turn off Emergent until Google login, the database, uploaded photos, and the app have been tested on an Android development build.

## Completed code changes
- Removed Twilio SDK, SMS endpoints, phone verification UI and paid SMS alerts.
- Replaced SMS invitations with the Android/iOS system share sheet.
- Replaced Emergent's managed object storage with Motor GridFS in the existing MongoDB database (new uploads only).
- Replaced Emergent's OAuth session endpoint with server-verified Google ID tokens.
- Added Android Google Sign-In client code; **does not work in Expo Go**.
- Added preview APK / release AAB profiles in `frontend/eas.json`.
- Renamed Android app to ChopOut and reserved provisional `com.mamimoinc.chopout` package ID.
- Enforced Pro subscription before search, contact matching and outgoing crew requests; free members can still accept incoming requests and reply to incoming chats.
- Made the paywall select a **WEEKLY** RevenueCat package. Intended price is **AUD $1.99/week**; actual billing price is set in Google Play + RevenueCat and displayed from the store, not hard-coded.

## User-owned services to configure (do not commit secrets)
1. **Google Cloud Console**: configure OAuth consent screen and create Android OAuth credentials for package `com.mamimoinc.chopout` using the correct EAS / Play App Signing SHA-1 certificate fingerprint. Create a *Web application* OAuth client ID as well. Web client ID is public and goes into `frontend/.env` as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` and backend `GOOGLE_CLIENT_IDS`. Keep the Android application ID fixed once published.
2. **MongoDB**: configure `MONGO_URL` and `DB_NAME` in the new hosting environment. The same database stores users, chats and GridFS images. Set up backups and privacy/deletion policies.
3. **Backend hosting**: deploy `backend/server.py` as FastAPI (e.g. `uvicorn server:app --host 0.0.0.0 --port $PORT`, working directory `backend`) with HTTPS. Configure server CORS and environment variables.
4. **Expo/EAS**: add production `EXPO_PUBLIC_BACKEND_URL` and Google Web Client ID through Expo environment settings. Install native dependencies and rebuild; Expo Go is not compatible with native Google Sign-In or store purchase SDKs.
5. **RevenueCat**: configure Google Play Billing product and WEEKLY offering; public Android key in Expo env and private RevenueCat REST key on backend. Verify real sandbox purchases and entitlement expiry.
6. **Store listing**: set `EXPO_PUBLIC_APP_INVITE_URL` after the listing is live; until then the share message has no install link.

## Migration caveats and remaining work
- **Existing profile photos** reside in Emergent-managed storage. Copy old files to GridFS *before* decommissioning Emergent; this branch only changes new uploads. If an old image is requested, it will return 404 until migrated.
- **Existing Google user accounts** are matched by Google's verified email so previous crew memberships and stable RevenueCat IDs can be preserved, provided the original MongoDB user data is retained.
- **Web sign-in** must be reimplemented separately. The native Google Sign-In path targets Android first.
- **Phone verification** was removed with Twilio. Previously verified users may still have that historic flag in MongoDB; product messaging must not promise ongoing phone-number verification.
- **Existing backend tests** include Emergent-auth/SMS expectations and must be revised. No live Android build or end-to-end test has been completed yet.
- **Old Emergent dependencies** in scripts, files and documentation still require cleanup; runtime authentication and photo endpoints no longer rely on them.
- **Privacy, moderation, account deletion, backups, rate limits, and Play data-safety disclosures** need assessment before publishing.
- `frontend/package.json` gained a new native dependency, so the package lock must be regenerated with `yarn install` or the project's package manager before building.
- **Do not cancel Emergent** before successful database/image migration, independent deployment, and verified Android login.

## Developer commands (once environment is configured)
```bash
cd frontend
yarn install
npx expo-doctor
npx eas-cli build --platform android --profile preview
npx eas-cli build --platform android --profile production
```

The APK is for internal installation; the AAB is for Google Play. No release build has been generated yet.

## 20 km Radar and 48-hour crew noticeboard
- Radar uses the open-source **MapLibre React Native** renderer and **OpenFreeMap** map style. Attribution and use limits must be checked in the final APK.
- The backend restricts Radar search to **the requesting Pro member's own trade**, opted-in members within **20 km**, with an area updated within the past week.
- Users choose whether they appear on Radar. Map points use deliberately rounded areas, not real-time GPS. Review location and consent disclosures.
- Pro members can publish short notices. All signed-in members may read the **general noticeboard**; Free members cannot initiate chat from a notice, while Pro members may. Blocked users cannot view each other's notices.
- Notices are excluded from feeds after exactly **48 hours** and are removed in the background through MongoDB TTL indexing. Database deletion can lag briefly after expiry.
- Users can delete their own notices immediately. Accepted connections do not grant Free members the ability to initiate chats or outgoing crew requests.
- Native MapLibre and OAuth code need a fresh EAS build; no APK generated yet.

## Billing, paywall and legal work — 2026-11-09
- Android Pro subscription is planned at **AUD $1.99 per week**, configured in Google Play Console as a weekly auto-renewing subscription and offered via RevenueCat's **WEEKLY** package. **The subscription product has not been created in the user's Play Console yet.**
- No Stripe credentials are needed for normal Google Play digital-feature subscriptions. Do not commit private RevenueCat API keys or Google credentials.
- Pro access is guarded in the FastAPI server for user search, contact discovery, Radar, outgoing friend requests, new chats and noticeboard publishing. Free members may accept incoming requests, read general notices and reply once messaged. The 60-second entitlement cache fails closed when an expired cache refresh errors.
- Added block/report backend endpoints and in-app report/block entry points; **moderation administration and testing are still needed**.
- Added an authenticated account deletion route and in-app action; **verify full data coverage, backups, retention, and cancellation instructions** before claiming Play compliance.
- Draft privacy policy, terms, community guidelines, and website deletion page are in `legal/`. They require the verified business name, final domains, hosting disclosure and a lawyer's review before publication. This is not legal advice.
- Publishing user-generated content requires production-ready terms acceptance flow and live published policy links before release.
