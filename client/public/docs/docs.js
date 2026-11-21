/**
 * The documentation site's navigation (/docs/): the one list of its pages. Every page carries an empty `<nav id="nav">`
 * with a link home and gets from here the sidebar (the current page marked), the "On this page" list from its `h2`s
 * and the previous / next links. A new page is one line in PAGES.
 */
(() => {
  /** [group, [[path, title], …]] in reading order */
  const PAGES = [
    ["Start", [
      ["/docs/", "Overview"],
    ]],
    ["Editor guide", [
      ["/docs/guide/", "The editor at a glance"],
      ["/docs/guide/experiences/", "Experiences, import, publish"],
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

  const nav = document.getElementById("nav");
  if (nav) {
    nav.textContent = "";
    nav.append(el("a", { class: "home", href: "/docs/" }, "OSCT docs"));
    const toggle = el("button", { id: "nav-toggle", type: "button", "aria-expanded": "false" }, "Menu");
    toggle.addEventListener("click", () => toggle.setAttribute("aria-expanded", String(nav.classList.toggle("open"))));
    nav.append(toggle);
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
