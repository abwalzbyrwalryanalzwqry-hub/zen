// صفحة التحقق العام من الشهائد (فحص الاستوديو H1، 1.23.0): ثابتة في الموقع العام نفسه (verify/index.html)، يفتحها
// QR الشهادة لمن لا يملك التطبيق. تنادي verify_certificate_public بمفتاح Supabase العام (المنشور أصلاً في التطبيق)،
// وتعرض الحالة والرقم والاسم المختصر والجهة والنوع والتاريخ فقط. لا innerHTML: كل نص من الخادم يدخل textContent،
// وCSP يسمح بسكربت هذه الصفحة وحده (بالبصمة) والاتصال بخادم Supabase وحده.
import { createHash } from "node:crypto";

const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

const CSS = `body{margin:0;font-family:system-ui,"Segoe UI",Tahoma,sans-serif;background:#0f1a17;color:#e8efe9;line-height:1.8}
main{max-width:30rem;margin:0 auto;padding:2rem 1.25rem 4rem}h1{font-size:1.4rem;margin:0 0 .25rem}p.sub{color:#9fb3aa;font-size:.85rem;margin:0 0 1.25rem}
form{display:flex;gap:.5rem;margin:0 0 1rem}input{flex:1;min-width:0;font:inherit;padding:.6rem .8rem;border-radius:.75rem;border:1px solid #2b3d36;background:#16241f;color:inherit;direction:ltr;text-align:center;letter-spacing:.05em}
button{font:inherit;font-weight:700;padding:.6rem 1rem;border-radius:.75rem;border:0;background:#7fd1a8;color:#0f1a17;cursor:pointer}
#out{background:#16241f;border-radius:1rem;padding:1rem 1.25rem;border:1px solid #2b3d36}#out[hidden]{display:none}
.st{font-weight:900;font-size:1.05rem;margin:0 0 .5rem}.ok{color:#7fd1a8}.bad{color:#ff8a80}.warn{color:#e5c07b}
dl{display:grid;grid-template-columns:auto 1fr;gap:.25rem .75rem;margin:0;font-size:.9rem}dt{color:#9fb3aa}dd{margin:0;font-weight:700;overflow-wrap:anywhere}
a{color:#e5c07b}footer{color:#9fb3aa;font-size:.8rem;margin-top:1.5rem}`;

/** الشيفرة المضمّنة: تُبصم لـCSP، فلا يعمل سكربت غيرها. */
function script(url, key) {
  return `(function(){
var U=${JSON.stringify(url.replace(/\/+$/, ""))}+"/rest/v1/rpc/verify_certificate_public",K=${JSON.stringify(key)};
var f=document.getElementById("f"),i=document.getElementById("c"),o=document.getElementById("out"),app=document.getElementById("app");
var L={valid:["الشهادة صحيحة","ok"],revoked:["الشهادة ملغاة","bad"],replaced:["استُبدلت بشهادة أحدث","warn"],invalid:["لا توجد شهادة بهذا الرمز","bad"],rate_limited:["محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة.","warn"]};
function clean(s){return String(s||"").toUpperCase().replace(/[^A-Z0-9]/g,"");}
function row(dl,k,v){if(!v)return;var a=document.createElement("dt");a.textContent=k;var b=document.createElement("dd");b.textContent=v;dl.appendChild(a);dl.appendChild(b);}
function show(r){o.textContent="";o.hidden=false;var l=L[r.status]||L.invalid;var p=document.createElement("p");p.className="st "+l[1];p.textContent=l[0];o.appendChild(p);
if(r.status==="valid"||r.status==="revoked"||r.status==="replaced"){var dl=document.createElement("dl");
row(dl,"رقم الشهادة",r.certificate_number||(r.juz?"شهادة إتمام الجزء "+r.juz:""));row(dl,"الطالب",r.student_name);row(dl,"الجهة",r.center_name);
row(dl,"النوع",r.type_name);row(dl,"تاريخ الإصدار",r.issue_date);row(dl,"تاريخ الإلغاء",r.revoked_at);row(dl,"الشهادة البديلة",r.replaced_by);if(r.approved)row(dl,"الاعتماد","اعتمدتها إدارة الجهة");if(r.fingerprint)row(dl,"بصمة الشهادة",r.fingerprint);o.appendChild(dl);}}
function go(code){code=clean(code);if(code.length!==16){show({status:"invalid"});return;}
app.href="zen://verify?code="+code;app.hidden=false;o.hidden=false;o.textContent="جارٍ التحقق…";
fetch(U,{method:"POST",headers:{"Content-Type":"application/json",apikey:K,Authorization:"Bearer "+K},body:JSON.stringify({_code:code})})
.then(function(x){if(!x.ok)throw 0;return x.json();}).then(show).catch(function(){o.textContent="تعذّر الاتصال. تحقّق من الإنترنت ثم أعد المحاولة.";});}
f.addEventListener("submit",function(e){e.preventDefault();go(i.value);});
var q=new URLSearchParams(location.search).get("code");if(q){i.value=q;go(q);}
})();`;
}

export function verifyPage({ url, key, contact }) {
  const js = script(url, key);
  const hash = createHash("sha256").update(js).digest("base64");
  const origin = new URL(url).origin;
  const csp = `default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; connect-src ${origin}; form-action 'none'; base-uri 'none'`;
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<title>التحقق من شهادة — زِن</title>
<style>${CSS}</style>
</head>
<body><main>
<h1>التحقق من شهادة</h1>
<p class="sub">اكتب رمز التحقق المطبوع على الشهادة (16 حرفاً) أو امسح رمز QR بالكاميرا.</p>
<form id="f"><input id="c" autocomplete="off" inputmode="latin" maxlength="24" placeholder="XXXX-XXXX-XXXX-XXXX" aria-label="رمز التحقق"><button>تحقّق</button></form>
<div id="out" role="status" aria-live="polite" hidden></div>
<p><a id="app" hidden>افتح في تطبيق زِن</a></p>
<footer>يظهر الاسم الأول وحرف من اسم العائلة فقط حفاظاً على خصوصية الطالب.${contact ? ` للتواصل: <a href="mailto:${esc(contact)}">${esc(contact)}</a>` : ""}</footer>
</main><script>${js}</script></body>
</html>
`;
}
