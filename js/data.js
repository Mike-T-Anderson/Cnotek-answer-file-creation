'use strict';
/* Static data: supported versions, KMS client setup keys (GVLKs), tweak commands.
 * To add a new Windows Server version: add its GVLK entry here, add a radio button
 * in index.html (id must be f_ver<year>), and review any version-specific tweaks
 * in generator.js/app.js (e.g. IE ESC does not exist on 2025+). */

const GVLK = {
  '2019': { standard: 'N69G4-B89J2-4G8F4-WWYCC-J464C', datacenter: 'WMDGN-G9PQG-XVVXX-R3X43-63DFG' },
  '2022': { standard: 'VDYBN-27WPP-V4HQT-9VMD4-VMK7H', datacenter: 'WX4NM-KYWYW-QJJR4-XV3QB-6VM33' },
  '2025': { standard: 'TVRH6-WHNXV-R9WG3-9XRFY-MY832', datacenter: 'D764K-2NDRG-47T6Q-P8T8W-YP6DF' },
};
const ALL_GVLKS = new Set(Object.values(GVLK).flatMap(v => Object.values(v)));

/* Attribute block shared by every <component> element. */
const CATTRS = 'processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS" xmlns:wcm="http://schemas.microsoft.com/WMIConfig/2002/State" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"';

/* Command lines injected by the quick-tweak toggles. The importer matches on
 * distinctive substrings (GUIDs / value names) to map commands back to toggles.
 * Note: IE ESC is not a command — it uses the documented Microsoft-Windows-IE-ESC
 * unattend component (IEHardenAdmin/IEHardenUser) in the specialize pass. */
const TWEAK_CMDS = {
  power:    'powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c',
  srvmgr:   'reg add "HKLM\\SOFTWARE\\Microsoft\\ServerManager" /v DoNotOpenServerManagerAtLogon /t REG_DWORD /d 1 /f',
  psremote: 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Enable-PSRemoting -Force -SkipNetworkProfileCheck"',
};

/* First-logon command sequence that opens WinRM for Packer's winrm communicator
 * (HTTP 5985, Basic auth, unencrypted). Intended for isolated build networks only —
 * the image should be sysprepped at the end of the build. The importer matches these
 * strings exactly to map them back to the toggle. */
const PACKER_WINRM_CMDS = [
  { cmd: 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-NetConnectionProfile | Set-NetConnectionProfile -NetworkCategory Private"', desc: 'Set network profile to Private so WinRM config succeeds' },
  { cmd: 'cmd.exe /c winrm quickconfig -q', desc: 'Enable WinRM' },
  { cmd: 'cmd.exe /c winrm set winrm/config/service @{AllowUnencrypted="true"}', desc: 'WinRM: allow unencrypted (build network only)' },
  { cmd: 'cmd.exe /c winrm set winrm/config/service/auth @{Basic="true"}', desc: 'WinRM: enable Basic auth' },
  { cmd: 'cmd.exe /c winrm set winrm/config/winrs @{MaxMemoryPerShellMB="1024"}', desc: 'WinRM: raise shell memory limit' },
  { cmd: 'cmd.exe /c netsh advfirewall firewall add rule name="WinRM HTTP 5985" dir=in action=allow protocol=TCP localport=5985', desc: 'Firewall: open TCP 5985' },
  { cmd: 'cmd.exe /c sc config winrm start= auto', desc: 'WinRM service: start automatically' },
];
