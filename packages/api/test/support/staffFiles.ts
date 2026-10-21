export const STAFF_CSV = "Name,Email\nAvery Stone,avery@example.com";
export const STAFF_PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF");
export const READ_PEOPLE = {
  people: [{ firstName: "Avery", lastName: "Stone", email: "avery@example.com" }],
};
export const STAFF_MAPPING_ANSWERS = {
  sheets: [
    {
      sheet: 1,
      answers: {
        headerRow: "1",
        fullName: "A",
        firstName: "none",
        lastName: "none",
        email: "B",
        jobTitle: "none",
        startDate: "none",
      },
    },
  ],
};
