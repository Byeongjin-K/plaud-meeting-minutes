/**
 * 회의록을 어디에 저장할지 결정한다.
 *
 * 우선순위: --repo 플래그 > PLAUD_MINUTES_ROOT 환경변수 > 설정파일 repoRoot > 현재 폴더
 * 설정파일은 홈 디렉터리의 `.plaud-minutes.json` 이다.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const CONFIG_PATH = path.join(os.homedir(), ".plaud-minutes.json");

const clean = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

export function resolveRepoRoot({ flag, env = process.env, config = {}, cwd = process.cwd() } = {}) {
  const candidates = [
    ["flag", clean(flag)],
    ["env", clean(env.PLAUD_MINUTES_ROOT)],
    ["config", clean(config.repoRoot)],
  ];

  for (const [from, value] of candidates) {
    if (value) return { root: path.resolve(cwd, value), from };
  }
  return { root: path.resolve(cwd), from: "cwd" };
}

/**
 * 기본 전사 모델.
 *
 * 한국어 회의 녹음(3분 10초)의 동일 구간을 세 모델로 전사해 비교했다.
 * 전문용어가 섞인 실무 회의였고, 판정 기준은 "나열된 항목을 그대로 분리해 내는가" 였다.
 *
 *   base   → 문장 구조가 붕괴. 나열이 서로 다른 문장으로 뒤섞인다. 사용 불가.
 *   small  → 읽을 수는 있으나 나열 항목이 하나로 뭉개진다.
 *   medium → 항목을 정확히 분리. 오인식은 단어 수준에 머문다.
 *
 * 그 뒤 4분 33초짜리 회의 녹음 전체로 medium 과 large-v3-turbo 를 다시 쟀다.
 * (2026-09-16, CPU int8, 같은 파일·같은 옵션. 용어 항목은 해당 회의에서 미리 추린 22개 기준)
 *
 *   medium          308.1초 (RTF 1.13)  전문용어 10/22  1817자  44세그먼트
 *   large-v3-turbo  150.4초 (RTF 0.55)  전문용어 12/22  1847자  58세그먼트
 *
 * turbo 가 2.05배 빠르면서 용어도 더 잡는다. medium 은 실시간보다 느려서
 * 1시간 회의에 1시간 넘게 걸린다. turbo 는 medium 이 놓친 약어·기관명을 더 잡았고,
 * medium 전사에서 보이던 같은 구간 반복도 사라졌다.
 *
 * 가중치 크기도 약 1.6GB 로 medium(약 1.5GB)과 비슷해서 설치 부담이 늘지 않는다.
 * 그래서 기본값은 large-v3-turbo. 더 가볍게 가려면 --model small,
 * 더 정확하게는 --model large-v3 (대신 느리다).
 */
export const DEFAULT_MODEL = "large-v3-turbo";

export function resolveModel({ flag, env = process.env, config = {} } = {}) {
  return clean(flag) ?? clean(env.PLAUD_MINUTES_MODEL) ?? clean(config.model) ?? DEFAULT_MODEL;
}

export async function readConfig(file = CONFIG_PATH) {
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function writeConfig(patch, file = CONFIG_PATH) {
  const next = { ...(await readConfig(file)), ...patch };
  await fs.writeFile(file, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export const SOURCE_LABELS = {
  flag: "--repo 옵션",
  env: "PLAUD_MINUTES_ROOT 환경변수",
  config: `설정파일 (${CONFIG_PATH})`,
  cwd: "현재 폴더",
};
