const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const CONFIG_URL = "nexora_supabase_url";
const CONFIG_KEY = "nexora_supabase_key";
let client = null, authMode = "login", currentUser = null, profile = null, projects = [], toastTimer;

$("#year").textContent = new Date().getFullYear();

function toast(message) {
  const el = $("#toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}
function message(selector, text, error=false) {
  const el=$(selector); el.textContent=text; el.style.color=error?"#c34251":"";
}
function escapeHTML(value="") {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function configured() { return !!(localStorage.getItem(CONFIG_URL) && localStorage.getItem(CONFIG_KEY)); }
function connect() {
  if (!window.supabase?.createClient) throw new Error("تعذر تحميل مكتبة Supabase. تحقق من اتصال الإنترنت.");
  const url=(localStorage.getItem(CONFIG_URL)||"").trim(), key=(localStorage.getItem(CONFIG_KEY)||"").trim();
  if (!url || !key) throw new Error("أدخل رابط المشروع والمفتاح العام أولًا.");
  client=window.supabase.createClient(url,key);
  return client;
}
function setAuthUI(signedIn) {
  $("#authView").classList.toggle("hidden",signedIn);
  $("#appView").classList.toggle("hidden",!signedIn);
  $("#logoutBtn").classList.toggle("hidden",!signedIn);
  $("#userLabel").textContent=signedIn?(currentUser?.email||"مستخدم"):"غير مسجل الدخول";
  $("#setupNotice").classList.toggle("hidden",configured());
  $("#adminSection").classList.toggle("hidden", !(signedIn && profile?.role==="admin"));
}
async function refreshSession() {
  if (!configured()) { currentUser=null; profile=null; setAuthUI(false); return; }
  try {
    connect();
    const {data:{session},error}=await client.auth.getSession();
    if(error) throw error;
    currentUser=session?.user||null;
    if(currentUser) { await loadProfile(); await loadProjects(); }
    else { profile=null; projects=[]; }
    setAuthUI(!!currentUser);
    if(currentUser) renderProjects();
  } catch(e) {
    setAuthUI(false); message("#authMessage",e.message,true);
  }
}
async function loadProfile() {
  const {data,error}=await client.from("profiles").select("id,email,role").eq("id",currentUser.id).maybeSingle();
  if(error) throw error;
  profile=data||{id:currentUser.id,email:currentUser.email,role:"user"};
}
async function loadProjects() {
  const {data,error}=await client.from("projects").select("id,name,description,status,due_date,created_at,owner_id,profiles(email)").order("created_at",{ascending:false});
  if(error) throw error;
  projects=data||[];
}
function statusClass(status) { return status==="مكتمل"?"done":status==="متوقف"?"paused":""; }
function renderProjects() {
  const query=($("#searchProjects").value||"").trim().toLowerCase();
  const list=projects.filter(p=>(p.name+" "+(p.description||"")).toLowerCase().includes(query));
  $("#statTotal").textContent=projects.length;
  $("#statActive").textContent=projects.filter(p=>p.status==="قيد التنفيذ").length;
  $("#statDone").textContent=projects.filter(p=>p.status==="مكتمل").length;
  $("#projectGrid").innerHTML=list.length?list.map(p=>`
    <article class="project-card">
      <div class="project-top"><h3>${escapeHTML(p.name)}</h3><span class="status ${statusClass(p.status)}">${escapeHTML(p.status)}</span></div>
      <p>${escapeHTML(p.description||"لا يوجد وصف مضاف لهذا المشروع.")}</p>
      <div class="project-meta"><span>${p.due_date?"التسليم: "+escapeHTML(p.due_date):"بدون موعد تسليم"}</span><span>${new Date(p.created_at).toLocaleDateString("ar-EG")}</span></div>
      <div class="project-actions"><button class="mini-btn" data-edit="${p.id}">تعديل</button><button class="mini-btn danger" data-delete="${p.id}">حذف</button></div>
    </article>`).join(""):`<div class="empty">لا توجد مشاريع مطابقة. ابدأ بإنشاء مشروع جديد.</div>`;
  $("#projectGrid").querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",()=>editProject(b.dataset.edit)));
  $("#projectGrid").querySelectorAll("[data-delete]").forEach(b=>b.addEventListener("click",()=>deleteProject(b.dataset.delete)));
  if(profile?.role==="admin") renderAdmin();
}
function renderAdmin() {
  const q=($("#adminSearch").value||"").toLowerCase().trim(), st=$("#adminStatus").value;
  const list=projects.filter(p=>(p.name+" "+(p.description||"")+" "+(p.profiles?.email||"")).toLowerCase().includes(q)&&(!st||p.status===st));
  $("#adminProjects").innerHTML=list.length?list.map(p=>`<tr><td><strong>${escapeHTML(p.name)}</strong><br><span class="muted">${escapeHTML(p.description||"")}</span></td><td>${escapeHTML(p.profiles?.email||"مستخدم")}</td><td><span class="status ${statusClass(p.status)}">${escapeHTML(p.status)}</span></td><td>${new Date(p.created_at).toLocaleDateString("ar-EG")}</td><td><button class="mini-btn" data-admin-edit="${p.id}">تعديل</button> <button class="mini-btn danger" data-admin-delete="${p.id}">حذف</button></td></tr>`).join(""):`<tr><td colspan="5">لا توجد مشاريع.</td></tr>`;
  $("#adminProjects").querySelectorAll("[data-admin-edit]").forEach(b=>b.addEventListener("click",()=>editProject(b.dataset.adminEdit)));
  $("#adminProjects").querySelectorAll("[data-admin-delete]").forEach(b=>b.addEventListener("click",()=>deleteProject(b.dataset.adminDelete)));
}
function openProject(project=null) {
  $("#projectForm").reset(); $("#projectId").value=project?.id||"";
  $("#projectDialogTitle").textContent=project?"تعديل المشروع":"مشروع جديد";
  $("#projectName").value=project?.name||""; $("#projectDescription").value=project?.description||"";
  $("#projectStatus").value=project?.status||"مخطط"; $("#projectDue").value=project?.due_date||"";
  $("#projectTasks").value=(project?.tasks||[]).map(t=>t.title).join("\n");
  message("#projectMessage",""); $("#projectDialog").showModal();
}
function editProject(id) { const p=projects.find(x=>x.id===id); if(p) openProject(p); }
async function saveProject(event) {
  event.preventDefault(); if(!client||!currentUser) return;
  const id=$("#projectId").value;
  const payload={name:$("#projectName").value.trim(),description:$("#projectDescription").value.trim(),status:$("#projectStatus").value,due_date:$("#projectDue").value||null};
  if(!payload.name) return message("#projectMessage","اسم المشروع مطلوب.",true);
  try {
    let result;
    if(id) result=await client.from("projects").update(payload).eq("id",id).select().single();
    else result=await client.from("projects").insert({...payload,owner_id:currentUser.id}).select().single();
    if(result.error) throw result.error;
    const projectId=result.data.id;
    const taskLines=$("#projectTasks").value.split("\n").map(s=>s.trim()).filter(Boolean);
    const {error:deleteError}=await client.from("tasks").delete().eq("project_id",projectId);
    if(deleteError) throw deleteError;
    if(taskLines.length) {
      const {error:taskError}=await client.from("tasks").insert(taskLines.map(title=>({project_id:projectId,title,owner_id:currentUser.id})));
      if(taskError) throw taskError;
    }
    $("#projectDialog").close(); await loadProjects(); renderProjects(); toast(id?"تم تحديث المشروع":"تم إنشاء المشروع");
  } catch(e) { message("#projectMessage",friendlyError(e),true); }
}
async function deleteProject(id) {
  const p=projects.find(x=>x.id===id); if(!p||!confirm(`هل تريد حذف المشروع «${p.name}»؟`)) return;
  try {
    const {error}=await client.from("projects").delete().eq("id",id); if(error) throw error;
    await loadProjects(); renderProjects(); toast("تم حذف المشروع");
  } catch(e) { toast(friendlyError(e)); }
}
function friendlyError(e) {
  const s=e?.message||String(e);
  if(s.includes("profiles")) return "جدول profiles غير جاهز. شغّل ملف supabase.sql كاملًا.";
  if(s.includes("projects")||s.includes("tasks")||s.includes("schema cache")) return "تأكد من تشغيل ملف supabase.sql وتحديث الصفحة.";
  if(s.includes("Invalid login credentials")) return "البريد أو كلمة المرور غير صحيحة.";
  return s;
}
function chooseAuth(mode) {
  authMode=mode; $$(".tab").forEach(b=>b.classList.toggle("active",b.dataset.auth===mode));
  $("#authSubmit").textContent=mode==="login"?"دخول إلى مساحة العمل":"إنشاء الحساب";
  $("#password").autocomplete=mode==="login"?"current-password":"new-password";
  message("#authMessage","");
}
$("#authForm").addEventListener("submit",async e=>{
  e.preventDefault(); message("#authMessage","جارٍ الاتصال...");
  try {
    if(!configured()) throw new Error("افتح إعدادات الربط وأدخل بيانات Supabase.");
    connect(); const email=$("#email").value.trim(),password=$("#password").value;
    const result=authMode==="login"?await client.auth.signInWithPassword({email,password}):await client.auth.signUp({email,password});
    if(result.error) throw result.error;
    if(authMode==="signup"&&!result.data.session) message("#authMessage","تم إنشاء الحساب. راجع بريدك لتأكيد التسجيل، ثم سجّل الدخول.");
    else { message("#authMessage","تم تسجيل الدخول."); await refreshSession(); }
  } catch(e) { message("#authMessage",friendlyError(e),true); }
});
$("#logoutBtn").addEventListener("click",async()=>{try{await client.auth.signOut();currentUser=null;profile=null;projects=[];setAuthUI(false);toast("تم تسجيل الخروج");}catch(e){toast(e.message)}});
$$("[data-auth]").forEach(b=>b.addEventListener("click",()=>chooseAuth(b.dataset.auth)));
$("#newProjectBtn").addEventListener("click",()=>openProject());
$("#projectForm").addEventListener("submit",saveProject);
$("#searchProjects").addEventListener("input",renderProjects);
$("#adminSearch").addEventListener("input",renderAdmin); $("#adminStatus").addEventListener("change",renderAdmin);
$("#settingsBtn").addEventListener("click",()=>{ $("#supabaseUrl").value=localStorage.getItem(CONFIG_URL)||""; $("#supabaseKey").value=localStorage.getItem(CONFIG_KEY)||""; message("#settingsMessage",""); $("#settingsDialog").showModal(); });
$("#settingsForm").addEventListener("submit",async e=>{
  e.preventDefault(); const url=$("#supabaseUrl").value.trim().replace(/\/+$/,""),key=$("#supabaseKey").value.trim();
  try {
    if(!url.startsWith("https://")||!url.includes(".supabase.co")) throw new Error("أدخل رابط Supabase صحيحًا.");
    if(!key) throw new Error("المفتاح العام مطلوب.");
    localStorage.setItem(CONFIG_URL,url);localStorage.setItem(CONFIG_KEY,key);connect();
    const {error}=await client.auth.getSession(); if(error) throw error;
    $("#settingsDialog").close(); toast("تم حفظ الإعدادات"); await refreshSession();
  } catch(e) { message("#settingsMessage",e.message,true); }
});
$$("[data-close]").forEach(b=>b.addEventListener("click",()=>$("#"+b.dataset.close).close()));
window.addEventListener("DOMContentLoaded",refreshSession);
