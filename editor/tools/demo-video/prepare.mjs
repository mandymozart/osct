// Prepares a local API for the recording (README.md): signs in with a code from the API's mail log and imports a
// published content version of a book (configuration + files.json, as the CDN import does, so the Library has the
// import's files). Nothing secret lives here: the address, the paths and the API come in as arguments.
//
//   node prepare.mjs --api http://127.0.0.1:8091/api --email <address> --mail-log <path> --token-file <path> \
//     --book demo --content https://buildingfictions.b-cdn.net/demo/<build>
//   node prepare.mjs --api … --token-file <path> --sign-out      (ends the session, deletes the token file)
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => {
    if (arg.startsWith("--")) pairs.push([arg.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "true"]);
    return pairs;
  }, []),
);
const api = (args.api ?? "http://127.0.0.1:8091/api").replace(/\/+$/, "");
const tokenFile = args["token-file"];
if (!tokenFile) throw new Error("--token-file is needed");

const call = async (method, path, body, token) => {
  const r = await fetch(api + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
};

if (args["sign-out"]) {
  if (existsSync(tokenFile)) {
    const token = readFileSync(tokenFile, "utf8").trim();
    await call("POST", "/auth/logout", {}, token).catch((e) => console.error(e.message));
    rmSync(tokenFile);
  }
  console.log("signed out, token file deleted");
  process.exit(0);
}

let token = existsSync(tokenFile) ? readFileSync(tokenFile, "utf8").trim() : "";
if (token) {
  try {
    await call("GET", "/user", undefined, token);
  } catch {
    token = "";
  }
}
if (!token) {
  if (!args.email || !args["mail-log"]) throw new Error("--email and --mail-log are needed to sign in");
  const before = existsSync(args["mail-log"]) ? readFileSync(args["mail-log"], "utf8").length : 0;
  const { requestId } = await call("POST", "/auth/request", { email: args.email });
  let code = null;
  for (let i = 0; i < 50 && !code; i++) {
    await sleep(100);
    const fresh = readFileSync(args["mail-log"], "utf8").slice(before);
    code = fresh.match(/Subject: (\d{6}) /)?.[1] ?? null;
  }
  if (!code) throw new Error("no code in the mail log");
  ({ session: token } = await call("POST", "/auth/verify", { requestId, code }));
  writeFileSync(tokenFile, token);
  console.log("signed in, token in", tokenFile);
}

if (args.content) {
  const base = args.content.replace(/\/+$/, "");
  const configuration = await (await fetch(`${base}/game.config.json`)).json();
  const filesResponse = await fetch(`${base}/files.json`);
  const files = filesResponse.ok ? await filesResponse.json() : undefined;
  const book = args.book ?? configuration.book?.id;
  const { book: imported } = await call("POST", `/editor/books/${book}/import`, { configuration, files, assetsBase: base }, token);
  console.log("imported", imported.id, "schema", imported.schema, "assets at", imported.assetsBase);
}
