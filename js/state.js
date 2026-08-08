'use strict';
/* Form state: reading the form into a plain state object, dynamic row lists
 * (local accounts / custom commands), and localStorage persistence.
 * Passwords (class "nosave") are deliberately never persisted. */

function ver(){ return document.querySelector('input[name=ver]:checked').value; }

/* WIM image display name matching Microsoft server media, e.g.
 * "Windows Server 2022 Standard (Desktop Experience)". Evaluation Center ISOs
 * name their images "... Standard Evaluation (Desktop Experience)", so the
 * eval flag must be part of the name or /IMAGE/NAME never matches. */
function imageName(s){
  const ed = s.edition === 'datacenter' ? 'Datacenter' : 'Standard';
  return `Windows Server ${s.version} ${ed}` + (s.evalMedia ? ' Evaluation' : '') +
    (s.core === 'desktop' ? ' (Desktop Experience)' : '');
}

function readRows(listId, fields){
  return Array.from($(listId).children).map(row => {
    const o = {};
    fields.forEach(f => { const el = row.querySelector(`[data-f="${f}"]`); o[f] = el ? el.value : ''; });
    return o;
  });
}

function collectState(){
  return {
    version: ver(),
    edition: $('f_edition').value,
    core: $('f_core').value,
    evalMedia: $('f_evalMedia').checked,
    imageMode: $('f_imageMode').value,
    imageIndex: $('f_imageIndex').value,
    key: $('f_key').value.trim(),
    eula: $('f_eula').checked,
    fullname: $('f_fullname').value.trim(),
    org: $('f_org').value.trim(),
    uilang: $('f_uilang').value.trim(),
    inlocale: $('f_inlocale').value.trim(),
    syslocale: $('f_syslocale').value.trim(),
    userlocale: $('f_userlocale').value.trim(),
    tz: $('f_tz').value.trim(),
    diskEnable: $('f_diskEnable').checked,
    firmware: $('f_firmware').value,
    diskId: parseInt($('f_diskId').value || '0', 10),
    efiSize: parseInt($('f_efiSize').value || '260', 10),
    osLabel: $('f_osLabel').value.trim() || 'Windows',
    compname: $('f_compname').value.trim(),
    adminpw: $('f_adminpw').value,
    obfuscate: $('f_obfuscate').checked,
    autologon: $('f_autologon').checked,
    logoncount: parseInt($('f_logoncount').value || '1', 10),
    accounts: readRows('accountsList', ['name', 'display', 'group', 'password', 'desc']),
    netEnable: $('f_netEnable').checked,
    ifid: $('f_ifid').value.trim(),
    ip: $('f_ip').value.trim(),
    gw: $('f_gw').value.trim(),
    dns1: $('f_dns1').value.trim(),
    dns2: $('f_dns2').value.trim(),
    dnsdomain: $('f_dnsdomain').value.trim(),
    joinMode: $('f_joinMode').value,
    workgroup: $('f_workgroup').value.trim(),
    domain: $('f_domain').value.trim(),
    ou: $('f_ou').value.trim(),
    joinCredDomain: $('f_joinCredDomain').value.trim(),
    joinCredUser: $('f_joinCredUser').value.trim(),
    joinCredPw: $('f_joinCredPw').value,
    rdp: $('f_rdp').checked,
    nla: $('f_nla').checked,
    fw: $('f_fw').checked,
    ieesc: $('f_ieesc').checked,
    power: $('f_power').checked,
    srvmgr: $('f_srvmgr').checked,
    psremote: $('f_psremote').checked,
    packerWinrm: $('f_packerwinrm').checked,
    hideEula: $('f_hideEula').checked,
    hideLocal: $('f_hideLocal').checked,
    hideOem: $('f_hideOem').checked,
    hideOnline: $('f_hideOnline').checked,
    hideWireless: $('f_hideWireless').checked,
    pypc: $('f_pypc').value,
    runSync: readRows('runSyncList', ['cmd', 'desc']),
    firstLogon: readRows('firstLogonList', ['cmd', 'desc']),
  };
}

/* ---------- dynamic rows ---------- */
function addAccount(data){
  data = data || {};
  const div = document.createElement('div');
  div.className = 'row-item';
  div.innerHTML = `
    <div class="rhead"><span class="tag">LOCAL ACCOUNT</span><button class="mini danger" data-del>✕ Remove</button></div>
    <div class="rgrid">
      <input type="text" data-f="name" placeholder="Username" value="${esc(data.name || '')}">
      <input type="text" data-f="display" placeholder="Display name" value="${esc(data.display || '')}">
      <select data-f="group">
        <option value="Administrators">Administrators</option>
        <option value="Users">Users</option>
        <option value="Remote Desktop Users">Remote Desktop Users</option>
      </select>
      <input type="password" data-f="password" class="nosave" placeholder="Password" autocomplete="new-password" value="${esc(data.password || '')}">
    </div>
    <input type="text" data-f="desc" placeholder="Description (optional)" value="${esc(data.desc || '')}">`;
  if (data.group) div.querySelector('[data-f=group]').value = data.group;
  $('accountsList').appendChild(div);
}

function addCmd(listId, tag, data){
  data = data || {};
  const div = document.createElement('div');
  div.className = 'row-item';
  div.innerHTML = `
    <div class="rhead"><span class="tag">${tag}</span><button class="mini danger" data-del>✕ Remove</button></div>
    <input type="text" data-f="cmd" placeholder="Command line, e.g. powershell.exe -Command &quot;...&quot;" style="font-family:var(--mono)" value="${esc(data.cmd || '')}">
    <input type="text" data-f="desc" placeholder="Description (optional)" value="${esc(data.desc || '')}">`;
  $(listId).appendChild(div);
}

/* ---------- persistence ---------- */
const LS_KEY = 'cnotek-afs-v1';

function saveLocal(){
  try{
    const data = { fields: {}, accounts: [], runSync: [], firstLogon: [] };
    document.querySelectorAll('input[id^=f_],select[id^=f_]').forEach(el => {
      if (el.classList.contains('nosave') || el.type === 'password') return;
      data.fields[el.id] = (el.type === 'checkbox' || el.type === 'radio') ? el.checked : el.value;
    });
    data.accounts = readRows('accountsList', ['name', 'display', 'group', 'desc']);
    data.runSync = readRows('runSyncList', ['cmd', 'desc']);
    data.firstLogon = readRows('firstLogonList', ['cmd', 'desc']);
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  }catch(e){}
}

function loadLocal(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    Object.entries(data.fields || {}).forEach(([id, v]) => {
      const el = $(id);
      if (!el) return;
      if (el.type === 'checkbox' || el.type === 'radio') el.checked = !!v; else el.value = v;
    });
    (data.accounts || []).forEach(a => addAccount(a));
    (data.runSync || []).forEach(c => addCmd('runSyncList', 'SPECIALIZE COMMAND', c));
    (data.firstLogon || []).forEach(c => addCmd('firstLogonList', 'FIRST LOGON COMMAND', c));
    return true;
  }catch(e){ return false; }
}
