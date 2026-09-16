import test from "node:test";
import assert from "node:assert/strict";

import { resolvePythonCandidates, resolveTerms } from "../lib/transcribe.mjs";

const noFile = { stat: async () => { throw new Error("ENOENT"); }, readFile: async () => "" };

const WIN = { platform: "win32", packageRoot: "C:\\pkg", cwd: "C:\\work", env: {} };
const NIX = { platform: "linux", packageRoot: "/pkg", cwd: "/work", env: {} };

test("PLAUD_MINUTES_PYTHON 을 지정하면 최우선으로 시도한다", () => {
  const got = resolvePythonCandidates({ ...WIN, env: { PLAUD_MINUTES_PYTHON: "C:\\custom\\python.exe" } });

  assert.equal(got[0].cmd, "C:\\custom\\python.exe");
  assert.deepEqual(got[0].args, []);
});

test("Windows: 패키지 .venv 와 작업폴더 .venv 를 시스템 Python 보다 먼저 시도한다", () => {
  const cmds = resolvePythonCandidates(WIN).map((c) => c.cmd);

  assert.ok(cmds.includes("C:\\pkg\\.venv\\Scripts\\python.exe"));
  assert.ok(cmds.includes("C:\\work\\.venv\\Scripts\\python.exe"));
  assert.ok(cmds.indexOf("C:\\pkg\\.venv\\Scripts\\python.exe") < cmds.indexOf("py"));
});

test("POSIX: .venv/bin/python 을 쓰고 python3 로 폴백한다", () => {
  const cmds = resolvePythonCandidates(NIX).map((c) => c.cmd);

  assert.ok(cmds.includes("/pkg/.venv/bin/python"));
  assert.ok(cmds.includes("/work/.venv/bin/python"));
  assert.ok(cmds.includes("python3"));
  assert.ok(!cmds.includes("py"));
});

test("Windows 런처 py 는 -3 인자를 함께 넘긴다", () => {
  const py = resolvePythonCandidates(WIN).find((c) => c.cmd === "py");

  assert.ok(py, "py 후보가 있어야 한다");
  assert.deepEqual(py.args, ["-3"]);
});

test("패키지 루트와 작업 폴더가 같으면 후보를 중복 시도하지 않는다", () => {
  const cmds = resolvePythonCandidates({ ...WIN, packageRoot: "C:\\same", cwd: "C:\\same" }).map((c) => c.cmd);

  assert.equal(new Set(cmds).size, cmds.length);
});

test("용어집: 쉼표로 구분한 문자열을 그대로 목록으로 만든다", async () => {
  const got = await resolveTerms("결제모듈, 페일오버,  리드리플리카 ", noFile);

  assert.equal(got, "결제모듈, 페일오버, 리드리플리카");
});

test("용어집: 파일 경로를 주면 파일 내용을 읽어 줄바꿈도 구분자로 본다", async () => {
  const got = await resolveTerms("/glossary.txt", {
    stat: async () => ({ isFile: () => true }),
    readFile: async () => "결제모듈\n페일오버, 온프레미스\n\n",
  });

  assert.equal(got, "결제모듈, 페일오버, 온프레미스");
});

test("용어집: 값이 없거나 비어 있으면 undefined 를 준다", async () => {
  assert.equal(await resolveTerms(undefined, noFile), undefined);
  assert.equal(await resolveTerms("   ", noFile), undefined);
  assert.equal(await resolveTerms(",, ,", noFile), undefined);
});

test("후보는 항상 하나 이상이며 cmd/args 형태를 지킨다", () => {
  for (const base of [WIN, NIX]) {
    const got = resolvePythonCandidates(base);
    assert.ok(got.length > 0);
    for (const c of got) {
      assert.equal(typeof c.cmd, "string");
      assert.ok(Array.isArray(c.args));
    }
  }
});
