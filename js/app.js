'use strict';
/* UI glue: live preview rendering, dependent-field visibility, tabs,
 * upload/download/copy, event wiring, and init. Loaded last. */

let lastXml = '';
let activeTab = 'gen';

function highlight(xml){
  return esc(xml)
    .replace(/(&lt;\/?)([A-Za-z0-9:_.-]+)/g, '$1<span class="t">$2</span>')
    .replace(/([A-Za-z0-9:_.-]+)=(&quot;.*?&quot;)/g, '<span class="a">$1</span>=<span class="v">$2</span>')
    .replace(/(&lt;!--.*?--&gt;)/g, '<span class="d">$1</span>');
}

function refresh(){
  const s = collectState();

  // dependent visibility
  $('wrapImageIndex').style.display = s.imageMode === 'index' ? '' : 'none';
  $('diskOpts').style.display = s.diskEnable ? '' : 'none';
  $('wrapEfi').style.display = s.firmware === 'uefi' ? '' : 'none';
  $('wrapLogonCount').style.display = s.autologon ? '' : 'none';
  $('netOpts').style.display = s.netEnable ? '' : 'none';
  $('wrapWorkgroup').style.display = s.joinMode === 'workgroup' ? '' : 'none';
  $('domainOpts').style.display = s.joinMode === 'domain' ? '' : 'none';
  $('rdpOpts').style.display = s.rdp ? '' : 'none';

  const is2025 = s.version === '2025';
  $('swIeesc').classList.toggle('dis', is2025);
  $('ieescNote').textContent = is2025 ? '(not applicable — IE ESC was removed in Server 2025)' : '(2019/2022 with Desktop Experience)';

  $('imageNameHint').innerHTML = s.imageMode === 'name'
    ? 'Image name written to the answer file: <code>' + esc(imageName(s)) + '</code>'
    : (s.imageMode === 'index'
        ? 'Typical WIM indexes: 1 = Standard Core, 2 = Standard (Desktop), 3 = Datacenter Core, 4 = Datacenter (Desktop).'
        : 'No image is pre-selected — setup picks the edition matching the product key.');
  $('layoutHint').innerHTML = s.firmware === 'uefi'
    ? 'Layout: <code>1 EFI ' + s.efiSize + ' MB</code> · <code>2 MSR 16 MB</code> · <code>3 Windows (rest of disk, C:)</code>'
    : 'Layout: <code>1 System 100 MB (active)</code> · <code>2 Windows (rest of disk, C:)</code>';

  // GVLK auto-follow: swap only when the field already holds a (different) GVLK
  const keyEl = $('f_key');
  if (ALL_GVLKS.has(keyEl.value.trim())) keyEl.value = GVLK[s.version][s.edition];

  // validation
  const errs = validate(s);
  const vb = $('validation');
  if (errs.length){
    vb.innerHTML = '<b>Check these before using the file:</b><ul>' + errs.map(e => '<li>' + esc(e) + '</li>').join('') + '</ul>';
    vb.classList.add('show');
  } else vb.classList.remove('show');

  // generate
  lastXml = buildXml(collectState());
  $('xmlout').innerHTML = highlight(lastXml);
  $('stPasses').textContent = (lastXml.match(/<settings pass=/g) || []).length;
  $('stComps').textContent = (lastXml.match(/<component name=/g) || []).length;
  $('stSize').textContent = (lastXml.length / 1024).toFixed(1) + ' KB';
  $('genStamp').textContent = imageName(s);

  saveLocal();
}

/* ---------- tabs / io ---------- */
function setTab(t){
  activeTab = t;
  $('tabGen').classList.toggle('on', t === 'gen');
  $('tabEd').classList.toggle('on', t === 'ed');
  $('tabGuide').classList.toggle('on', t === 'guide');
  $('xmlout').style.display = t === 'gen' ? '' : 'none';
  $('edwrap').style.display = t === 'ed' ? 'flex' : 'none';
  $('guidewrap').style.display = t === 'guide' ? 'block' : 'none';
  $('stMode').innerHTML = 'Download source: <b>' + (t === 'ed' ? 'Editor' : 'Generated') + '</b>';
}

function download(){
  const content = activeTab === 'ed' && $('xmled').value.trim() ? $('xmled').value : lastXml;
  const name = $('f_filename').value.trim() || 'autounattend.xml';
  const blob = new Blob([content], { type: 'text/xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function copyOut(){
  const content = activeTab === 'ed' && $('xmled').value.trim() ? $('xmled').value : lastXml;
  try{
    await navigator.clipboard.writeText(content);
    $('btnCopy').textContent = '✓ Copied';
  }catch(e){
    const ta = document.createElement('textarea');
    ta.value = content; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
    $('btnCopy').textContent = '✓ Copied';
  }
  setTimeout(() => $('btnCopy').textContent = 'Copy', 1400);
}

/* ---------- wiring ---------- */
document.querySelectorAll('section.card > h2').forEach(h =>
  h.addEventListener('click', () => h.parentElement.classList.toggle('closed')));

$('formcol').addEventListener('input', refresh);
$('formcol').addEventListener('change', refresh);
$('formcol').addEventListener('click', e => {
  if (e.target.matches('[data-del]')){ e.target.closest('.row-item').remove(); refresh(); }
});

$('btnAddAccount').addEventListener('click', () => { addAccount(); refresh(); });
$('btnAddRunSync').addEventListener('click', () => { addCmd('runSyncList', 'SPECIALIZE COMMAND'); refresh(); });
$('btnAddFirstLogon').addEventListener('click', () => { addCmd('firstLogonList', 'FIRST LOGON COMMAND'); refresh(); });

/* One-click setup for a Packer golden-image build on Hyper-V Gen 2: random name,
 * no domain join / static IP (the post-deploy job owns those), auto-logon ×1 to
 * trigger the WinRM bootstrap that Packer's winrm communicator connects through. */
function applyPackerPreset(){
  $('f_compname').value = '*';
  $('f_joinMode').value = 'none';
  $('f_netEnable').checked = false;
  $('f_diskEnable').checked = true;
  $('f_firmware').value = 'uefi';           // Hyper-V Gen 2 boots UEFI
  $('f_imageMode').value = 'name';
  $('f_autologon').checked = true;
  $('f_logoncount').value = 1;
  $('f_packerwinrm').checked = true;
  $('f_psremote').checked = false;
  $('f_rdp').checked = true; $('f_nla').checked = true; $('f_fw').checked = true;
  $('f_srvmgr').checked = true;
  ['f_hideEula', 'f_hideLocal', 'f_hideOem', 'f_hideOnline', 'f_hideWireless'].forEach(id => $(id).checked = true);
  $('f_pypc').value = '3';
  refresh();
  showReport('good', '<b>Packer preset applied</b> — random computer name, no domain join, auto-logon ×1, ' +
    'WinRM bootstrap for the Packer winrm communicator, UEFI/GPT for a Hyper-V Gen 2 VM. ' +
    'Now set the Administrator password (this is Packer’s <code>winrm_password</code>), pick version/edition, and Download. ' +
    'Leave naming/domain/IP to your post-deploy job, and end the build with <code>sysprep /generalize /oobe /shutdown</code>.');
}
$('btnPackerPreset').addEventListener('click', applyPackerPreset);

$('btnGvlk').addEventListener('click', () => {
  $('f_key').value = GVLK[ver()][$('f_edition').value];
  refresh();
});
$('btnEye').addEventListener('click', e => {
  e.preventDefault();
  const p = $('f_adminpw');
  p.type = p.type === 'password' ? 'text' : 'password';
});

$('tabGen').addEventListener('click', () => setTab('gen'));
$('tabEd').addEventListener('click', () => setTab('ed'));
$('tabGuide').addEventListener('click', () => setTab('guide'));

// copy buttons on the guide's code blocks
$('guidewrap').addEventListener('click', async e => {
  if (!e.target.classList.contains('gcopy')) return;
  const pre = e.target.parentElement.querySelector('pre');
  try{ await navigator.clipboard.writeText(pre.textContent); }
  catch(err){
    const ta = document.createElement('textarea');
    ta.value = pre.textContent; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
  }
  e.target.textContent = '✓ Copied';
  setTimeout(() => e.target.textContent = 'Copy', 1400);
});
$('btnDownload').addEventListener('click', download);
$('btnCopy').addEventListener('click', copyOut);
$('btnUpload').addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    $('xmled').value = r.result;
    importXml(r.result, f.name);
    setTab('ed');
  };
  r.readAsText(f);
  e.target.value = '';
});
$('btnGenToEd').addEventListener('click', () => {
  $('xmled').value = lastXml;
  $('edStatus').textContent = 'Generated XML copied into editor.';
  $('edStatus').style.color = 'var(--good)';
});
$('btnEdToForm').addEventListener('click', () => {
  if (!$('xmled').value.trim()){ $('edStatus').textContent = 'Editor is empty.'; $('edStatus').style.color = 'var(--warn)'; return; }
  importXml($('xmled').value, 'Editor content');
});
$('btnValidate').addEventListener('click', () => {
  const txt = $('xmled').value;
  if (!txt.trim()){ $('edStatus').textContent = 'Editor is empty.'; $('edStatus').style.color = 'var(--warn)'; return; }
  const doc = new DOMParser().parseFromString(txt, 'text/xml');
  const err = doc.querySelector('parsererror');
  if (err){
    $('edStatus').textContent = '✗ ' + err.textContent.split('\n').find(l => l.trim());
    $('edStatus').style.color = 'var(--err)';
  } else {
    $('edStatus').textContent = '✓ Well-formed XML (' + doc.querySelectorAll('component').length + ' components)';
    $('edStatus').style.color = 'var(--good)';
  }
});
$('btnReset').addEventListener('click', () => {
  if (!confirm('Reset the form to defaults? Saved values in this browser are cleared.')) return;
  localStorage.removeItem(LS_KEY);
  location.reload();
});

/* ---------- init ---------- */
loadLocal();
refresh();
