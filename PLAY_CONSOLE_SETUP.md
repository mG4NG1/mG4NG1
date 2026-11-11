# ChopOut — Google Play Console setup (draft, 12 Nov 2026)

App name: **ChopOut!**
Android package: **com.mamimoinc.chopout**
App category: **Business**
App type: **App**
Default store language: **English (Australia)**, if available
Download price: **FREE** (do not make the downloadable app paid)
Support email: **mamimo.support@gmail.com**
Customer-facing website: **[your verified hosted Mamimo Inc site]**

## Main store listing
Short description:
**Find trusted tradies, share job notices and build your crew**

Full description:
ChopOut! is a professional networking app made for Australia's tradespeople. Find your crew, see who's available and make the connections that keep jobs moving.

THE COMMUNITY NOTICEBOARD
Browse notices for jobs needing a hand, subcontractors and tradies available for work. Keep things straightforward with two categories: Need a Tradie and Available for Work.

MAKE IT CHOPPED OUT!
When a job is filled, the advertiser can mark it CHOPPED OUT! so other tradies know the position is no longer available. Unfilled notices automatically disappear from the active board after 48 hours.

BUILD YOUR CREW
Keep in touch with tradies you trust. Send and accept crew requests, save useful professional connections and message people in the network.

25 KM RADAR
With ChopOut Pro, use approximate-area mapping to discover other opted-in members in your profession within 25 km. Members choose whether to appear on the map.

FREE AND PRO
ChopOut is free to download. Browse the community board and create a profile. Free members can receive crew requests and reply to conversations started by Pro members. ChopOut Pro unlocks posting notices, sending crew requests, starting conversations and Radar discovery.

ChopOut! Find your crew. Get it done.

**Check every claimed feature against the tested release before publishing.**

## Dashboard declarations
- Privacy policy: hold until final public HTTPS policy URL is live and reflects actual deployed processors and retention.
- Sign-in: some features require Google Sign-In; provide functioning test credentials/clear instructions plus Pro reviewer access when available.
- Ads: select No only if there are no third-party ads, sponsored posts or paid placements. Ordinary community job posts are not necessarily app advertisements.
- Content rating: declare user-generated text, photos, user-to-user messaging, network/location features truthfully. Google assigns rating.
- Target audience: target adults 18+.
- Data safety: complete after final SDK, backend, encryption, sharing, and account deletion audit.
- Government app: No.
- Financial features: no financial service is provided by this professional-networking app; answer detailed questions about any actual payments accurately.
- Health: No unless health features are added.
- Trader status: provide the correct business status and legal information matching verified developer registration.
- Category: Business.
- Store support: mamimo.support@gmail.com.
- Pricing: app Free; weekly Pro subscription AUD $1.99 through Play Billing/RevenueCat.
- Merchant profile: set up with your own verified payment/tax details in Google Play; never commit these to GitHub.

## Needed before APK/AAB
- Expo/EAS project ownership + project ID linked to this frontend.
- Google OAuth Android SHA-1 for EAS/Play signing + public Google Web Client ID.
- Working HTTPS backend URL and MongoDB instance.
- RevenueCat Android public key for Android test builds; private server key only in backend secrets.
- Lockfile install/update and actual Expo config and TypeScript checks.
- Native MapLibre build and Google login on Android device; actual Pro purchase sandbox tests.
- Final privacy/deletion URLs; end-user terms acceptance; moderation staff workflow.
- This GitHub branch is draft, not merged and neither APK nor AAB has been generated.

## Build commands (from frontend/)
```sh
yarn install
npx expo-doctor
npx tsc --noEmit
npx eas-cli build --platform android --profile preview
npx eas-cli build --platform android --profile production
```
Expected output: preview APK and Google Play AAB respectively, only after successful authenticated EAS builds and signing.
