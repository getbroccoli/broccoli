import { describe, expect, it } from "vitest";

import { splitFullName, splitFullNames } from "./personValues";

describe("splitFullName", () => {
  it.each(["Wening", "林美玲", "Mr", "Dr."])(
    "keeps the single word %s as the first name",
    (fullName) => {
      expect(splitFullName(`  ${fullName}  `)).toEqual({ firstName: fullName, lastName: null });
    },
  );

  it.each([
    "Mr",
    "Mrs",
    "Ms",
    "Miss",
    "Mx",
    "Dr",
    "Prof",
    "mr.",
    "MRS.",
    "ms.",
    "MISS.",
    "mx.",
    "dr.",
    "PROF.",
  ])("drops the leading title %s", (title) => {
    expect(splitFullName(`${title} Priya Shah`)).toEqual({ firstName: "Priya", lastName: "Shah" });
  });

  it("drops a title before a single name", () => {
    expect(splitFullName("Mx Wening")).toEqual({ firstName: "Wening", lastName: null });
  });

  it("drops a title before given and middle names", () => {
    expect(splitFullName("  Mrs  Mary\tJane Smith  ")).toEqual({
      firstName: "Mary Jane",
      lastName: "Smith",
    });
  });

  it.each([
    ["Lena Vogel", "Lena", "Vogel"],
    ["Inés Costa", "Inés", "Costa"],
    ["Anne-Marie O'Brien", "Anne-Marie", "O'Brien"],
    ["Anna Smith-Jones", "Anna", "Smith-Jones"],
    ["Siobhan O'Neill", "Siobhan", "O'Neill"],
    ["Siobhan O’Neill", "Siobhan", "O’Neill"],
    ["  LENA\t vogel  ", "LENA", "vogel"],
    ["Sato Misaki", "Sato", "Misaki"],
  ])("splits two Latin words in %s", (fullName, firstName, lastName) => {
    expect(splitFullName(fullName)).toEqual({ firstName, lastName });
  });

  it.each([
    ["Mary Jane Smith", "Mary Jane", "Smith"],
    ["Inés María Costa", "Inés María", "Costa"],
    ["  Mary\tJane  Alice Smith  ", "Mary Jane Alice", "Smith"],
    ["Lucía Vega Rojas", "Lucía Vega", "Rojas"],
  ])("uses the final word as the surname in %s", (fullName, firstName, lastName) => {
    expect(splitFullName(fullName)).toEqual({ firstName, lastName });
  });

  it.each([
    "van",
    "der",
    "den",
    "de",
    "la",
    "le",
    "du",
    "da",
    "das",
    "do",
    "dos",
    "von",
    "di",
    "del",
    "della",
  ])("keeps the lowercase particle %s with the surname", (particle) => {
    expect(splitFullName(`Alex ${particle} Vale`)).toEqual({
      firstName: "Alex",
      lastName: `${particle} Vale`,
    });
  });

  it.each([
    ["  Eva  van\tder Meer  ", "Eva", "van der Meer"],
    ["Jean-Pierre de la Fontaine", "Jean-Pierre", "de la Fontaine"],
    ["Lucas de Souza", "Lucas", "de Souza"],
  ])("keeps adjacent particles with the surname in %s", (fullName, firstName, lastName) => {
    expect(splitFullName(fullName)).toEqual({ firstName, lastName });
  });

  it.each([
    ["de Souza", "de", "Souza"],
    ["van der Meer", "van der", "Meer"],
  ])(
    "leaves a first name when particles would take every word in %s",
    (fullName, firstName, lastName) => {
      expect(splitFullName(fullName)).toEqual({ firstName, lastName });
    },
  );

  it.each([
    ["Van Morrison", "Van", "Morrison"],
    ["Eva Van Meer", "Eva Van", "Meer"],
    ["Eva van Robin Meer", "Eva van Robin", "Meer"],
  ])(
    "keeps words outside the lowercase surname particles in the first name in %s",
    (fullName, firstName, lastName) => {
      expect(splitFullName(fullName)).toEqual({ firstName, lastName });
    },
  );

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
    ["Петрова Анна", "Петрова Анна"],
    ["Иванов Иван", "Иванов Иван"],
    ["Иванов И.И.", "Иванов И.И."],
    ["R. Kavitha", "R. Kavitha"],
    ["  Farah\tbinti  Rahman  ", "Farah binti Rahman"],
    ["Nora Vale, Jr.", "Nora Vale, Jr."],
    ["Иванов Иван Пётр", "Иванов Иван Пётр"],
    ["Иван Ильич Рабинович", "Иван Ильич Рабинович"],
    ["Ivanov Иван Ильич", "Ivanov Иван Ильич"],
  ])("keeps the uncertain name %s whole with single spaces", (fullName, firstName) => {
    expect(splitFullName(fullName)).toEqual({ firstName, lastName: null });
  });

  it.each(["bin", "binti", "bint", "ibn", "BIN", "BINTI", "BINT", "IBN"])(
    "keeps a name containing %s whole",
    (word) => {
      const fullName = `Farah ${word} Rahman`;
      expect(splitFullName(fullName)).toEqual({ firstName: fullName, lastName: null });
    },
  );
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
