import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { env } from "../../../../lib/keys.mjs";
import { transcriptionRequest } from "../../prompts.mjs";

// Pulls a Slack "updates" channel (someone's work journal) in as a context document.
// GET → { configured, channels: [{ id, name }], error? }: the channels the page may import, which are only the public
// channels named in SLACK_CHANNELS (comma-separated names or IDs in the repo's .env). Nothing else can be read.
// POST { channel, days } → { name, text, count }: that channel's messages from the last `days` days (thread replies
// folded under their message), as Markdown, newest day first so the latest updates survive the 24,000-character cut
// in prompts.mjs. Video and audio attachments are transcribed and the transcript goes under the post: the server
// downloads each one, takes its audio with ffmpeg (Homebrew's; the first 20 minutes, as 16 kHz mono MP3), and sends it
// to OpenRouter's speech-to-text. Transcripts are kept in the repo's _media/slack/ (gitignored) by Slack file ID, so
// importing again doesn't transcribe the same file twice.
// The bot token (SLACK_BOT_TOKEN, xoxb-…) needs the channels:read, channels:history, users:read, and files:read
// scopes, and the bot has to be in the channel (/invite @your-bot there).

const repoRoot = path.dirname(/* turbopackIgnore: true */ process.cwd());
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
const transcriptModel = "openai/gpt-4o-mini-transcribe";

async function slack(token, method, params) {
  const response = await fetch(`https://slack.com/api/${method}?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => ({ ok: false, error: `http_${response.status}` }));
  if (!body.ok) {
    const error = new Error(body.error === "missing_scope" ? `The bot token is missing the ${body.needed} scope.` : body.error === "not_in_channel" ? "The bot isn't in that channel yet: type /invite @your-bot in it." : body.error === "invalid_auth" ? "Slack didn't accept SLACK_BOT_TOKEN." : `Slack answered ${body.error}.`);
    throw error;
  }
  return body;
}

// The allowlisted public channels, matched by name (with or without #) or ID.
async function allowed(token) {
  const wanted = (await env("SLACK_CHANNELS")).split(",").map((item) => item.trim().replace(/^#/, "").toLowerCase()).filter(Boolean);
  if (!wanted.length) return [];
  const found = [];
  let cursor = "";
  do {
    const page = await slack(token, "conversations.list", { types: "public_channel", exclude_archived: "true", limit: "1000", ...(cursor ? { cursor } : {}) });
    for (const channel of page.channels) {
      if (!channel.is_private && (wanted.includes(channel.name.toLowerCase()) || wanted.includes(channel.id.toLowerCase()))) found.push({ id: channel.id, name: channel.name });
    }
    cursor = page.response_metadata?.next_cursor || "";
  } while (cursor);
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

async function history(token, method, params) {
  const messages = [];
  let cursor = "";
  do {
    const page = await slack(token, method, { ...params, limit: "200", ...(cursor ? { cursor } : {}) });
    messages.push(...page.messages);
    cursor = page.response_metadata?.next_cursor || "";
  } while (cursor);
  return messages;
}

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(/* turbopackIgnore: true */ ffmpeg, ["-hide_banner", ...args]);
    const chunks = [];
    let errors = "";
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => { errors += chunk; });
    child.on("error", () => reject(new Error("ffmpeg isn't installed (brew install ffmpeg)")));
    child.on("close", (code) => resolve({ code, output: Buffer.concat(chunks), errors }));
  });
}

// A media file's audio as MP3, from a temporary copy (a .mov or .mp4 can't be read from a pipe), or null when it has
// no audio track (a silent clip, such as many AI-generated videos).
async function audioOf(media, id) {
  const dir = path.join(/* turbopackIgnore: true */ os.tmpdir(), `slack-${id}`);
  await mkdir(dir, { recursive: true });
  const input = path.join(dir, "input");
  await writeFile(input, media);
  try {
    if (!/Stream #.*: Audio:/.test((await run(["-i", input])).errors)) return null;
    const { code, output, errors } = await run(["-loglevel", "error", "-i", input, "-t", "1200", "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", "-f", "mp3", "pipe:1"]);
    if (code !== 0) throw new Error(errors.trim().split("\n").pop() || `ffmpeg stopped (${code})`);
    return output;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// The transcript of a video or audio attachment, from _media/slack/ if it was transcribed before.
async function transcript(token, file) {
  const saved = path.join(/* turbopackIgnore: true */ repoRoot, "_media", "slack", `${file.id}.txt`);
  const before = await readFile(saved, "utf8").catch(() => null);
  if (before !== null) return before;
  const key = await env("OPENROUTER_API_KEY");
  if (!key) throw new Error("no OPENROUTER_API_KEY in the repo's .env");
  const media = await fetch(file.url_private_download || file.url_private, { headers: { Authorization: `Bearer ${token}` } });
  if (!media.ok || media.headers.get("content-type")?.startsWith("text/html")) throw new Error(`Slack wouldn't hand over the file (${media.status}); the token may need the files:read scope`);
  const audio = await audioOf(Buffer.from(await media.arrayBuffer()), file.id);
  if (!audio) return save(saved, "(no audio)");
  const body = transcriptionRequest({ model: transcriptModel });
  body.input_audio = { data: audio.toString("base64"), format: "mp3" };
  const response = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const reply = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(reply.error?.message || `OpenRouter answered ${response.status}`);
  return save(saved, (reply.text || "").trim() || "(no speech)");
}

async function save(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
  return text;
}

const isMedia = (file) => /^(video|audio)\//.test(file.mimetype || "");
const clock = (ms) => { const seconds = Math.round(ms / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; };

// Slack's mrkdwn to Markdown: mentions, channel links, and links, then its escaped characters.
function plain(text = "", names) {
  return text
    .replace(/<@([A-Z0-9]+)(?:\|[^>]*)?>/g, (_, id) => `@${names.get(id) || id}`)
    .replace(/<#[A-Z0-9]+\|([^>]*)>/g, "#$1")
    .replace(/<!(here|channel|everyone)>/g, "@$1")
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, "[$2]($1)")
    .replace(/<(https?:[^>]+)>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

export async function GET() {
  const token = await env("SLACK_BOT_TOKEN");
  if (!token) return Response.json({ configured: false, channels: [] });
  try {
    return Response.json({ configured: true, channels: await allowed(token) });
  } catch (error) {
    return Response.json({ configured: true, channels: [], error: error.message });
  }
}

export async function POST(request) {
  const { channel, days = 30 } = await request.json();
  const token = await env("SLACK_BOT_TOKEN");
  if (!token) return Response.json({ error: "No SLACK_BOT_TOKEN in the repo's .env." }, { status: 500 });
  try {
    const target = (await allowed(token)).find((item) => item.id === channel);
    if (!target) return Response.json({ error: "That channel isn't a public channel listed in SLACK_CHANNELS." }, { status: 403 });
    const since = Date.now() / 1000 - Math.max(1, Math.min(365, Number(days) || 30)) * 86400;
    const skip = new Set(["channel_join", "channel_leave", "channel_topic", "channel_purpose", "channel_name", "bot_add", "bot_remove"]);
    const messages = (await history(token, "conversations.history", { channel, oldest: String(since) })).filter((message) => !skip.has(message.subtype));
    for (const message of messages) {
      if (message.reply_count) message.replies = (await history(token, "conversations.replies", { channel, ts: message.ts })).filter((reply) => reply.ts !== message.ts);
    }

    // Names for everyone who wrote or was mentioned, looked up once each.
    const names = new Map();
    const ids = new Set();
    for (const message of messages.flatMap((item) => [item, ...(item.replies || [])])) {
      if (message.user) ids.add(message.user);
      for (const [, id] of (message.text || "").matchAll(/<@([A-Z0-9]+)/g)) ids.add(id);
    }
    for (const id of ids) {
      const { user } = await slack(token, "users.info", { user: id }).catch(() => ({}));
      if (user) names.set(id, user.profile?.display_name || user.real_name || user.name);
    }

    // Transcripts for every video and audio attachment, one at a time; one that fails says why instead.
    for (const file of messages.flatMap((item) => [item, ...(item.replies || [])]).flatMap((message) => message.files || []).filter(isMedia)) {
      file.transcript = await transcript(token, file).catch((error) => ({ error: error.message }));
    }
    const who = (message) => names.get(message.user) || message.username || message.bot_profile?.name || "Someone";
    const when = (ts) => new Date(Number(ts) * 1000);
    const files = (message) => (message.files || []).map((file) => {
      const name = file.name || file.title || "a file";
      if (!isMedia(file)) return `_(attached: ${name})_`;
      const label = `_(${file.mimetype.split("/")[0]}: ${name}${file.duration_ms ? `, ${clock(file.duration_ms)}` : ""})_`;
      if (file.transcript?.error) return `${label}\n_(Couldn't transcribe it: ${file.transcript.error}.)_`;
      return /^\(no (audio|speech)\)$/.test(file.transcript) ? `${label} ${file.transcript}` : `${label}\nTranscript: ${file.transcript}`;
    });
    const body = (message) => [plain(message.text, names), ...files(message)].filter(Boolean).join("\n");

    // Newest day first; within a day, in the order it was written.
    const byDay = new Map();
    for (const message of [...messages].sort((a, b) => Number(a.ts) - Number(b.ts))) {
      const day = when(message.ts).toLocaleDateString("en-CA");
      if (!byDay.has(day)) byDay.set(day, []);
      const time = when(message.ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      const replies = (message.replies || []).map((reply) => `\n> **${who(reply)}** (reply): ${body(reply).replace(/\n/g, "\n> ")}`).join("");
      byDay.get(day).push(`**${who(message)}** · ${time}\n${body(message)}${replies}`);
    }
    const sections = [...byDay].reverse().map(([day, items]) => `## ${day}\n\n${items.join("\n\n")}`);
    const today = new Date().toLocaleDateString("en-CA");
    const from = when(since).toLocaleDateString("en-CA");
    const text = `---\ntitle: "#${target.name}: Slack work journal"\ndescription: Messages from #${target.name}, ${from} to ${today}, newest day first\nsource: slack\nchannel: ${target.name}\nmessages: ${messages.length}\n---\n\n${sections.join("\n\n") || "(No messages in this period.)"}\n`;
    return Response.json({ name: `slack-${target.name}.md`, text, count: messages.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 502 });
  }
}
