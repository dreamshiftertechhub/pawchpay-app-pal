<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture decisions

- Mobile (Capacitor) requests go through the native CapacitorHttp stack (`plugins.CapacitorHttp.enabled` in `capacitor.config.ts`) because the WebView's CORS preflights get answered without `access-control-allow-origin`; wallet routes additionally send CORS headers for capacitor origins via `src/lib/wallet-auth.server.ts`.
- The Android app ships its screens from `mobile/` (built by `scripts/build-mobile.mjs`, synced with `cap sync android`) and sends all money requests to the published site (`API_BASE` in `public/pawch-backend.js`); a new mobile bundle must be built and synced before any Android build.
- Android icon and native splash are regenerated from the `assets/` brand images with `bunx @capacitor/assets generate --android` — never hand-edit generated `android/app/src/main/res` mipmap/splash files.
- The Android debug APK is built by `.github/workflows/build-android.yml` (this workspace has no Java/Android toolchain); never claim an APK exists until a real build succeeds.
