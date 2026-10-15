import { describe, expect, it } from "vitest";

import { splitFullName, splitFullNames } from "./personValues";

describe("splitFullName", () => {
  it.each(["Wening", "林美玲"])("keeps the single word %s as the first name", (fullName) => {
    expect(splitFullName(`  ${fullName}  `)).toEqual({ firstName: fullName, lastName: null });
  });

  it.each([
    ["Lena Vogel", "Lena", "Vogel"],
    ["Inés Costa", "Inés", "Costa"],
    ["Anne-Marie O'Brien", "Anne-Marie", "O'Brien"],
    ["  LENA\t vogel  ", "LENA", "vogel"],
    ["Sato Misaki", "Sato", "Misaki"],
  ])("splits two Latin words in %s", (fullName, firstName, lastName) => {
    expect(splitFullName(fullName)).toEqual({ firstName, lastName });
  });

  it.each([
    ["Иванов Иван Ильич", "Иван Ильич", "Иванов"],
    ["Петрова Анна Ильинична", "Анна Ильинична", "Петрова"],
    ["Соколова Мария Ивановна", "Мария Ивановна", "Соколова"],
    ["Волкова Елена Сергеевна", "Елена Сергеевна", "Волкова"],
    ["Коваль Олена Іванівна", "Олена Іванівна", "Коваль"],
    ["Мельник Оксана Андріївна", "Оксана Андріївна", "Мельник"],
    ["КАВАЛЬ АЛЯКСЕЙ ПЯТРОВІЧ", "АЛЯКСЕЙ ПЯТРОВІЧ", "КАВАЛЬ"],
    ["Каваль Алена Іванаўна", "Алена Іванаўна", "Каваль"],
  ])("keeps the last patronymic with the given name in %s", (fullName, firstName, lastName) => {
    expect(splitFullName(fullName)).toEqual({ firstName, lastName });
  });

  it("keeps a middle patronymic with the given name", () => {
    expect(splitFullName("Иван Ильич Иванов")).toEqual({
      firstName: "Иван Ильич",
      lastName: "Иванов",
    });
  });

  it.each([
    ["Inés María Costa", "Inés María Costa"],
    ["Lucía Vega Rojas", "Lucía Vega Rojas"],
    ["  Eva  van\tder Meer  ", "Eva van der Meer"],
    ["Иванов Иван", "Иванов Иван"],
    ["Иванов И.И.", "Иванов И.И."],
    ["R. Kavitha", "R. Kavitha"],
    ["Farah binti Rahman", "Farah binti Rahman"],
    ["Nora Vale, Jr.", "Nora Vale, Jr."],
    ["Иванов Иван Пётр", "Иванов Иван Пётр"],
    ["Иван Ильич Рабинович", "Иван Ильич Рабинович"],
    ["Ivanov Иван Ильич", "Ivanov Иван Ильич"],
  ])("keeps the uncertain name %s whole with single spaces", (fullName, firstName) => {
    expect(splitFullName(fullName)).toEqual({ firstName, lastName: null });
  });
});

describe("splitFullNames", () => {
  it("keeps a long comma-free cell whole", () => {
    const fullName = "a".repeat(64_000);

    expect(splitFullNames([fullName])).toEqual([{ firstName: fullName, lastName: null }]);
  });

  it("reads a column of comma names as family name followed by given name", () => {
    const names = ["  Vega Rojas , Lucía  ", null, "  ", "van der Meer, Eva", "D'Angelo, Luca"];

    expect(splitFullNames(names)).toEqual([
      { firstName: "Lucía", lastName: "Vega Rojas" },
      { firstName: null, lastName: null },
      { firstName: null, lastName: null },
      { firstName: "Eva", lastName: "van der Meer" },
      { firstName: "Luca", lastName: "D'Angelo" },
    ]);
  });

  it("splits each name independently when a filled cell has no comma", () => {
    const names = ["Vega Rojas, Lucía", "Lena Vogel", "Nora Vale, Jr."];

    expect(splitFullNames(names)).toEqual([
      { firstName: "Vega Rojas, Lucía", lastName: null },
      { firstName: "Lena", lastName: "Vogel" },
      { firstName: "Nora Vale, Jr.", lastName: null },
    ]);
  });

  it("returns null name fields for every null or blank cell", () => {
    expect(splitFullNames([null, "", " \t "])).toEqual([
      { firstName: null, lastName: null },
      { firstName: null, lastName: null },
      { firstName: null, lastName: null },
    ]);
  });
});
