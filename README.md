# Golden Image Generator

A static web app for building **unattended answer files (`autounattend.xml` / `unattend.xml`) for Windows Server 2019, 2022, and 2025 golden images**. Everything runs client-side in the browser — no server, no build step, no dependencies, nothing uploaded anywhere.

## Run it

Just open [`index.html`](index.html) in any modern browser (double-click it), or serve the folder if you prefer:

```bash
python -m http.server 8611
```

It also works as-is on GitHub Pages: repo **Settings → Pages → Deploy from a branch** → select `main` / root.

## Project structure

```
├── index.html        # markup only — form sections, preview panel, script load order
├── css/
│   └── styles.css    # all styling (dark theme, cards, toggles, preview panel)
└── js/               # plain scripts, no modules/bundler — load order is set in index.html
    ├── data.js       # GVLK (KMS) keys per version/edition + quick-tweak command strings
    ├── util.js       # XML builder, escaping, UTF-16LE Base64, namespace-agnostic XML walkers
    ├── state.js      # form → state object, dynamic rows, localStorage persistence
    ├── generator.js  # buildXml(): state → unattend XML, plus validation rules
    ├── importer.js   # importXml(): uploaded/edited XML → form, with unmapped-component report
    └── app.js        # UI wiring: live preview, tabs, upload/download/copy, init
```

The scripts are deliberately classic `<script>` tags rather than ES modules so the app keeps working when opened straight from the filesystem (`file://`), where module imports are blocked by CORS.

### Common changes

- **New Windows Server version**: add its GVLK entry in `js/data.js`, add a radio button in `index.html` (id must follow the `f_ver<year>` pattern), and review version-specific behaviour (e.g. the IE ESC tweak is auto-dropped for 2025+ in `js/generator.js` / `js/app.js`).
- **New quick-tweak toggle**: add the command string to `TWEAK_CMDS` in `js/data.js`, emit it in `js/generator.js`, add the toggle in `index.html`, and teach `js/importer.js` to recognise a distinctive substring of it so imports map back to the toggle.
- **New form field**: add the input to `index.html`, read it in `collectState()` (`js/state.js`), emit it in `js/generator.js`, and map it back in `js/importer.js`.

## Features

- **Server 2019 / 2022 / 2025** targeting — Standard or Datacenter, Desktop Experience or Server Core, image selection by name, index, or product key. An **Evaluation Center media** toggle adjusts the image name (eval ISOs name images "… Standard Evaluation (Desktop Experience)", which `/IMAGE/NAME` must match exactly).
- **One-click KMS client keys (GVLKs)** for the selected version/edition — Microsoft's public keys that activate only against your KMS host / AD-based activation. Leave the key blank for evaluation media.
- **Disk layout** — UEFI/GPT (EFI + MSR + OS) or BIOS/MBR (System + OS), with wipe-disk warning.
- **Regional settings** — locales and Windows time zone (defaults to en-AU / AUS Eastern).
- **Accounts** — Administrator password (Base64-obfuscated by default), auto-logon, extra local accounts.
- **Static IPv4** — interface, CIDR address, gateway, DNS via the TCPIP / DNS-Client components.
- **Domain join or workgroup** — including machine OU and join credentials.
- **Quick tweaks** — enable RDP (+NLA + firewall group), disable IE ESC via the documented `Microsoft-Windows-IE-ESC` component (2019/2022 only — auto-dropped for 2025 where IE ESC no longer exists), high-performance power plan, suppress Server Manager at logon, enable PowerShell remoting, WinRM bootstrap for Packer.
- **⚡ Packer golden-image preset** — one click configures the form for a Packer build on Hyper-V Gen 2 (see below).
- **OOBE flags** and custom commands (specialize `RunSynchronous` + `FirstLogonCommands`).
- **Upload & edit existing XML** — parses a file back into the form (including decoding obfuscated passwords), flags any components the form doesn't model, and keeps the original in a raw **Editor** tab for hand-editing and download.
- Live syntax-highlighted preview, copy/download, inline validation (computer name, key format, IP formats, missing credentials, missing Administrator password — Server OOBE stops without one, product key on eval media), and form auto-save in the browser (passwords are never saved).

## Using with Packer (Hyper-V golden images)

The primary workflow this tool was built for: bake a golden image with Packer's `hyperv-iso` builder, then let a separate deployment job set the computer name, join the domain, and assign IPs.

1. Click **⚡ Packer golden-image preset** — it sets a random computer name, no domain join or static IP (your post-deploy job owns those), auto-logon ×1, and the **WinRM bootstrap for Packer** first-logon commands (HTTP 5985, Basic auth, unencrypted — isolated build networks only).
2. Set the Administrator password — this is what you pass Packer as `winrm_password` — pick the version/edition (tick **Evaluation Center media** if building from an eval ISO), and download `autounattend.xml`.
3. Attach it via `cd_files` (Generation 2 VMs have no floppy) and keep the default UEFI/GPT disk layout for Gen 2 (use BIOS/MBR for Gen 1):

   ```hcl
   source "hyperv-iso" "ws2022" {
     generation     = 2
     cd_files       = ["./autounattend.xml"]
     communicator   = "winrm"
     winrm_username = "Administrator"
     winrm_password = "<the password from the form>"
     winrm_timeout  = "4h"
     # iso_url, switch_name, cpus, memory, disk_size ...
   }
   ```

4. End the build by generalizing the image so every deployment gets a fresh SID and OOBE state:

   ```powershell
   C:\Windows\System32\Sysprep\sysprep.exe /generalize /oobe /quiet /shutdown
   ```

The WinRM bootstrap deliberately opens Basic/unencrypted HTTP so the Packer communicator can connect on the build network — treat build VMs as untrusted until sysprepped, or switch your provisioners to WinRM-HTTPS/SSH if the build network isn't isolated.

## Usage notes

- Name the file **`autounattend.xml`** and put it at the root of the install USB/ISO for a fully hands-off install, or **`unattend.xml`** for DISM / imaging pipelines (`dism /apply-unattend`).
- Password "obfuscation" is Base64, not encryption — anyone with the file can decode it. Treat answer files containing domain-join or admin credentials as secrets and delete them from built machines (`C:\Windows\Panther`).
- Importing a file with components the form doesn't model keeps them only in the Editor tab; regenerating from the form drops them (the import report tells you exactly which ones).
- Schema reference: [Microsoft Unattend documentation](https://learn.microsoft.com/en-us/windows-hardware/customize/desktop/unattend/).
