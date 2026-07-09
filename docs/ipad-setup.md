# EpiBins — iPad Setup Guide

Follow these steps exactly. Each section has a ✅ when done.

---

## Step 1 — Install Xcode (one-time, ~15 min download)

1. Open the **App Store** on your Mac
2. Search for **Xcode**
3. Click **Get** (it's free, ~10 GB)
4. Wait for download and install to complete
5. Open Xcode once so it can install additional components
6. Agree to the license when prompted

**Verify:** Open Terminal and run:
```bash
xcode-select -p
```
Expected output: `/Applications/Xcode.app/Contents/Developer`

If it still shows `/Library/Developer/CommandLineTools`, run:
```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

---

## Step 2 — Install Node.js (one-time)

Your current Homebrew Node is broken (icu4c mismatch). Install a fresh one:

```bash
# Option A — recommended: use nvm (Node Version Manager)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Restart Terminal, then:
nvm install 20
nvm use 20
node --version   # should print v20.x.x
npm --version    # should print 10.x.x
```

```bash
# Option B — download installer directly
# Go to: https://nodejs.org → click "LTS" → download .pkg → install
```

---

## Step 3 — Install CocoaPods (one-time)

CocoaPods manages the native iOS libraries Capacitor needs.

```bash
sudo gem install cocoapods
pod --version    # should print 1.x.x
```

If `gem` fails (Ruby version issue):
```bash
brew install ruby
echo 'export PATH="/opt/homebrew/opt/ruby/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
gem install cocoapods
```

---

## Step 4 — Install EpiBins dependencies

```bash
cd ~/EpiBins
npm install
```

Expected: installs React, Capacitor, Vite, and all other packages into `node_modules/`.

---

## Step 5 — Build the web app

```bash
npm run build
```

This creates `~/EpiBins/dist/` — the compiled web app that Capacitor wraps.

---

## Step 6 — Add the iOS platform (one-time)

```bash
npx cap add ios
npx cap sync
```

This creates `~/EpiBins/ios/` — a full Xcode project that wraps your web app.

---

## Step 7 — Connect your iPad

1. Plug your iPad into your Mac with a USB-C cable
2. On the iPad, a dialog will appear: **"Trust This Computer?"**
3. Tap **Trust** and enter your iPad passcode
4. On the Mac, your iPad should appear in Finder in the left sidebar

---

## Step 8 — Open in Xcode and sign the app

```bash
npx cap open ios
```

This opens Xcode with the EpiBins project.

In Xcode:
1. Click **EpiBins** in the left panel (the top-level project item)
2. Click the **Signing & Capabilities** tab
3. Under **Team**, click the dropdown and select **Add an Account...**
4. Sign in with your **Apple ID** (free — no paid developer account needed for device testing)
5. After signing in, select your Apple ID from the Team dropdown
6. Xcode will auto-create a provisioning profile

---

## Step 9 — Run on your iPad

1. In the top toolbar, click the **device selector** (currently shows "iPhone 16 Pro" or similar)
2. Select your iPad from the list — it appears under **Your iPad Name** (actual device)
3. Click the **▶ Run** button (or press `⌘R`)
4. First build takes ~2–3 minutes
5. EpiBins will install and launch on your iPad automatically

---

## Step 10 — Development mode (live reload)

While developing, you can run the app with live reload so changes appear instantly:

```bash
# Terminal 1 — start the Vite dev server
npm run dev

# Terminal 2 — find your Mac's local IP
ipconfig getifaddr en0

# Edit capacitor.config.ts — uncomment these two lines and set your IP:
#   url: "http://YOUR_LOCAL_IP:5173",
#   cleartext: true,

# Then sync and run:
npx cap sync
npx cap run ios
```

---

## Windows build

On a Windows machine (or via GitHub Actions):

```bash
npm install
npm run build
npm run electron:build
```

Produces `dist/EpiBins Setup.exe` — double-click to install.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `xcodebuild: error: SDK "iphoneos" cannot be located` | Xcode not fully installed or wrong path. Run `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` |
| `pod install` fails with SSL error | Run `gem update --system` then `gem install cocoapods` |
| iPad not showing in Xcode device list | Unplug, re-plug, trust the computer again. Check iPad is unlocked. |
| "Untrusted Developer" alert on iPad | On iPad: Settings → General → VPN & Device Management → your Apple ID → Trust |
| `npm install` fails | Make sure you ran `nvm use 20` first. Check `node --version` shows 20.x |
| White screen on iPad | Usually a build issue. Run `npm run build` again, then `npx cap sync`, then rebuild in Xcode |

---

## What you'll see on your iPad

- Dark background app named **EpiBins**
- Tap **Open video** to load a video from your iPad's Files app
- Fundamental Knowledge Bins panel on the right (landscape) / bottom (portrait)
- Tap **Next gap →** to be prompted for the lowest-numbered unfilled bin
- Write your explanation → tap **Fill this bin** → bin turns green
- When all bins are filled → congratulations screen

---

## Quick command reference

```bash
# Full rebuild + sync + run on iPad
npm run build && npx cap sync && npx cap run ios

# Open Xcode directly
npx cap open ios

# Dev server (for live reload)
npm run dev
```
