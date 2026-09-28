// Console output of the .mind tools: colours, numbers, steps, and a live block of lines (one per job)
// that redraws in place while images compile. Without a terminal (CI, a log file) only finished lines
// are printed.
export const tty = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = code => text => (tty ? `\x1b[${code}m${text}\x1b[0m` : String(text));
export const [bold, dim, green, yellow, red, cyan, magenta] = [1, 2, 32, 33, 31, 36, 35].map(paint);

export const seconds = ms => (ms >= 60_000 ? `${Math.floor(ms / 60_000)}m ${String(Math.round((ms % 60_000) / 1000)).padStart(2, "0")}s` : `${(ms / 1000).toFixed(1)}s`);
export const kb = bytes => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`);
export const count = n => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
export const mp = pixels => `${(pixels / 1e6).toFixed(1)} MP`;
export const bar = (fraction, width = 20) => {
  const full = Math.round(Math.max(0, Math.min(1, fraction)) * width);
  return green("█".repeat(full)) + dim("░".repeat(width - full));
};
const visible = text => text.replace(/\x1b\[[0-9;]*m/g, "");
export const pad = (text, width) => text + " ".repeat(Math.max(0, width - visible(text).length));

let live = []; // lines currently drawn at the bottom
const clearLive = () => {
  if (tty && live.length) process.stdout.write(`\x1b[${live.length}F\x1b[J`);
};
const drawLive = () => {
  if (tty && live.length) process.stdout.write(`${live.join("\n")}\n`);
};

/** Print above the live block */
export const log = (text = "") => {
  clearLive();
  console.log(text);
  drawLive();
};

/** Replace the live block (terminal only) */
export const setLive = lines => {
  if (!tty) return;
  clearLive();
  live = lines;
  drawLive();
};
export const endLive = () => {
  clearLive();
  live = [];
};

/** "Step 2/5  Browser and graphics card" */
export const step = (n, total, title, note = "") =>
  log(`\n${bold(`Step ${n}/${total}`)}  ${bold(title)}${note ? `  ${dim(note)}` : ""}\n${dim("─".repeat(72))}`);

/** "  label       value" */
export const row = (label, value, width = 14) => log(`  ${dim(pad(label, width))}${value}`);

export const fail = message => {
  endLive();
  console.error(red(`\n✖ ${message}`));
  process.exit(1);
};
