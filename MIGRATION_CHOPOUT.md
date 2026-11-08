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
- Made the paywall select a **MONTHLY** RevenueCat package. Price is set in Google Play + RevenueCat, not hard-coded.

## User-owned services to configure (do not commit secrets)
1. **Google Cloud Console**: configure OAuth consent screen and create Android OAuth credentials for package `com.mamimoinc.chopout` using the correct EAS / Play App Signing SHA-1 certificate fingerprint. Create a *Web application* OAuth client ID as well. Web client ID is public and goes into `frontend/.env` as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` and backend `GOOGLE_CLIENT_IDS`. Keep the Android application ID fixed once published.
2. **MongoDB**: configure `MONGO_URL` and `DB_NAME` in the new hosting environment. The same database stores users, chats and GridFS images. Set up backups and privacy/deletion policies.
3. **Backend hosting**: deploy `backend/server.py` as FastAPI (e.g. `uvicorn server:app --host 0.0.0.0 --port $PORT`, working directory `backend`) with HTTPS. Configure server CORS and environment variables.
4. **Expo/EAS**: add production `EXPO_PUBLIC_BACKEND_URL` and Google Web Client ID through Expo environment settings. Install native dependencies and rebuild; Expo Go is not compatible with native Google Sign-In or store purchase SDKs.
5. **RevenueCat**: configure Google Play Billing product and MONTHLY offering; public Android key in Expo env and private RevenueCat REST key on backend. Verify real sandbox purchases and entitlement expiry.
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
