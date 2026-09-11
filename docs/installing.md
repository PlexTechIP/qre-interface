# Installing QRE Interface

Download the installer for your platform from the
[latest release](https://github.com/PlexTechIP/qre-interface/releases/latest),
then follow the notes below. The app is fully self-contained — the QRE engine
(Python + `qdk[qre]`) ships inside it, so there is nothing else to install.

The current builds are **not code-signed**, so both operating systems show a
warning the first time you open the app. This is expected for an unsigned build;
the steps below are the standard way to launch one. (Signing and notarization
can be added later without changing how the app works.)

## macOS

1. Download the `.dmg` for your Mac:
   - **Apple Silicon** (M1/M2/M3…): `QRE-Interface-arm64.dmg`
   - **Intel**: `QRE-Interface-x64.dmg`

   Not sure which you have?  → Apple menu → *About This Mac* and check the chip.
2. Open the `.dmg` and drag **QRE Interface** into **Applications**.
3. The first launch is blocked because the app is unsigned. Either:
   - **Right-click** the app in Applications → **Open** → **Open** in the dialog; or
   - if macOS still refuses ("damaged" / "cannot be opened"), clear the download
     quarantine flag from Terminal, then open normally:
     ```sh
     xattr -dr com.apple.quarantine "/Applications/QRE Interface.app"
     ```

After the first successful open, it launches normally like any other app.

## Windows

1. Download `QRE-Interface-Setup.exe` and run it.
2. Windows SmartScreen may warn about an unrecognized app. Click **More info** →
   **Run anyway**.
3. Follow the installer (you can choose the install location).

## Verifying it works

Open the app, configure a run with the defaults, and click **Run**. A successful
estimate confirms the bundled engine is working — no separate Python install is
needed. If a run fails to start, see
[`setup-and-troubleshooting.md`](setup-and-troubleshooting.md).
