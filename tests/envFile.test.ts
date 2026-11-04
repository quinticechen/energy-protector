import { test } from "node:test";
import assert from "node:assert/strict";
import { setEnvValue } from "../cli/envFile.ts";

test("setEnvValue replaces an empty or existing line and keeps the rest", () => {
  const content = "# comment\nA=1\nYOUTUBE_REFRESH_TOKEN=\nB=2\n";
  assert.equal(setEnvValue(content, "YOUTUBE_REFRESH_TOKEN", "tok"), "# comment\nA=1\nYOUTUBE_REFRESH_TOKEN=tok\nB=2\n");
  assert.equal(setEnvValue("A=1\nYOUTUBE_REFRESH_TOKEN=old", "YOUTUBE_REFRESH_TOKEN", "new"), "A=1\nYOUTUBE_REFRESH_TOKEN=new");
});

test("setEnvValue appends a missing key", () => {
  assert.equal(setEnvValue("A=1", "B", "2"), "A=1\nB=2\n");
  assert.equal(setEnvValue("A=1\n", "B", "2"), "A=1\nB=2\n");
  assert.equal(setEnvValue("", "B", "2"), "B=2\n");
});

test("setEnvValue does not match keys that only share a prefix", () => {
  assert.equal(setEnvValue("XB=1\n", "B", "2"), "XB=1\nB=2\n");
});
