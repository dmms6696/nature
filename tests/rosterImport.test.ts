import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCodeList } from "../src/rosterImport.js";
test("코드 명단 표·탭·쉼표 지원, 앞자리 0 보존", () => {
  assert.deepEqual(
    parseCodeList(
      "| 가상학생 A | 000001 |\n| --- | --- |\n| 가상학생 B | 000002 |",
    ),
    [
      { name: "가상학생 A", code: "000001" },
      { name: "가상학생 B", code: "000002" },
    ],
  );
  assert.equal(parseCodeList("가상학생 A\t000001")[0].code, "000001");
  assert.equal(parseCodeList("가상학생 A,000001")[0].code, "000001");
  assert.throws(() => parseCodeList("가상학생 A"));
});
