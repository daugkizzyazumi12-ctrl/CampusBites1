const Model = {
  criteria: [
    { key: "food", label: "Food quality" },
    { key: "taste", label: "Taste" },
    { key: "hygiene", label: "Hygiene & cleanliness" },
    { key: "portion", label: "Portion size" },
    { key: "service", label: "Service" }
  ],
  scale: ["Poor", "Fair", "Okay", "Good", "Excellent"],
  satisfaction: ["", "Very dissatisfied", "Dissatisfied", "Neutral", "Satisfied", "Very satisfied"],
  entries: [],                       // in-memory only: resets when the page reloads

  today() { return new Date().toISOString().slice(0, 10); },

  validate(d) {
    const e = {};
    if (!d.date) e.date = "Choose the date of your visit.";
    else if (d.date > this.today()) e.date = "The date can't be in the future. Pick today or an earlier day.";
    if (!d.meal) e.meal = "Choose which meal you had.";
    this.criteria.forEach(c => { if (!d[c.key]) e[c.key] = "Choose a rating for " + c.label.toLowerCase() + "."; });
    if (!d.satisfaction) e.satisfaction = "Tell us how satisfied you were overall.";
    if (d.suggestions.length > 500) e.suggestions = "Shorten your comment to 500 characters or fewer.";
    if (d.name.length > 60) e.name = "Use 60 characters or fewer for your name.";
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) e.email = "Enter an email like name@example.com, or leave it blank.";
    return e;
  },
  add(d) {
    const entry = { id: Date.now(), ...d };
    entry.average = this.criteria.reduce((s, c) => s + Number(d[c.key]), 0) / this.criteria.length;
    this.entries.unshift(entry);
    return entry;
  }
};

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const View = {
  keys() { return ["date", "meal", ...Model.criteria.map(c => c.key), "satisfaction", "suggestions", "name", "email"]; },

  renderRatings() {
    const head = '<div class="head" aria-hidden="true"><span style="text-align:left;padding-left:.5rem">How would you rate&hellip;</span>' +
      Model.scale.map((s, i) => `<span><b>${i + 1}</b>${s}</span>`).join("") + "</div>";
    const rows = Model.criteria.map(c => `
      <div class="row field" data-field="${c.key}" role="radiogroup" aria-labelledby="q-${c.key}">
        <span class="q" id="q-${c.key}">${esc(c.label)}</span>
        ${Model.scale.map((s, i) => `
          <label class="rate"><input type="radio" name="${c.key}" value="${i + 1}">
            <span class="dot"></span><span class="n" aria-hidden="true">${i + 1}</span>
            <span class="sr">${i + 1}, ${s}</span></label>`).join("")}
        <p class="err" id="err-${c.key}"></p>
      </div>`).join("");
    $("ratings").innerHTML = head + rows;
  },

  setToday() { $("date").value = Model.today(); $("date").max = Model.today(); },

  read() {
    const f = $("feedback-form");
    const pick = n => (f.querySelector(`input[name="${n}"]:checked`) || {}).value || "";
    const d = { date: f.date.value, meal: pick("meal"), satisfaction: pick("satisfaction"),
      suggestions: f.suggestions.value.trim(), name: f.name.value.trim(), email: f.email.value.trim() };
    Model.criteria.forEach(c => d[c.key] = pick(c.key));
    return d;
  },

  showErrors(errors) {
    this.keys().forEach(k => this.setError(k, errors[k]));
    const bad = this.keys().filter(k => errors[k]);
    const box = $("summary");
    if (bad.length) {
      box.textContent = bad.length === 1 ? "One question needs your attention. Fix it below and send again."
        : bad.length + " questions need your attention. Fix the highlighted ones below and send again.";
      box.hidden = false;
      const first = document.querySelector(`[data-field="${bad[0]}"] input, [data-field="${bad[0]}"] textarea`);
      if (first) first.focus();
    } else box.hidden = true;
  },
  setError(k, msg) {
    const box = document.querySelector(`[data-field="${k}"]`);
    if (!box) return;
    box.classList.toggle("invalid", !!msg);
    $("err-" + k).textContent = msg || "";
  },
  counter() {
    const n = $("suggestions").value.length;
    $("counter").textContent = n + " / 500";
    $("counter").classList.toggle("warn", n >= 450);
  },
  reset() { $("feedback-form").reset(); this.keys().forEach(k => this.setError(k)); $("summary").hidden = true; this.setToday(); this.counter(); },

  screen(name) {
    $("screen-form").hidden = name !== "form";
    $("screen-responses").hidden = name !== "responses";
    const cur = (el, on) => on ? el.setAttribute("aria-current", "page") : el.removeAttribute("aria-current");
    cur($("nav-form"), name === "form"); cur($("nav-responses"), name === "responses");
    window.scrollTo(0, 0);
  },

  renderEntries(entries, newId, showToast) {
    $("count").textContent = entries.length;
    $("empty").hidden = entries.length > 0;
    $("toast").hidden = !showToast;
    $("list").innerHTML = entries.map(e => {
      const level = e.satisfaction >= 4 ? "good" : e.satisfaction <= 2 ? "bad" : "";
      const when = new Date(e.date + "T00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
      return `<li class="entry ${e.id === newId ? "new" : ""}">
        <div class="entry-top">
          <div><h3>${esc(e.name || "Anonymous")}</h3><span class="when">${esc(e.meal)} on ${esc(when)}</span></div>
          <span class="status ${level}"><i aria-hidden="true"></i>${Model.satisfaction[e.satisfaction]}</span>
        </div>
        <div class="chips"><span class="chip">Average ${e.average.toFixed(1)} / 5</span>
          ${Model.criteria.map(c => `<span class="chip">${esc(c.label)} ${e[c.key]}</span>`).join("")}</div>
        ${e.suggestions ? `<p>${esc(e.suggestions)}</p>` : ""}
      </li>`;
    }).join("");
  }
};

const Controller = {
  lastId: null,
  init() {
    View.renderRatings();
    View.setToday();
    View.renderEntries([], null, false);
    const form = $("feedback-form");

    form.addEventListener("submit", e => this.onSubmit(e));                 // submit

    form.addEventListener("input", e => {                                   // input: live feedback
      const field = e.target.closest("[data-field]");
      if (field) View.setError(field.dataset.field);
      if (e.target.id === "suggestions") View.counter();
    });

    form.addEventListener("focusout", e => {                                // focusout: check when leaving a field
      const k = e.target.name;
      if (!["date", "name", "email", "suggestions"].includes(k)) return;
      const msg = Model.validate(View.read())[k];
      if (msg) View.setError(k, msg);
    });

    window.addEventListener("hashchange", () => this.route());              // hashchange: switch screens
    this.route();
  },
  onSubmit(e) {
    e.preventDefault();                                                     // stop the browser reloading the page
    const data = View.read();
    const errors = Model.validate(data);
    View.showErrors(errors);
    if (Object.keys(errors).length) return;
    this.lastId = Model.add(data).id;
    View.reset();
    location.hash = "#responses";
  },
  route() {
    const page = location.hash === "#responses" ? "responses" : "form";
    View.screen(page);
    View.renderEntries(Model.entries, page === "responses" ? this.lastId : null, page === "responses" && !!this.lastId);
    if (page === "form") this.lastId = null;
  }
};
Controller.init();