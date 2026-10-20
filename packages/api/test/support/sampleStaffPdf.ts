import { samplePdfFile } from "./samplePdfFile";

/** A staff table; optional footer emails exercise completion of otherwise complete rows. */
export function sampleStaffPdf({ footerEmails = false } = {}): Uint8Array {
  const rows = [
    ["Name", "Email", "Job title", "Start date"],
    ["Stone, Avery", "avery@example.com", "Payroll Specialist", "03.02.2021"],
    ["Robin Reed", "robin@example.com", "Design Lead", "2022-06-15"],
  ];
  return samplePdfFile({
    pages: [
      {
        width: 840,
        texts: [
          ...rows.flatMap((row, index) =>
            row.flatMap((text, column) =>
              footerEmails && column === 1
                ? []
                : [{ text, x: 40 + column * 190, y: 700 - index * 20 }],
            ),
          ),
          ...(footerEmails
            ? [
                { text: "avery@example.com", x: 500, y: 40 },
                { text: "robin@example.com", x: 500, y: 20 },
              ]
            : []),
        ],
      },
    ],
  });
}
