# Google account photo in the top-right corner

## TL;DR

Today the Google Drive backup is reached through a big "Guardar dados online" button on
the player list, and nothing shows which Google account is connected. We add a small round
account button in the top-right corner, like other apps: a Google "G" before connecting,
the connected account's photo afterwards, with a warning dot when the connection needs
attention. Tapping it opens the save screen. To get the photo, the game also asks Google
for the account's basic profile (name and photo). Both stay on the device.

## Steps

- [x] Google console: add the `userinfo.profile` scope to "Xavier Anguera apps" (non-sensitive,
      no review).
- [x] `js/config.js`: ask for `drive.appdata` plus `userinfo.profile`. Keep the Drive scope as
      its own constant so the code can check it was granted.
- [x] `js/cloud-sync.js`:
  - after each token, check Google actually granted Drive access (Google lets people untick
    individual permissions). Without it, fail with a clear error.
  - if the profile permission was granted and no profile is saved yet, read name and photo
    from Google's userinfo endpoint and save them on the device; tell the UI.
  - `disconnect()` forgets the saved profile.
- [x] `js/app.js`:
  - an account button: photo (or the name's first letter if the photo can't load, e.g.
    offline), "G" when not connected, warning dot when it needs reconnecting or a choice.
  - show it at the right of the shared top bar, except mid-round (stage, test, review run),
    where a tap would pull the child out of the round.
  - on the player list, a top row with the button; keep the big save button only while not
    connected, as the call to action.
  - on the save screen, show "Ligado como <name>" with the photo.
- [x] `css/style.css`: style for the button.
- [x] `sw.js`: bump the cache to `v6` so installed copies pick up the change.
- [x] Privacy policy (`xanguera.github.io/public/privacy.html`): say the app reads name and
      photo, only shows them on the device, never stores them elsewhere.

## Decisions

- Photo is loaded straight from Google with `referrerpolicy="no-referrer"` (Google's photo
  server sometimes refuses requests that carry a referrer).
- Accounts connected before this change get asked once more by Google (the new permission
  needs consent). The existing "needs reconnecting" path covers that.

## Review

All steps done. Tested locally in Chrome with a fake connected account and photo:

- not connected: white "G" in the corner, big "Guardar dados online" button still on the
  player list;
- connected: photo in the corner, big button gone, "Ligado como …" on the save screen;
- silent sign-in failing (as it does on a local address): red warning dot on the photo;
- mid-round (stage): no account button.

One problem found and fixed: on a 375px-wide phone, the stage list's top bar (back, home,
player, streak, points, account) no longer fitted and wrapped onto two lines. The bar now
stays on one line: long player names shorten with "…", and below 400px the screens with
both back and home buttons show only the player's avatar. Checked at 375px with an
18-letter name.

Not tested here: the real Google sign-in with the new profile permission. That needs a
person to approve Google's consent window.
