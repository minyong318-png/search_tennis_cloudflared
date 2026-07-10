import test from "node:test";
import assert from "node:assert/strict";

import { readFreshUiValues } from "../PagesDaehoeIssum/src/adb-ui-dump.js";

test("ADB UI dump removes stale XML and retries before reading", async () => {
  const calls = [];
  let dumpAttempts = 0;
  const runAdb = async (...args) => {
    calls.push(args.join(" "));
    if (args[0] === "shell" && args.includes("uiautomator")) {
      dumpAttempts += 1;
      if (dumpAttempts === 1) throw new Error("uiautomator timed out");
    }
    if (args[0] === "exec-out") return { stdout: '<node text="대회 목록" />' };
    return { stdout: "" };
  };

  const values = await readFreshUiValues({
    runAdb,
    decode: (xml) => [...xml.matchAll(/text="([^"]+)"/g)].map((match) => match[1]),
    wait: async () => {}
  });

  assert.deepEqual(values, ["대회 목록"]);
  assert.equal(dumpAttempts, 2);
  assert.equal(calls.filter((call) => call.startsWith("exec-out cat")).length, 1);
  assert.equal(calls.filter((call) => call.startsWith("shell rm -f")).length, 2);
});
