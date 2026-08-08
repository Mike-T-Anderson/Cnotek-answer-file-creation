'use strict';
/* Generic helpers: DOM shorthand, XML escaping, UTF-16LE Base64 (unattend password
 * obfuscation), the indenting XML builder, and namespace-agnostic XML tree walkers. */

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const bool = v => v ? 'true' : 'false';

/* Windows setup expects Base64 over UTF-16LE bytes of (password + suffix). */
function b64utf16(s){
  let bytes = '';
  for (let i = 0; i < s.length; i++){
    const c = s.charCodeAt(i);
    bytes += String.fromCharCode(c & 0xFF, c >> 8);
  }
  return btoa(bytes);
}
function fromB64utf16(b64){
  try{
    const bin = atob(String(b64).trim());
    if (bin.length % 2) return null;
    let out = '';
    for (let i = 0; i < bin.length; i += 2)
      out += String.fromCharCode(bin.charCodeAt(i) | (bin.charCodeAt(i + 1) << 8));
    return out;
  }catch(e){ return null; }
}

/* Line-based XML builder that tracks indentation via an open-tag stack.
 * open() accepts a full start tag ("Disk wcm:action=\"add\"") and closes by tag name. */
class XB {
  constructor(){ this.L = []; this.st = []; }
  pad(){ return '    '.repeat(this.st.length); }
  raw(s){ this.L.push(this.pad() + s); }
  open(t){ this.L.push(this.pad() + '<' + t + '>'); this.st.push(t.split(' ')[0]); }
  close(){ const n = this.st.pop(); this.L.push(this.pad() + '</' + n + '>'); }
  leaf(t, v){ const n = t.split(' ')[0]; this.L.push(this.pad() + '<' + t + '>' + esc(v) + '</' + n + '>'); }
  toString(){ return this.L.join('\n'); }
}

/* Emit a <Password>-style node, obfuscated or plain text. */
function pwNode(b, tag, value, obfuscate, suffix){
  b.open(tag);
  if (obfuscate){
    b.leaf('Value', b64utf16(value + suffix));
    b.leaf('PlainText', 'false');
  } else {
    b.leaf('Value', value);
    b.leaf('PlainText', 'true');
  }
  b.close();
}

/* Walk XML children by localName (ignores the unattend namespace). */
function q(el, ...names){
  let cur = el;
  for (const n of names){
    if (!cur) return null;
    cur = Array.from(cur.children).find(c => c.localName === n) || null;
  }
  return cur;
}
const qt = (el, ...names) => { const n = q(el, ...names); return n ? n.textContent.trim() : null; };
