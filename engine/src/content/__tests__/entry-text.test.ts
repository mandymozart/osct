import { describe, expect, it } from "vitest";
import { exprMessage, markdownToHtml, renderEntryText, safeLinkUrl, textVariables, variablesOf } from "@shared/text/entry-text";
import { evaluateText, parseText } from "@shared/text/expressions";

const html = (body: string, variables: Record<string, unknown> = {}) => renderEntryText(body, { variables: name => variables[name] }).html;

/** An entry's body (content schema 2.23): the Markdown subset and the variables – one renderer for the reader and the editor */
describe("entry text: Markdown", () => {
  it("keeps plain text as the reader showed it: paragraphs at blank lines, a single line break stays", () => {
    expect(html("One.\n\nTwo\nlines.")).toBe("<p>One.</p><p>Two<br>lines.</p>");
    expect(html("  \n\n  Padded.  \n \n\n")).toBe("<p>Padded.</p>");
    expect(html("Windows\r\n\r\nline ends")).toBe("<p>Windows</p><p>line ends</p>");
    expect(html("")).toBe("");
  });

  it("renders emphasis, strong and links – nothing else", () => {
    expect(html("an *onion* and _skin_")).toBe("<p>an <em>onion</em> and <em>skin</em></p>");
    expect(html("**crocodile** __tears__")).toBe("<p><strong>crocodile</strong> <strong>tears</strong></p>");
    expect(html("*a **b** c*")).toBe("<p><em>a <strong>b</strong> c</em></p>");
    expect(html("see [the *site*](https://example.org/a?b=1&c=2)")).toBe(
      '<p>see <a href="https://example.org/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">the <em>site</em></a></p>',
    );
    expect(html("[mail](mailto:kevin@example.org)")).toContain('href="mailto:kevin@example.org"');
    expect(markdownToHtml("[x](https://example.org)", { newTab: false })).toBe('<p><a href="https://example.org">x</a></p>');
    expect(html("# no heading\n- no list\n`no code`")).toBe("<p># no heading<br>- no list<br>`no code`</p>");
  });

  it("leaves what is no markup as text: lone stars, snake_case, maths, escapes", () => {
    expect(html("2 * 3 * 4")).toBe("<p>2 * 3 * 4</p>");
    expect(html("snake_case_name")).toBe("<p>snake_case_name</p>");
    expect(html("an *open star")).toBe("<p>an *open star</p>");
    expect(html("\\*not emphasis\\*")).toBe("<p>*not emphasis*</p>");
    expect(html("[no link] (https://example.org)")).toBe("<p>[no link] (https://example.org)</p>");
    expect(html("[]()")).toBe("<p>[]()</p>");
  });

  it("escapes every HTML character: no markup passes through", () => {
    expect(html("<script>alert(1)</script>")).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
    expect(html('<img src=x onerror="alert(1)">')).toBe("<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>");
    expect(html("Tom & Jerry's")).toBe("<p>Tom &amp; Jerry&#39;s</p>");
    expect(html("*<b>bold</b>*")).toBe("<p><em>&lt;b&gt;bold&lt;/b&gt;</em></p>");
  });

  it("refuses a link that is not http(s) or mailto, and keeps it as text", () => {
    for (const url of ["javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,<b>x</b>", "vbscript:x", "//evil.example", "/relative", "https://", "ftp://example.org"]) {
      expect(html(`[click](${url})`)).not.toContain("<a");
      expect(safeLinkUrl(url)).toBeNull();
    }
    expect(html('[x](https://example.org/"onmouseover="alert(1))')).not.toContain('"onmouseover');
    expect(html("[x](https://exa mple.org)")).not.toContain("<a");
    expect(html("[x](java\nscript:alert(1))")).not.toContain("<a");
    // Nested link text is text: no link inside a link
    expect(html("[[a](https://a.example)](https://b.example)")).toBe('<p><a href="https://b.example" target="_blank" rel="noopener noreferrer">[a](https://a.example)</a></p>');
  });

  it("stays fast on a text that opens and never closes", () => {
    const body = "*a ".repeat(20000) + "_b ".repeat(20000);
    const started = performance.now();
    expect(html(body).length).toBeGreaterThan(body.length);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe("entry text: variables (SCUTOONS' syntax)", () => {
  it("prints a variable's value, the ink way", () => {
    expect(html("You found {count} keys.", { count: 3 })).toBe("<p>You found 3 keys.</p>");
    expect(html("{ratio}", { ratio: 0.1 + 0.2 })).toBe("<p>0.3</p>");
    expect(html("{open}", { open: true })).toBe("<p>true</p>");
  });

  it("shows a variable that is not set as nothing, and lists it", () => {
    const rendered = renderEntryText("Hello {name}!");
    expect(rendered.html).toBe("<p>Hello !</p>");
    expect(rendered.problems).toEqual([expect.objectContaining({ code: "missing-value", severity: "warning", args: ["name"] })]);
    expect(exprMessage(rendered.problems[0])).toBe("name is not set – it shows as nothing");
  });

  it("chooses text by a condition; the else part is the fallback", () => {
    const body = "{hasKey: The door opens.|The door is locked.}";
    expect(html(body, { hasKey: true })).toBe("<p>The door opens.</p>");
    expect(html(body)).toBe("<p>The door is locked.</p>");
    expect(html("Hello {name: {name}|friend}.", { name: "Kévin" })).toBe("<p>Hello Kévin.</p>");
    expect(html("Hello {name: {name}|friend}.")).toBe("<p>Hello friend.</p>");
    expect(html("{tries >= 3 and not hasKey: Try the window.}", { tries: 3 })).toBe("<p>Try the window.</p>");
    expect(html("{coins == 1: one coin|{coins} coins}", { coins: 4 })).toBe("<p>4 coins</p>");
    expect(html('{mood == "sad": *tears*}', { mood: "sad" })).toBe("<p><em>tears</em></p>");
  });

  it("never turns a value into markup or HTML", () => {
    expect(html("{name}", { name: "<script>alert(1)</script>" })).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
    expect(html("{name}", { name: "**bold** [x](https://evil.example)" })).toBe("<p>**bold** [x](https://evil.example)</p>");
    expect(html("{name}", { name: "a\\*b" })).toBe("<p>a\\*b</p>");
  });

  it("reads the innermost scope, like api.vars.get", () => {
    const lookup = variablesOf([{ scope: "book", name: "door", value: "closed" }, { scope: "spread", name: "door", value: "open" }, { scope: "session", name: "visits", value: 2 }]);
    expect(lookup("door")).toBe("open");
    expect(lookup("visits")).toBe(2);
    expect(lookup("nothing")).toBeUndefined();
  });

  it("escapes braces with a backslash and keeps other escapes for the Markdown", () => {
    expect(html("a \\{literal\\} and a pipe \\|")).toBe("<p>a {literal} and a pipe |</p>");
    expect(html("\\\\{n}", { n: 1 })).toBe("<p>\\1</p>");
    expect(evaluateText("\\*x\\*", () => undefined).text).toBe("\\*x\\*");
  });

  it("renders a construct that does not parse as nothing and names the problem", () => {
    const cases: Array<[string, string]> = [
      ["{a = 1: x}", "single-equals"],
      ["{a|b|c}", "unsupported-list"],
      ["{&a|b}", "unsupported-list"],
      ["{clock(t)}", "unknown-function"],
      ["{open", "missing-close"],
      ["{}", "empty-braces"],
      ["{a: x|y|z}", "conditional-too-many"],
      ['{"text}', "unterminated-string"],
    ];
    for (const [body, code] of cases) {
      const rendered = renderEntryText(`before ${body} after`);
      expect(rendered.problems.map(p => p.code), body).toContain(code);
      expect(rendered.html, body).not.toContain("{");
    }
    expect(renderEntryText("a } b").problems).toEqual([expect.objectContaining({ code: "stray-close", severity: "warning" })]);
  });

  it("is bounded: too many constructs, too deep, too long", () => {
    expect(renderEntryText("{a}".repeat(60)).problems.map(p => p.code)).toContain("too-many-constructs");
    expect(parseText(`{${"(".repeat(40)}1${")".repeat(40)}}`).problems.map(p => p.code)).toContain("too-deep");
    const long = `${"x".repeat(50001)} {a}`;
    const rendered = renderEntryText(long, { variables: () => "value" });
    expect(rendered.problems.map(p => p.code)).toEqual(["text-too-long"]);
    expect(rendered.html).toContain("{a}");
  });

  it("names the variables a text reads", () => {
    expect(textVariables("Hello {name: {name}|friend}, {tries > 2: {hint}}")).toEqual(["name", "tries", "hint"]);
    expect(textVariables("no braces")).toEqual([]);
  });
});
