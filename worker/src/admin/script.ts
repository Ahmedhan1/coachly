/**
 * The only script on the admin pages (served as a file so the CSP stays `script-src 'self'`):
 * - copy buttons, with a fallback for browsers without the async clipboard API;
 * - quick actions (approve / enable) without a page reload: the form posts with `X-Admin-Inline: 1` and the
 *   server answers with the updated card, which replaces the old one. Without JS the form posts normally.
 */
export const ADMIN_SCRIPT = `document.addEventListener('click',function(e){
var b=e.target&&e.target.closest?e.target.closest('[data-copy]'):null;if(!b)return;
var el=document.getElementById(b.getAttribute('data-copy'));if(!el)return;
var text=el.value!==undefined&&el.tagName==='TEXTAREA'?el.value:el.textContent;
var out=document.getElementById(b.getAttribute('data-copy')+'-copied');
function ok(){if(out){out.textContent='اتنسخ';setTimeout(function(){out.textContent='';},2500);}}
function fallback(){var t=document.createElement('textarea');t.value=text;t.setAttribute('readonly','');t.style.position='fixed';t.style.opacity='0';document.body.appendChild(t);t.select();try{document.execCommand('copy');ok();}catch(_){}document.body.removeChild(t);}
if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(text).then(ok,fallback);}else{fallback();}
});
document.addEventListener('submit',function(e){
var f=e.target;if(!f||!f.hasAttribute||!f.hasAttribute('data-inline')||!window.fetch)return;
e.preventDefault();var card=f.closest('.acct');var btn=f.querySelector('button');if(btn)btn.disabled=true;
fetch(f.action,{method:'POST',body:new URLSearchParams(new FormData(f)),headers:{'X-Admin-Inline':'1'},credentials:'same-origin'})
.then(function(r){if(!r.ok)throw r;return r.text();})
.then(function(html){if(!card)return location.reload();var t=document.createElement('div');t.innerHTML=html.trim();var n=t.firstElementChild;if(n)card.replaceWith(n);var w=document.getElementById('waiting-count');if(w&&f.action.slice(-8)==='/approve'){var c=Math.max(0,(parseInt(w.textContent,10)||1)-1);w.textContent=String(c);}})
.catch(function(){f.removeAttribute('data-inline');f.submit();});
});
(function(){
var dlg=null;
function frag(html){var d=new DOMParser().parseFromString(html,'text/html');return d.querySelector('[data-frag]');}
function close(){if(dlg){dlg.close();}}
function show(node){
if(!dlg){dlg=document.createElement('dialog');dlg.addEventListener('click',function(e){if(e.target===dlg)close();});document.body.appendChild(dlg);}
dlg.innerHTML='';var wrap=node.classList.contains('card')?node:(function(){var c=document.createElement('div');c.className='card';c.appendChild(node);return c;})();
var x=document.createElement('button');x.type='button';x.className='x';x.setAttribute('aria-label','قفل');x.textContent='×';x.addEventListener('click',close);wrap.insertBefore(x,wrap.firstChild);
dlg.appendChild(wrap);if(!dlg.open)dlg.showModal();var first=wrap.querySelector('input:not([type=hidden]):not([type=radio]),select,textarea');if(first&&first.type!=='date')first.focus();
}
function go(f){var get=(f.method||'').toLowerCase()==='get';var body=new URLSearchParams(new FormData(f));
var url=get?f.action+'?'+body.toString():f.action;
return fetch(url,get?{credentials:'same-origin'}:{method:'POST',body:body,credentials:'same-origin'}).then(function(r){
var u=new URL(r.url);if(u.pathname==='/admin'||u.pathname==='/admin/'){location.href=r.url;return null;}
return r.text().then(function(t){var n=frag(t);if(!n){location.href=r.url;return null;}show(n);return n;});});}
document.addEventListener('submit',function(e){var f=e.target;if(!f||!window.fetch||!window.HTMLDialogElement)return;
var inDlg=dlg&&dlg.contains(f);if(!inDlg&&!f.hasAttribute('data-dialog'))return;
e.preventDefault();var b=f.querySelector('button[type=submit]');if(b)b.disabled=true;
go(f).catch(function(){f.removeAttribute('data-dialog');f.submit();}).then(function(){if(b)b.disabled=false;});});
document.addEventListener('click',function(e){var a=e.target&&e.target.closest?e.target.closest('a[href="/admin"]'):null;if(a&&dlg&&dlg.contains(a)){e.preventDefault();close();}});
})();`;

