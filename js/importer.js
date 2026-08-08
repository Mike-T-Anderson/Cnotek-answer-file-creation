'use strict';
/* Import: parse an existing unattend XML back into the form. Components the form
 * does not model are reported and survive only in the Editor tab — regenerating
 * from the form drops them, and the import report says so explicitly. */

function readPw(node, suffix, warnings, label){
  if (!node) return '';
  const val = qt(node, 'Value') || '';
  const plain = (qt(node, 'PlainText') || 'true').toLowerCase() !== 'false';
  if (plain) return val;
  const dec = fromB64utf16(val);
  if (dec !== null && dec.endsWith(suffix)) return dec.slice(0, -suffix.length);
  warnings.push(`Could not decode the ${label} (left blank — re-enter it if needed).`);
  return '';
}

function importXml(text, sourceLabel){
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  if (doc.querySelector('parsererror')){
    showReport('err', `<b>${esc(sourceLabel)}:</b> not valid XML — ` +
      esc(doc.querySelector('parsererror').textContent.split('\n')[0]));
    return;
  }
  const root = doc.documentElement;
  if (root.localName !== 'unattend'){
    showReport('err', `<b>${esc(sourceLabel)}:</b> root element is &lt;${esc(root.localName)}&gt;, expected &lt;unattend&gt;.`);
    return;
  }

  const warnings = [], unmapped = [], mapped = [];
  const KNOWN = new Set(['Microsoft-Windows-International-Core-WinPE', 'Microsoft-Windows-Setup',
    'Microsoft-Windows-Shell-Setup', 'Microsoft-Windows-TCPIP', 'Microsoft-Windows-DNS-Client',
    'Microsoft-Windows-UnattendedJoin', 'Microsoft-Windows-TerminalServices-LocalSessionManager',
    'Microsoft-Windows-TerminalServices-RDP-WinStationExtensions', 'Networking-MPSSVC-Svc',
    'Microsoft-Windows-Deployment', 'Microsoft-Windows-International-Core',
    'Microsoft-Windows-IE-ESC']);

  // reset dynamic rows and toggles; scalar fields are overwritten below where found
  ['accountsList', 'runSyncList', 'firstLogonList'].forEach(id => $(id).innerHTML = '');
  $('f_rdp').checked = false; $('f_nla').checked = false; $('f_fw').checked = false;
  $('f_ieesc').checked = false; $('f_power').checked = false; $('f_srvmgr').checked = false;
  $('f_psremote').checked = false; $('f_packerwinrm').checked = false; $('f_autologon').checked = false;
  $('f_diskEnable').checked = false; $('f_netEnable').checked = false;
  $('f_joinMode').value = 'none'; $('f_imageMode').value = 'none';
  $('f_key').value = ''; $('f_adminpw').value = ''; $('f_evalMedia').checked = false;

  let sawIeesc = false;

  for (const settings of Array.from(root.children).filter(c => c.localName === 'settings')){
    const pass = settings.getAttribute('pass');
    for (const comp of Array.from(settings.children).filter(c => c.localName === 'component')){
      const name = comp.getAttribute('name');
      if (!KNOWN.has(name)){ unmapped.push(`${name} (${pass})`); continue; }

      if (name === 'Microsoft-Windows-International-Core-WinPE' || name === 'Microsoft-Windows-International-Core'){
        const ui = qt(comp, 'UILanguage') || qt(comp, 'SetupUILanguage', 'UILanguage');
        if (ui) $('f_uilang').value = ui;
        const il = qt(comp, 'InputLocale'); if (il) $('f_inlocale').value = il;
        const sl = qt(comp, 'SystemLocale'); if (sl) $('f_syslocale').value = sl;
        const ul = qt(comp, 'UserLocale'); if (ul) $('f_userlocale').value = ul;
        mapped.push('Regional settings');
      }

      else if (name === 'Microsoft-Windows-Setup'){
        const ud = q(comp, 'UserData');
        if (ud){
          $('f_eula').checked = (qt(ud, 'AcceptEula') || '').toLowerCase() === 'true';
          const fn = qt(ud, 'FullName'); if (fn) $('f_fullname').value = fn;
          const og = qt(ud, 'Organization'); if (og) $('f_org').value = og;
          const key = qt(ud, 'ProductKey', 'Key'); if (key) $('f_key').value = key;
          mapped.push('UserData / product key');
        }
        const disk = q(comp, 'DiskConfiguration', 'Disk');
        if (disk){
          $('f_diskEnable').checked = true;
          $('f_diskId').value = qt(disk, 'DiskID') || '0';
          const parts = q(disk, 'CreatePartitions');
          let isUefi = false;
          if (parts) for (const p of Array.from(parts.children)){
            const t = (qt(p, 'Type') || '').toUpperCase();
            if (t === 'EFI'){ isUefi = true; const sz = qt(p, 'Size'); if (sz) $('f_efiSize').value = sz; }
          }
          $('f_firmware').value = isUefi ? 'uefi' : 'bios';
          const mods = q(disk, 'ModifyPartitions');
          if (mods) for (const m of Array.from(mods.children)){
            if ((qt(m, 'Letter') || '').toUpperCase() === 'C' && qt(m, 'Label')) $('f_osLabel').value = qt(m, 'Label');
          }
          mapped.push('Disk configuration');
        }
        const meta = q(comp, 'ImageInstall', 'OSImage', 'InstallFrom', 'MetaData');
        if (meta){
          const k = (qt(meta, 'Key') || '').toUpperCase();
          const v = qt(meta, 'Value') || '';
          if (k === '/IMAGE/NAME'){
            $('f_imageMode').value = 'name';
            const verRe = new RegExp('Server\\s+(' + Object.keys(GVLK).join('|') + ')', 'i');
            const ym = v.match(verRe);
            if (ym) $('f_ver' + ym[1]).checked = true;
            $('f_edition').value = /datacenter/i.test(v) ? 'datacenter' : 'standard';
            $('f_core').value = /desktop experience/i.test(v) ? 'desktop' : 'core';
            $('f_evalMedia').checked = /\bEvaluation\b/i.test(v);
          } else if (k === '/IMAGE/INDEX'){
            $('f_imageMode').value = 'index';
            $('f_imageIndex').value = v;
          }
          mapped.push('Image selection');
        }
      }

      else if (name === 'Microsoft-Windows-Shell-Setup' && pass === 'specialize'){
        const cn = qt(comp, 'ComputerName'); if (cn) $('f_compname').value = cn;
        const tz = qt(comp, 'TimeZone'); if (tz) $('f_tz').value = tz;
        const ro = qt(comp, 'RegisteredOrganization'); if (ro) $('f_org').value = ro;
        const rw = qt(comp, 'RegisteredOwner'); if (rw) $('f_fullname').value = rw;
        mapped.push('Computer name / time zone');
      }

      else if (name === 'Microsoft-Windows-TCPIP'){
        const iface = q(comp, 'Interfaces', 'Interface');
        if (iface){
          $('f_netEnable').checked = true;
          $('f_ifid').value = qt(iface, 'Identifier') || '';
          const ip = q(iface, 'UnicastIpAddresses');
          if (ip && ip.children.length) $('f_ip').value = ip.children[0].textContent.trim();
          const route = q(iface, 'Routes', 'Route');
          if (route) $('f_gw').value = qt(route, 'NextHopAddress') || '';
          mapped.push('Static IP');
        }
      }

      else if (name === 'Microsoft-Windows-DNS-Client'){
        const iface = q(comp, 'Interfaces', 'Interface');
        if (iface){
          const dd = qt(iface, 'DNSDomain'); if (dd) $('f_dnsdomain').value = dd;
          const order = q(iface, 'DNSServerSearchOrder');
          if (order){
            const ips = Array.from(order.children).map(c => c.textContent.trim());
            if (ips[0]) $('f_dns1').value = ips[0];
            if (ips[1]) $('f_dns2').value = ips[1];
          }
          mapped.push('DNS');
        }
      }

      else if (name === 'Microsoft-Windows-UnattendedJoin'){
        const id = q(comp, 'Identification');
        if (id){
          const dom = qt(id, 'JoinDomain'), wg = qt(id, 'JoinWorkgroup');
          if (dom){
            $('f_joinMode').value = 'domain';
            $('f_domain').value = dom;
            $('f_ou').value = qt(id, 'MachineObjectOU') || '';
            const cred = q(id, 'Credentials');
            if (cred){
              $('f_joinCredDomain').value = qt(cred, 'Domain') || '';
              $('f_joinCredUser').value = qt(cred, 'Username') || '';
              $('f_joinCredPw').value = qt(cred, 'Password') || '';
            }
            mapped.push('Domain join');
          } else if (wg){
            $('f_joinMode').value = 'workgroup';
            $('f_workgroup').value = wg;
            mapped.push('Workgroup');
          }
        }
      }

      else if (name === 'Microsoft-Windows-TerminalServices-LocalSessionManager'){
        if ((qt(comp, 'fDenyTSConnections') || '').toLowerCase() === 'false'){
          $('f_rdp').checked = true;
          mapped.push('RDP');
        }
      }
      else if (name === 'Microsoft-Windows-TerminalServices-RDP-WinStationExtensions'){
        $('f_nla').checked = (qt(comp, 'UserAuthentication') || '0') === '1';
      }
      else if (name === 'Networking-MPSSVC-Svc'){
        $('f_fw').checked = true;
      }

      else if (name === 'Microsoft-Windows-IE-ESC'){
        if ((qt(comp, 'IEHardenAdmin') || '').toLowerCase() === 'false'){ $('f_ieesc').checked = true; sawIeesc = true; }
        mapped.push('IE ESC');
      }

      else if (name === 'Microsoft-Windows-Deployment'){
        const rs = q(comp, 'RunSynchronous');
        if (rs) for (const c of Array.from(rs.children)){
          const path = qt(c, 'Path') || '';
          const desc = qt(c, 'Description') || '';
          if (path.includes('A509B1A7') || path.includes('A509B1A8')){ $('f_ieesc').checked = true; sawIeesc = true; }
          else if (path.includes('8c5e7fda')) $('f_power').checked = true;
          else if (path.includes('DoNotOpenServerManagerAtLogon')) $('f_srvmgr').checked = true;
          else addCmd('runSyncList', 'SPECIALIZE COMMAND', { cmd: path, desc });
        }
        mapped.push('Specialize commands');
      }

      else if (name === 'Microsoft-Windows-Shell-Setup' && pass === 'oobeSystem'){
        const al = q(comp, 'AutoLogon');
        if (al && (qt(al, 'Enabled') || '').toLowerCase() === 'true'){
          $('f_autologon').checked = true;
          $('f_logoncount').value = qt(al, 'LogonCount') || '1';
          const pw = readPw(q(al, 'Password'), 'Password', warnings, 'auto-logon password');
          if (pw && !$('f_adminpw').value) $('f_adminpw').value = pw;
        }
        const oobe = q(comp, 'OOBE');
        if (oobe){
          const flag = (n, id) => { const v = qt(oobe, n); if (v !== null) $(id).checked = v.toLowerCase() === 'true'; };
          flag('HideEULAPage', 'f_hideEula');
          flag('HideLocalAccountScreen', 'f_hideLocal');
          flag('HideOEMRegistrationScreen', 'f_hideOem');
          flag('HideOnlineAccountScreens', 'f_hideOnline');
          flag('HideWirelessSetupInOOBE', 'f_hideWireless');
          const py = qt(oobe, 'ProtectYourPC'); if (py) $('f_pypc').value = py;
          mapped.push('OOBE flags');
        }
        const ua = q(comp, 'UserAccounts');
        if (ua){
          const apw = readPw(q(ua, 'AdministratorPassword'), 'AdministratorPassword', warnings, 'Administrator password');
          if (apw) $('f_adminpw').value = apw;
          const la = q(ua, 'LocalAccounts');
          if (la) for (const acc of Array.from(la.children)){
            addAccount({
              name: qt(acc, 'Name') || '',
              display: qt(acc, 'DisplayName') || '',
              group: qt(acc, 'Group') || 'Administrators',
              desc: qt(acc, 'Description') || '',
              password: readPw(q(acc, 'Password'), 'Password', warnings, `password for account “${qt(acc, 'Name')}”`),
            });
          }
          mapped.push('User accounts');
        }
        const fl = q(comp, 'FirstLogonCommands');
        if (fl){
          const packerSet = new Set(PACKER_WINRM_CMDS.map(c => c.cmd));
          for (const c of Array.from(fl.children)){
            const cmd = qt(c, 'CommandLine') || '';
            const desc = qt(c, 'Description') || '';
            if (cmd.includes('Enable-PSRemoting')) $('f_psremote').checked = true;
            else if (packerSet.has(cmd)) $('f_packerwinrm').checked = true;
            else addCmd('firstLogonList', 'FIRST LOGON COMMAND', { cmd, desc });
          }
          mapped.push('First-logon commands');
        }
        const ro = qt(comp, 'RegisteredOrganization'); if (ro) $('f_org').value = ro;
        const rw = qt(comp, 'RegisteredOwner'); if (rw) $('f_fullname').value = rw;
      }
    }
  }

  // if no /IMAGE/NAME told us the version, try the product key
  const key = $('f_key').value.trim();
  for (const [v, eds] of Object.entries(GVLK))
    for (const [ed, k] of Object.entries(eds))
      if (k === key){ $('f_ver' + v).checked = true; $('f_edition').value = ed; }
  if (sawIeesc && ver() === '2025') warnings.push('File disables IE ESC but Server 2025 is selected — IE ESC does not exist on 2025, so that tweak will be dropped on regeneration.');

  refresh();

  let html = `<b>${esc(sourceLabel)} imported.</b> Mapped: ${mapped.length ? esc([...new Set(mapped)].join(', ')) : 'nothing recognised'}.`;
  if (unmapped.length)
    html += `<br>⚠ Components kept only in the Editor tab (the form/generator does not model them, so <b>regenerating from the form drops them</b>): <ul>` +
      [...new Set(unmapped)].map(u => '<li>' + esc(u) + '</li>').join('') + '</ul>';
  if (warnings.length) html += '<ul>' + warnings.map(w => '<li>' + esc(w) + '</li>').join('') + '</ul>';
  showReport(unmapped.length || warnings.length ? 'warn' : 'good', html);
}

function showReport(kind, html){
  const el = $('importReport');
  el.className = 'banner show ' + kind;
  el.innerHTML = html + ' <a href="#" style="color:inherit" onclick="this.parentElement.className=\'banner\';return false"><b>dismiss</b></a>';
}
