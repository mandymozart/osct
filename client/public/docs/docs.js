/**
 * The documentation site's navigation and search (/docs/): the one list of its pages. Every page carries an empty
 * `<nav id="nav">` with a link home and gets from here the sidebar (the current page marked), the search, the
 * "On this page" list from its `h2`s and the previous / next links. A new page is one line in PAGES.
 *
 * The search needs no index file: on its first use it reads the pages of PAGES themselves and lists what can be
 * linked to – a page, a heading with an id, a table row with an id (a reference page's member, tool or parameter) –
 * so it is never out of step with the pages.
 */
(() => {
  /** [group, [[path, title], …]] in reading order */
  const PAGES = [
    ["Start", [
      ["/docs/", "Overview"],
    ]],
    ["Editor guide", [
      ["/docs/guide/", "The editor at a glance"],
      ["/docs/guide/experiences/", "Experiences, versions, publish"],
      ["/docs/guide/workspace/", "Workspace and panels"],
      ["/docs/guide/stage/", "The stage"],
      ["/docs/guide/scenes/", "Scenes and surfaces"],
      ["/docs/guide/inspector/", "The Inspector"],
      ["/docs/guide/library/", "Library and Environment"],
      ["/docs/guide/logic/", "The Logic panel"],
      ["/docs/guide/code/", "The Code tab"],
    ]],
    ["Tutorials", [
      ["/docs/tutorials/editor/", "For editors"],
      ["/docs/tutorials/admin/", "For admins"],
      ["/docs/tutorials/", "Content and demo walkthrough"],
    ]],
    ["API", [
      ["/docs/api/", "Which API for what"],
      ["/docs/api/logic/", "The logic system"],
      ["/docs/api/plugins/", "Plugin API"],
      ["/docs/api/mcp/", "MCP server"],
    ]],
    ["Reference", [
      ["/docs/api/plugins/reference/", "Plugin API reference"],
      ["/docs/api/mcp/reference/", "MCP tools reference"],
      ["/docs/api/content/", "Content model reference"],
    ]],
  ];

  const here = location.pathname.replace(/index\.html$/, "");
  const flat = PAGES.flatMap(([, pages]) => pages);
  const at = flat.findIndex(([path]) => path === here);
  const el = (tag, attrs = {}, text) => {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const clean = text => (text ?? "").replace(/\s+/g, " ").trim();

  // ── The search ──

  /** What can be found: { title, page, href, text, kind } – kind 0 a page, 1 a heading, 2 a row */
  let index = null;
  const entriesOf = (doc, path, pageTitle) => {
    const main = doc.querySelector("main");
    if (!main) return [];
    const entries = [{ title: pageTitle, page: pageTitle, href: path, text: clean(main.querySelector(".lead, p")?.textContent), kind: 0 }];
    for (const node of main.querySelectorAll("h2[id], h3[id], h4[id], tr[id]")) {
      if (node.tagName === "TR") {
        const [first, ...rest] = node.cells;
        const words = rest.flatMap(cell => [...cell.childNodes].map(part => part.textContent)).join(" "); // a signature and its line apart
        entries.push({ title: clean(first?.textContent), page: pageTitle, href: `${path}#${node.id}`, text: clean(words).slice(0, 400), kind: 2 });
        continue;
      }
      // a heading's text: what follows it up to the next heading
      let text = "";
      for (let next = node.nextElementSibling; next && !/^H[1-4]$/.test(next.tagName) && text.length < 400; next = next.nextElementSibling) {
        if (next.tagName !== "FIGURE") text += ` ${next.textContent}`;
      }
      const title = node.cloneNode(true);
      title.querySelectorAll(".who").forEach(tag => tag.remove()); // "bloom", not "bloom builtIn"
      entries.push({ title: clean(title.textContent), page: pageTitle, href: `${path}#${node.id}`, text: clean(text).slice(0, 400), kind: 1 });
    }
    return entries;
  };
  const load = () => (index ??= Promise.all(flat.map(async ([path, title]) => {
    try {
      const doc = path === here ? document : new DOMParser().parseFromString(await (await fetch(path)).text(), "text/html");
      return entriesOf(doc, path, title);
    } catch { return []; }
  })).then(lists => lists.flat()));

  /** The entries that hold every word, best first: a title that starts with the query, then one that holds it, then the text */
  const find = (entries, query) => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const whole = words.join(" ");
    const hits = [];
    for (const entry of entries) {
      const title = entry.title.toLowerCase();
      const text = entry.text.toLowerCase();
      if (!words.every(word => title.includes(word) || text.includes(word))) continue;
      const bare = title.replace(/^[a-z.]*\./, "").replace(/[?()]+$/, ""); // api.vars.set() → set
      const inTitle = words.every(word => title.includes(word));
      const score = (bare === whole || title === whole ? 100 : 0) + (bare.startsWith(whole) || title.startsWith(whole) ? 40 : 0)
        + (inTitle ? 30 : 0) + (title.split(/[^a-z0-9]+/).some(part => part.startsWith(words[0])) ? 10 : 0) + (entry.kind === 0 ? 20 : entry.kind === 1 ? 15 : 0);
      hits.push({ entry, score });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, 40).map(hit => hit.entry);
  };

  const snippet = (text, query) => {
    const word = query.toLowerCase().split(/\s+/).find(Boolean) ?? "";
    const found = text.toLowerCase().indexOf(word);
    const from = found > 60 ? found - 40 : 0;
    return `${from ? "… " : ""}${text.slice(from, from + 130)}${text.length > from + 130 ? " …" : ""}`;
  };

  const nav = document.getElementById("nav");
  if (nav) {
    nav.textContent = "";
    nav.append(el("a", { class: "home", href: "/docs/" }, "OSCT docs"));
    const toggle = el("button", { id: "nav-toggle", type: "button", "aria-expanded": "false" }, "Menu");
    toggle.addEventListener("click", () => toggle.setAttribute("aria-expanded", String(nav.classList.toggle("open"))));
    nav.append(toggle);

    const field = el("input", { id: "search", type: "search", placeholder: "Search  /", "aria-label": "Search the docs", autocomplete: "off", spellcheck: "false", "aria-controls": "search-results" });
    const results = el("ul", { id: "search-results", role: "listbox", "aria-label": "Search results", hidden: "" });
    nav.append(field, results);

    const groups = el("div", { class: "groups" });
    for (const [group, pages] of PAGES) {
      groups.append(el("h2", {}, group));
      const list = el("ul");
      for (const [path, title] of pages) {
        const item = el("li");
        item.append(el("a", path === here ? { href: path, "aria-current": "page" } : { href: path }, title));
        list.append(item);
      }
      groups.append(list);
    }
    nav.append(groups);

    let picked = -1;
    const pick = to => {
      const links = [...results.querySelectorAll("a")];
      if (!links.length) return;
      picked = (to + links.length) % links.length;
      links.forEach((link, i) => link.classList.toggle("picked", i === picked));
      links[picked].scrollIntoView({ block: "nearest" });
    };
    let turn = 0;
    const show = async () => {
      const query = field.value.trim();
      const mine = ++turn;
      nav.classList.toggle("searching", query !== "");
      results.hidden = query === "";
      if (!query) return;
      const entries = await load();
      if (mine !== turn) return; // a newer keystroke is on its way
      const hits = find(entries, query);
      results.textContent = "";
      picked = -1;
      if (!hits.length) { results.append(el("li", { class: "none" }, `Nothing for “${query}”.`)); return; }
      for (const hit of hits) {
        const item = el("li");
        const link = el("a", { href: hit.href, role: "option" });
        link.append(el("b", hit.kind === 2 ? { class: "code" } : {}, hit.title), el("span", {}, hit.kind === 0 ? snippet(hit.text, query) : `${hit.page} · ${snippet(hit.text, query)}`));
        item.append(link);
        results.append(item);
      }
    };
    field.addEventListener("input", show);
    field.addEventListener("focus", () => void load()); // read the pages before the first letter
    field.addEventListener("keydown", event => {
      if (event.key === "ArrowDown") { event.preventDefault(); pick(picked + 1); }
      else if (event.key === "ArrowUp") { event.preventDefault(); pick(picked - 1); }
      else if (event.key === "Enter") { (results.querySelector("a.picked") ?? results.querySelector("a"))?.click(); }
      else if (event.key === "Escape") { field.value = ""; void show(); field.blur(); }
    });
    // a hit on this page only moves to its anchor: close the search so the page shows
    results.addEventListener("click", event => {
      if (event.target.closest("a")) { field.value = ""; void show(); nav.classList.remove("open"); }
    });
    document.addEventListener("keydown", event => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? "");
      if (!typing && !event.ctrlKey && !event.metaKey && !event.altKey && event.key === "/") { event.preventDefault(); nav.classList.add("open"); field.focus(); }
    });
  }

  // On this page: the h2s, when there are enough to need a list
  const toc = document.getElementById("toc");
  const heads = [...document.querySelectorAll("main h2[id]")];
  if (toc && heads.length > 2) {
    toc.append(el("b", {}, "On this page"));
    const list = el("ul");
    for (const head of heads) {
      const item = el("li");
      item.append(el("a", { href: `#${head.id}` }, head.textContent));
      list.append(item);
    }
    toc.append(list);
  } else toc?.remove();

  // Previous / next in reading order
  const pager = document.getElementById("pager");
  if (pager && at >= 0) {
    const link = (index, word) => {
      const [path, title] = flat[index];
      const a = el("a", { href: path });
      a.append(el("span", {}, word), title);
      return a;
    };
    if (at > 0) pager.append(link(at - 1, "Previous"));
    if (at < flat.length - 1) pager.append(link(at + 1, "Next"));
  } else pager?.remove();
})();
