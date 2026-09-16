import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { resolveRepoRoot } from "../lib/config.mjs";

const CWD = path.resolve("C:/work");

test("--repo 플래그가 가장 우선한다", () => {
  const got = resolveRepoRoot({
    flag: "D:/flag",
    env: { PLAUD_MINUTES_ROOT: "D:/env" },
    config: { repoRoot: "D:/config" },
    cwd: CWD,
  });

  assert.equal(got.root, path.resolve("D:/flag"));
  assert.equal(got.from, "flag");
});

test("플래그가 없으면 PLAUD_MINUTES_ROOT 환경변수를 쓴다", () => {
  const got = resolveRepoRoot({
    env: { PLAUD_MINUTES_ROOT: "D:/env" },
    config: { repoRoot: "D:/config" },
    cwd: CWD,
  });

  assert.equal(got.root, path.resolve("D:/env"));
  assert.equal(got.from, "env");
});

test("환경변수가 없으면 설정 파일의 repoRoot 를 쓴다", () => {
  const got = resolveRepoRoot({ env: {}, config: { repoRoot: "D:/config" }, cwd: CWD });

  assert.equal(got.root, path.resolve("D:/config"));
  assert.equal(got.from, "config");
});

test("아무것도 없으면 현재 폴더로 떨어진다", () => {
  const got = resolveRepoRoot({ env: {}, config: {}, cwd: CWD });

  assert.equal(got.root, CWD);
  assert.equal(got.from, "cwd");
});

test("빈 문자열이나 공백은 설정되지 않은 것으로 본다", () => {
  const got = resolveRepoRoot({ flag: "  ", env: { PLAUD_MINUTES_ROOT: "" }, config: { repoRoot: "  " }, cwd: CWD });

  assert.equal(got.root, CWD);
  assert.equal(got.from, "cwd");
});

test("상대 경로는 절대 경로로 바꿔 준다", () => {
  const got = resolveRepoRoot({ flag: "sub/dir", env: {}, config: {}, cwd: CWD });

  assert.equal(path.isAbsolute(got.root), true);
});
