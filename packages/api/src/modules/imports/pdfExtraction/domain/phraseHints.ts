import type { MaskedWord } from "../../../../integrations/ai";
import { casefold } from "./casefold";
import { visualLines } from "./visualLines";

/**
 * The hints that replace single-word ones, line by line: a heading of up to four words, a blank
 * placeholder, and numbers in a line of two or more. A later match wins, as in the research.
 */
export function phraseHints(
  words: MaskedWord[],
  sourceOf: (id: string) => string,
): Map<string, string> {
  const hints = new Map<string, string>();
  for (const line of visualLines(words)) {
    const raw = line.words.map(({ id }) => sourceOf(id));
    const normalized = raw.map((value) => casefold(value).replace(/[^\p{L}\p{N}_]+/gu, ""));
    for (let start = 0; start < raw.length; start++) {
      for (let count = Math.min(4, raw.length - start); count > 0; count--) {
        const category = PHRASES.get(normalized.slice(start, start + count).join(""));
        if (category) {
          line.words.slice(start, start + count).forEach(({ id }) => hints.set(id, category));
          break;
        }
      }
    }
    const numbers = raw.filter((value) => NUMBER.test(value)).length;
    line.words.forEach(({ id }, index) => {
      if (/^[._…-]{2,}$/u.test(raw[index]!)) hints.set(id, "blank_placeholder");
      else if (numbers >= 2 && NUMBER.test(raw[index]!)) hints.set(id, "tabular_number");
    });
  }
  return hints;
}

const NUMBER = /^\d[\d,.]*$/u;

/** Phrases of up to four words, spaces and punctuation removed, and their categories. */
const PHRASES = new Map(
  Object.entries({
    therevd: "honorific",
    domiciliooficialnombre: "address_heading",
    domiciliooficialtipo: "address_heading",
    domiciliooficialclave: "address_heading",
    domiciliooficialnumero: "address_heading",
    tablacampos: "continuation_band_heading",
    addressname: "address_heading",
    nameofcompany: "company_heading",
    companyaddress: "company_heading",
    contactpersonname: "company_contact_heading",
    companyemployeelist: "document_title",
    employeecontactlist: "document_title",
    staffdirectory: "document_title",
    employeebenefit: "benefits_heading",
    employeeterm: "benefits_heading",
    employeepersonalaccident: "benefits_heading",
    employeecrisisprotector: "benefits_heading",
    employeetakafulincome: "benefits_heading",
    compassionateallowance: "benefits_heading",
    coveragemember: "benefits_heading",
    coverageperiod: "reporting_date_heading",
    submissiondate: "reporting_date_heading",
    declarationbyemployer: "declaration_heading",
    authorisedsignature: "signature_heading",
    authorizedsignature: "signature_heading",
    forofficeuse: "office_only_heading",
    planamount: "pricing_heading",
    plantype: "pricing_heading",
    emergencycontact: "excluded_contact_heading",
    emergencycontacts: "excluded_contact_heading",
    nextofkin: "excluded_contact_heading",
    firstname: "given_name_heading",
    givenname: "given_name_heading",
    familyname: "family_name_heading",
    lastname: "family_name_heading",
    employeename: "name_heading",
    fullname: "name_heading",
    nameemployee: "name_heading",
    employmentstart: "hire_date_heading",
    hiredate: "hire_date_heading",
    startdate: "hire_date_heading",
    dateofbirth: "birth_date_heading",
    birthdate: "birth_date_heading",
    bankaccount: "bank_account_heading",
    annualsalary: "salary_heading",
    workemail: "email_heading",
    homeemail: "personal_email_heading",
  }),
);
