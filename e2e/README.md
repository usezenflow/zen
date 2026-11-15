# E2E (Maestro)

Happy paths for the main flows. The campus is never called: the portal and the LMS are served by `pnpm mock`, which runs the same MSW handlers the component tests use (`test/msw/handlers.ts`) on port 9090.

## Run

```bash
pnpm mock                       # leave running; logs every request it answers

# Android emulator (10.0.2.2 is the host). E2E=1 lets the build talk plain http to it (plugins/with-lms-ca.js).
E2E=1 EXPO_PUBLIC_DLU_PORTAL_URL=http://10.0.2.2:9090 EXPO_PUBLIC_DLU_LMS_URL=http://10.0.2.2:9090 \
EXPO_PUBLIC_STATS_URL=http://10.0.2.2:9090 EXPO_PUBLIC_DLU_API_KEY=e2e \
  pnpm expo run:android --variant release

# iOS simulator (localhost is allowed by NSAllowsLocalNetworking). Built like CI, with xcodebuild:
# `expo run:ios --configuration Release` fails here on the server-manifest step (web.output is "server").
pnpm exec expo prebuild --platform ios --no-install && (cd ios && pod install)
export EXPO_PUBLIC_DLU_PORTAL_URL=http://localhost:9090 EXPO_PUBLIC_DLU_LMS_URL=http://localhost:9090 \
  EXPO_PUBLIC_STATS_URL=http://localhost:9090 EXPO_PUBLIC_DLU_API_KEY=e2e
(cd ios && xcodebuild -workspace Zen.xcworkspace -scheme Zen -configuration Release -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=<booted device>' -derivedDataPath build-e2e build)
xcrun simctl install booted ios/build-e2e/Build/Products/Release-iphonesimulator/Zen.app

pnpm e2e                        # maestro test e2e
```

The URLs are baked into the bundle and saved into the creds when the account connects, so each flow starts from a fresh install (`clearState`), which then connects to the mock.
Use a release build: a dev build opens the dev launcher first.
A release build still asks GitHub for a newer version, so `sub/start.yaml` dismisses that dialog if it shows.

## Flows

| Flow | What it proves |
|---|---|
| `connect.yaml` | Settings → connect both accounts → every part lands → today's mock lecture is on the home screen |
| `capture-type.yaml` | `zen:///?type=1` → "học nhóm 3h chiều mai" → undo toast → search finds it tomorrow at 15:00 |
| `task-detail.yaml` | a typed task → open from search → rename in detail → new title back home |
| `views.yaml` | day / week / month tabs select |
| `marks-fees.yaml` | marks show the mock GPA (3,60), fees the amount owed (4.500.000 đ), refresh lands |
| `search.yaml` | the mock LMS assignment is found and opens with its course |

`sub/` holds the shared steps (`start`, `connect`). Maestro runs only the top-level files.
Mock data is in `test/msw/fixtures.ts`. Its dates are relative to today, so the flows work on any day.
