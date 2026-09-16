#!/usr/bin/env node
/**
 * Plaud MCP 서버(@plaud-ai/mcp)를 stdio로 직접 호출하는 최소 클라이언트.
 *
 * AI 클라이언트를 거치지 않고도 녹음 목록/전사를 바로 가져오기 위한 도구다.
 * 인증 토큰은 `npx -y @plaud-ai/mcp@latest install` 이 만들어 둔 ~/.plaud 를 그대로 쓴다.
 *
 * 사용:
 *   node scripts/plaud-mcp.mjs tools
 *   node scripts/plaud-mcp.mjs list [--query 키워드] [--from YYYY-MM-DD] [--to YYYY-MM-DD]
 *   node scripts/plaud-mcp.mjs get <파일ID> [--out 저장경로.json]
 *   node scripts/plaud-mcp.mjs latest [--out 저장경로.json]
 */

import { spawn } from "node:child_process";
import fs from "node:fs/promises";

const PROTOCOL_VERSIONS = ["2025-06-18", "2024-11-05"];

function createClient({ timeoutMs = 120000 } = {}) {
  const child = spawn("npx -y @plaud-ai/mcp@latest", {
    shell: true,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  const pending = new Map();
  let buffer = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    let idx;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.id !== undefined && pending.has(msg.id)) {
        const { resolve, reject, timer } = pending.get(msg.id);
        clearTimeout(timer);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message ?? "MCP 오류"} (code ${msg.error.code})`));
        else resolve(msg.result);
      }
    }
  });

  child.stderr.on("data", (d) => { stderr += d.toString("utf8"); });

  let nextId = 1;
  const send = (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`MCP 응답 시간 초과: ${method}\n${stderr.slice(-400)}`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });

  const notify = (method, params) => {
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  };

  return {
    send,
    notify,
    close: () => { try { child.stdin.end(); } catch {} child.kill(); },
    get stderr() { return stderr; },
  };
}

async function connect() {
  const client = createClient();
  let initialized = null;
  let lastErr;
  for (const version of PROTOCOL_VERSIONS) {
    try {
      initialized = await client.send("initialize", {
        protocolVersion: version,
        capabilities: {},
        clientInfo: { name: "plaud-meeting-minutes", version: "0.1.0" },
      });
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (!initialized) {
    client.close();
    throw new Error(`Plaud MCP 초기화에 실패했습니다.\n${lastErr?.message ?? ""}`);
  }
  client.notify("notifications/initialized", {});
  return { client, initialized };
}

/** 서버가 붙이는 <untrusted-user-data-...> 래퍼를 벗기고 JSON을 꺼낸다. */
function extractJson(text) {
  const wrapped = /<untrusted-user-data-[^>]*>\s*([\s\S]*?)\s*<\/untrusted-user-data-[^>]*>/.exec(text);
  const body = wrapped ? wrapped[1] : text;
  try {
    return JSON.parse(body);
  } catch {
    const brace = body.indexOf("{");
    const lastBrace = body.lastIndexOf("}");
    if (brace !== -1 && lastBrace > brace) {
      try {
        return JSON.parse(body.slice(brace, lastBrace + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function unwrap(result) {
  if (result?.structuredContent) return result.structuredContent;
  const parts = Array.isArray(result?.content) ? result.content : [];
  const texts = parts.filter((p) => p.type === "text").map((p) => p.text);
  for (const t of texts) {
    const parsed = extractJson(t);
    if (parsed !== null) return parsed;
  }
  return texts.join("\n") || result;
}

async function callTool(client, name, args = {}) {
  const res = await client.send("tools/call", { name, arguments: args });
  if (res?.isError) throw new Error(`도구 ${name} 실패: ${JSON.stringify(unwrap(res)).slice(0, 400)}`);
  return unwrap(res);
}

function parseFlags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      out[key] = val;
    }
  }
  return out;
}

function pickFileList(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["files", "data", "items", "results", "list"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);
  const positional = rest.filter((a) => !a.startsWith("--") && rest[rest.indexOf(a) - 1]?.startsWith("--") !== true);

  if (!command || command === "help") {
    process.stdout.write("사용: plaud-mcp.mjs tools | list | get <ID> | latest\n");
    return 0;
  }

  const { client, initialized } = await connect();
  try {
    if (command === "tools") {
      const res = await client.send("tools/list", {});
      const names = (res?.tools ?? []).map((t) => `${t.name}: ${t.description ?? ""}`.trim());
      process.stdout.write(`서버: ${initialized?.serverInfo?.name ?? "?"} v${initialized?.serverInfo?.version ?? "?"}\n`);
      process.stdout.write(`${names.join("\n")}\n`);
      return 0;
    }

    if (command === "whoami") {
      process.stdout.write(`${JSON.stringify(await callTool(client, "get_current_user"), null, 2)}\n`);
      return 0;
    }

    if (command === "list" || command === "latest") {
      const args = {};
      if (flags.query) args.query = flags.query;
      if (flags.from) args.date_from = flags.from;
      if (flags.to) args.date_to = flags.to;
      const payload = await callTool(client, "list_files", args);
      const files = pickFileList(payload);

      if (command === "list") {
        process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
        return 0;
      }

      if (files.length === 0) {
        process.stderr.write("녹음을 찾지 못했습니다. Plaud 앱에서 동기화가 끝났는지 확인하세요.\n");
        return 1;
      }
      const sorted = [...files].sort((a, b) =>
        String(b.start_at ?? b.created_at ?? "").localeCompare(String(a.start_at ?? a.created_at ?? "")),
      );
      const target = sorted[0];
      const fileId = target.id ?? target.file_id;
      const detail = await callTool(client, "get_file", { file_id: fileId });
      const transcript = await callTool(client, "get_transcript", { file_id: fileId }).catch(() => null);
      if (transcript && !detail.source_list) detail.source_list = transcript.source_list ?? transcript.data ?? transcript;
      const outPath = flags.out ?? "plaud-latest.json";
      await fs.writeFile(outPath, JSON.stringify(detail, null, 2), "utf8");
      process.stdout.write(`[OK] 저장: ${outPath}\n     ${target.name ?? "(제목 없음)"} / ${target.start_at ?? target.created_at ?? "?"}\n`);
      return 0;
    }

    if (command === "get") {
      const id = positional[0] ?? rest[0];
      if (!id) throw new Error("파일 ID를 지정하세요.");
      const detail = await callTool(client, "get_file", { id });
      const outPath = flags.out ?? `plaud-${id}.json`;
      await fs.writeFile(outPath, JSON.stringify(detail, null, 2), "utf8");
      process.stdout.write(`[OK] 저장: ${outPath}\n`);
      return 0;
    }

    throw new Error(`알 수 없는 명령: ${command}`);
  } finally {
    client.close();
  }
}

main()
  .then((code) => { process.exitCode = code ?? 0; })
  .catch((err) => {
    process.stderr.write(`\n[오류] ${err?.message ?? err}\n`);
    process.exitCode = 1;
  });
