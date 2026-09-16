import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_MODEL, resolveModel } from "../lib/config.mjs";

test("기본 전사 모델은 한국어 회의에 쓸 만한 모델이다", () => {
  assert.equal(resolveModel({ env: {}, config: {} }), DEFAULT_MODEL);
  assert.ok(
    !["tiny", "base"].includes(DEFAULT_MODEL),
    `tiny/base 는 오인식이 심해 기본값이 될 수 없다 (현재: ${DEFAULT_MODEL})`,
  );
});

test("--model 플래그가 가장 우선한다", () => {
  const got = resolveModel({
    flag: "medium",
    env: { PLAUD_MINUTES_MODEL: "small" },
    config: { model: "base" },
  });

  assert.equal(got, "medium");
});

test("플래그가 없으면 PLAUD_MINUTES_MODEL 환경변수를 쓴다", () => {
  assert.equal(resolveModel({ env: { PLAUD_MINUTES_MODEL: "tiny" }, config: { model: "base" } }), "tiny");
});

test("환경변수가 없으면 설정파일의 model 을 쓴다", () => {
  assert.equal(resolveModel({ env: {}, config: { model: "medium" } }), "medium");
});

test("빈 값과 공백은 설정되지 않은 것으로 본다", () => {
  assert.equal(resolveModel({ flag: "  ", env: { PLAUD_MINUTES_MODEL: "" }, config: { model: " " } }), DEFAULT_MODEL);
});
