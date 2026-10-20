import { expect, it } from "vitest";

import { line, page } from "#test/support";

import { pdfLeaderTable } from "./pdfLeaderTable";

it("reads incumbent and wrapped position columns, omitting vacant posts", () => {
  const result = pdfLeaderTable([
    page([
      line(740, ["Position Title", "Name of Incumbent"], 0, 90),
      line(700, ["Washington ...... Deputy Secretary for", "Avery Stone"], 0, 30),
      line(688, ["International Affairs ......"], 0, 90),
      line(660, ["Washington ...... Director ...... Vacant"], 0, 30),
    ]),
  ]);

  expect(result?.sheets[0]?.rows).toEqual([
    ["Name", "Job title"],
    ["Avery Stone", "Deputy Secretary for International Affairs"],
  ]);
});

it("does not use a position title as the incumbent when that field is blank", () => {
  const result = pdfLeaderTable([
    page([
      [text("Position Title", 184, 740), text("Name of Incumbent", 302, 740)],
      [text("Very Long Location Description Here ...... Deputy Secretary", 57, 700)],
    ]),
  ]);

  expect(result).toBeNull();
});

it("does not append a centered section heading to the prior position", () => {
  const result = pdfLeaderTable([
    page([
      [text("Position Title", 184, 740), text("Name of Incumbent", 302, 740)],
      [
        text("Washington ...... Deputy Director ......", 129, 700),
        text("Avery Stone ........", 288, 700),
      ],
      [text("Superintendent of Documents", 158, 688)],
      [
        text("Washington ...... Inspector General ......", 129, 660),
        text("Riley Hart ........", 288, 660),
      ],
      [text("OFFICE OF THE INSPECTOR GENERAL", 130, 648)],
    ]),
  ]);

  expect(result?.sheets[0]?.rows).toEqual([
    ["Name", "Job title"],
    ["Avery Stone", "Deputy Director"],
    ["Riley Hart", "Inspector General"],
  ]);
});

function text(text: string, x: number, y: number) {
  return { text, x, y, width: text.length * 5, height: 10 };
}
