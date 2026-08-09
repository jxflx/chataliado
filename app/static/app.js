// Dashboard mínimo de ChatAliado (JS vanilla, sin dependencias).
let token = localStorage.getItem("token") || null;
let currentConversationId = null;

const $ = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || data?.detail?.[0]?.msg || data?.detail || "Error";
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data;
}

function showError(id, err) { $(id).textContent = err?.message || String(err); }
function clearError(id) { $(id).textContent = ""; }
function fmt(dt) { return new Date(dt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }); }
function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

// ---------- Auth ----------
async function afterLogin() {
  const me = await api("/auth/me");
  $("user-info").textContent = me.full_name;
  $("auth-panel").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("logout-btn").classList.remove("hidden");
  await Promise.all([loadServices(), loadPatients(), loadAppointments(), loadConversations(), loadRules(), loadBlocked()]);
}

$("login-btn").onclick = async () => {
  clearError("auth-error");
  try {
    const data = await api("/auth/login", { method: "POST", body: JSON.stringify({ email: $("login-email").value, password: $("login-password").value }) });
    token = data.access_token; localStorage.setItem("token", token);
    await afterLogin();
  } catch (e) { showError("auth-error", e); }
};

$("register-btn").onclick = async () => {
  clearError("auth-error");
  try {
    const data = await api("/auth/register", { method: "POST", body: JSON.stringify({
      business_name: $("reg-business").value, full_name: $("reg-name").value,
      email: $("reg-email").value, password: $("reg-password").value }) });
    token = data.access_token; localStorage.setItem("token", token);
    await afterLogin();
  } catch (e) { showError("auth-error", e); }
};

$("logout-btn").onclick = () => { localStorage.removeItem("token"); location.reload(); };

// ---------- Tabs ----------
document.querySelectorAll("nav.tabs button").forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll("nav.tabs button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll("main section.panel[id^='tab-']").forEach((s) => s.classList.add("hidden"));
    $(`tab-${btn.dataset.tab}`).classList.remove("hidden");
  };
});

// ---------- Servicios ----------
async function loadServices() {
  const services = await api("/services");
  $("services-body").innerHTML = services.map((s) => `
    <tr><td>${esc(s.name)}</td><td>$${s.price}</td><td>${s.duration_minutes} min</td>
    <td>${s.modality === "online" ? "En línea" : "Presencial"}</td>
    <td>${s.is_active ? "Sí" : "No"}</td>
    <td><button class="secondary" onclick="toggleService(${s.id}, ${!s.is_active})">${s.is_active ? "Desactivar" : "Activar"}</button></td></tr>`).join("");
  const opts = services.filter((s) => s.is_active).map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("");
  $("apt-service").innerHTML = opts;
}

window.toggleService = async (id, active) => {
  try { await api(`/services/${id}`, { method: "PATCH", body: JSON.stringify({ is_active: active }) }); await loadServices(); }
  catch (e) { showError("app-error", e); }
};

$("svc-create").onclick = async () => {
  clearError("app-error");
  try {
    await api("/services", { method: "POST", body: JSON.stringify({
      name: $("svc-name").value, price: $("svc-price").value,
      duration_minutes: parseInt($("svc-duration").value), modality: $("svc-modality").value }) });
    await loadServices();
  } catch (e) { showError("app-error", e); }
};

// ---------- Pacientes ----------
async function loadPatients() {
  const patients = await api("/patients");
  $("apt-patient").innerHTML = patients.map((p) => `<option value="${p.id}">${esc(p.full_name)} (${esc(p.phone)})</option>`).join("");
}

$("pat-create").onclick = async () => {
  clearError("app-error");
  try {
    await api("/patients", { method: "POST", body: JSON.stringify({ full_name: $("pat-name").value, phone: $("pat-phone").value }) });
    await loadPatients();
  } catch (e) { showError("app-error", e); }
};

// ---------- Citas ----------
async function loadAppointments() {
  const [appointments, patients, services] = await Promise.all([api("/appointments"), api("/patients"), api("/services")]);
  const pmap = Object.fromEntries(patients.map((p) => [p.id, p.full_name]));
  const smap = Object.fromEntries(services.map((s) => [s.id, s.name]));
  $("appointments-body").innerHTML = appointments.map((a) => `
    <tr><td>${esc(pmap[a.patient_id] || a.patient_id)}</td><td>${esc(smap[a.service_id] || a.service_id)}</td>
    <td>${fmt(a.start_at)}</td><td><span class="badge ${a.status}">${a.status}</span></td>
    <td>${["pending", "confirmed"].includes(a.status) ? `<button class="secondary" onclick="cancelApt(${a.id})">Cancelar</button>` : ""}</td></tr>`).join("");
}

window.cancelApt = async (id) => {
  try { await api(`/appointments/${id}`, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) }); await loadAppointments(); }
  catch (e) { showError("app-error", e); }
};

$("apt-create").onclick = async () => {
  clearError("app-error");
  try {
    await api("/appointments", { method: "POST", body: JSON.stringify({
      patient_id: parseInt($("apt-patient").value), service_id: parseInt($("apt-service").value),
      start_at: $("apt-start").value }) });
    await loadAppointments();
  } catch (e) { showError("app-error", e); }
};

$("apt-slots").onclick = async () => {
  clearError("app-error");
  try {
    const serviceId = $("apt-service").value;
    if (!serviceId) throw new Error("Crea primero un servicio activo");
    const from = new Date(), to = new Date(Date.now() + 7 * 86400000);
    const iso = (d) => d.toISOString().slice(0, 10);
    const slots = await api(`/availability?service_id=${serviceId}&from_date=${iso(from)}&to_date=${iso(to)}`);
    $("slots-list").innerHTML = slots.length
      ? slots.slice(0, 40).map((s) => `<button class="secondary" style="margin:3px" onclick="pickSlot('${s.start_at}')">${fmt(s.start_at)}</button>`).join("")
      : "<em>No hay horarios disponibles. Configura reglas en la pestaña Horarios.</em>";
  } catch (e) { showError("app-error", e); }
};

window.pickSlot = (startAt) => { $("apt-start").value = startAt.slice(0, 16); };

// ---------- Disponibilidad ----------
const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function ruleRow(rule = { weekday: 0, start_time: "09:00", end_time: "17:00" }) {
  const div = document.createElement("div");
  div.className = "row rule-row";
  div.innerHTML = `
    <select class="r-weekday">${WEEKDAYS.map((d, i) => `<option value="${i}" ${i === rule.weekday ? "selected" : ""}>${d}</option>`).join("")}</select>
    <input class="r-start" type="time" value="${rule.start_time.slice(0, 5)}">
    <input class="r-end" type="time" value="${rule.end_time.slice(0, 5)}">
    <button class="secondary" onclick="this.parentElement.remove()">Quitar</button>`;
  return div;
}

async function loadRules() {
  const rules = await api("/availability/rules");
  const editor = $("rules-editor");
  editor.innerHTML = "";
  rules.forEach((r) => editor.appendChild(ruleRow(r)));
}

$("rule-add").onclick = () => $("rules-editor").appendChild(ruleRow());

$("rules-save").onclick = async () => {
  clearError("app-error");
  try {
    const rules = [...document.querySelectorAll(".rule-row")].map((row) => ({
      weekday: parseInt(row.querySelector(".r-weekday").value),
      start_time: row.querySelector(".r-start").value,
      end_time: row.querySelector(".r-end").value,
    }));
    await api("/availability/rules", { method: "PUT", body: JSON.stringify({ rules }) });
    await loadRules();
  } catch (e) { showError("app-error", e); }
};

async function loadBlocked() {
  const periods = await api("/availability/blocked-periods");
  $("blocked-body").innerHTML = periods.map((p) => `
    <tr><td>${fmt(p.start_at)}</td><td>${fmt(p.end_at)}</td><td>${esc(p.reason)}</td>
    <td><button class="secondary" onclick="deleteBlocked(${p.id})">Eliminar</button></td></tr>`).join("");
}

window.deleteBlocked = async (id) => {
  try { await api(`/availability/blocked-periods/${id}`, { method: "DELETE" }); await loadBlocked(); }
  catch (e) { showError("app-error", e); }
};

$("blk-create").onclick = async () => {
  clearError("app-error");
  try {
    await api("/availability/blocked-periods", { method: "POST", body: JSON.stringify({
      start_at: $("blk-start").value, end_at: $("blk-end").value, reason: $("blk-reason").value }) });
    await loadBlocked();
  } catch (e) { showError("app-error", e); }
};

// ---------- Conversaciones ----------
async function loadConversations() {
  const conversations = await api("/conversations");
  const pending = conversations.filter((c) => c.status === "human_requested");
  const alert = $("pending-alert");
  if (pending.length) {
    alert.textContent = `⚠ ${pending.length} conversación(es) necesitan atención humana`;
    alert.classList.remove("hidden");
  } else { alert.classList.add("hidden"); }
  $("conversations-body").innerHTML = conversations.map((c) => `
    <tr style="cursor:pointer" onclick="openConversation(${c.id}, '${esc(c.patient_name)}')">
    <td>${esc(c.patient_name)}<br><small>${esc(c.patient_phone)}</small></td>
    <td><span class="badge ${c.status}">${c.status}</span></td>
    <td>${fmt(c.last_activity_at)}</td></tr>`).join("");
}

window.openConversation = async (id, name) => {
  currentConversationId = id;
  $("conv-detail").classList.remove("hidden");
  $("conv-title").textContent = `Conversación con ${name}`;
  await loadMessages();
};

async function loadMessages() {
  if (!currentConversationId) return;
  const messages = await api(`/conversations/${currentConversationId}/messages`);
  $("conv-messages").innerHTML = messages.map((m) => `
    <div class="msg ${m.author}">${esc(m.text)}<small>${m.author} · ${fmt(m.created_at)}</small></div>`).join("");
  $("conv-messages").scrollTop = $("conv-messages").scrollHeight;
}

$("staff-send").onclick = async () => {
  clearError("app-error");
  try {
    await api(`/conversations/${currentConversationId}/messages`, { method: "POST", body: JSON.stringify({ text: $("staff-text").value }) });
    $("staff-text").value = "";
    await Promise.all([loadMessages(), loadConversations()]);
  } catch (e) { showError("app-error", e); }
};

$("conv-takeover").onclick = async () => {
  clearError("app-error");
  try {
    await api(`/conversations/${currentConversationId}/takeover`, { method: "POST", body: JSON.stringify({}) });
    await loadConversations();
  } catch (e) { showError("app-error", e); }
};

$("conv-close").onclick = async () => {
  clearError("app-error");
  try {
    await api(`/conversations/${currentConversationId}/close`, { method: "POST" });
    await loadConversations();
  } catch (e) { showError("app-error", e); }
};

// Refresco ligero de conversaciones cada 5 s cuando hay sesión.
setInterval(() => { if (token && !$("app").classList.contains("hidden")) { loadConversations(); loadMessages(); } }, 5000);

// ---------- Init ----------
if (token) { afterLogin().catch(() => { localStorage.removeItem("token"); token = null; }); }
