/**
 * The sample company Broccoli fills a new instance with: a lean UK software company.
 * Each person's avatar is `avatars/<first>-<last>.webp`.
 */
export const DEMO_PEOPLE: readonly DemoPersonEntry[] = [
  { firstName: "Oliver", lastName: "Bennett", jobTitle: "CEO", startedDaysAgo: 2555 },
  { firstName: "Priya", lastName: "Shah", jobTitle: "CTO", startedDaysAgo: 2520 },
  { firstName: "James", lastName: "Whitfield", jobTitle: "COO", startedDaysAgo: 2190 },
  { firstName: "Daniel", lastName: "Okafor", jobTitle: "Engineering Lead", startedDaysAgo: 1825 },
  {
    firstName: "Sophie",
    lastName: "Turner",
    jobTitle: "Senior Software Engineer",
    startedDaysAgo: 1460,
  },
  {
    firstName: "Arjun",
    lastName: "Patel",
    jobTitle: "Senior Software Engineer",
    startedDaysAgo: 1280,
  },
  {
    firstName: "Hannah",
    lastName: "Moss",
    jobTitle: "Senior Software Engineer",
    startedDaysAgo: 1095,
  },
  { firstName: "Wei", lastName: "Chen", jobTitle: "Software Engineer", startedDaysAgo: 900 },
  { firstName: "Tom", lastName: "Hughes", jobTitle: "Software Engineer", startedDaysAgo: 610 },
  { firstName: "Emily", lastName: "Clarke", jobTitle: "Software Engineer", startedDaysAgo: 430 },
  { firstName: "Lewis", lastName: "Grant", jobTitle: "Software Engineer", startedDaysAgo: -14 },
  { firstName: "Charlotte", lastName: "Evans", jobTitle: "Product Manager", startedDaysAgo: 1200 },
  { firstName: "Ravi", lastName: "Kumar", jobTitle: "Product Manager", startedDaysAgo: 700 },
  { firstName: "Isla", lastName: "Murray", jobTitle: "Product Designer", startedDaysAgo: 820 },
  { firstName: "Jack", lastName: "Robinson", startedDaysAgo: 120 },
  { firstName: "Rachel", lastName: "Doyle", jobTitle: "Head of Sales", startedDaysAgo: 1650 },
  { firstName: "Ethan", lastName: "Walsh", jobTitle: "Account Executive", startedDaysAgo: 980 },
  { firstName: "Amira", lastName: "Hassan", jobTitle: "Account Executive", startedDaysAgo: 540 },
  { firstName: "George", lastName: "Price", jobTitle: "Account Executive", startedDaysAgo: 300 },
  { firstName: "Noah", lastName: "Fletcher", jobTitle: "Account Executive", startedDaysAgo: -30 },
  {
    firstName: "Chloe",
    lastName: "Ward",
    jobTitle: "Sales Development Representative",
    startedDaysAgo: 210,
  },
  {
    firstName: "Samuel",
    lastName: "Adeyemi",
    jobTitle: "Sales Development Representative",
    startedDaysAgo: 90,
  },
  { firstName: "Megan", lastName: "Lloyd", jobTitle: "Sales Development Representative" },
  { firstName: "Lucy", lastName: "Fraser", jobTitle: "Marketing Manager", startedDaysAgo: 1100 },
  { firstName: "Harry", lastName: "Lawson", jobTitle: "Content Marketer", startedDaysAgo: 460 },
  {
    firstName: "Grace",
    lastName: "Mitchell",
    jobTitle: "Head of Customer Success",
    startedDaysAgo: 1500,
  },
  {
    firstName: "Aisha",
    lastName: "Begum",
    jobTitle: "Customer Success Manager",
    startedDaysAgo: 760,
  },
  {
    firstName: "Ryan",
    lastName: "Campbell",
    jobTitle: "Customer Success Manager",
    startedDaysAgo: 650,
  },
  {
    firstName: "Ella",
    lastName: "Harrison",
    jobTitle: "Customer Success Manager",
    startedDaysAgo: 380,
  },
  { firstName: "Kwame", lastName: "Mensah", jobTitle: "Support Specialist", startedDaysAgo: 260 },
  { firstName: "Zoe", lastName: "Parker", jobTitle: "Support Specialist", startedDaysAgo: 150 },
  { firstName: "Callum", lastName: "Reid", jobTitle: "Support Specialist", startedDaysAgo: 60 },
  { firstName: "Jasmine", lastName: "Wong", startedDaysAgo: 30 },
  { firstName: "Laura", lastName: "Simmons", jobTitle: "Operations Manager", startedDaysAgo: 1700 },
  { firstName: "Nadia", lastName: "Hussain", jobTitle: "People Partner", startedDaysAgo: 870 },
  { firstName: "Mark", lastName: "Davies", jobTitle: "Finance Manager", startedDaysAgo: 2000 },
  { firstName: "Helen", lastName: "Brooks", jobTitle: "Bookkeeper", startedDaysAgo: 1350 },
  { firstName: "Owen", lastName: "Jenkins", jobTitle: "Office Manager" },
  {
    firstName: "Amelia",
    lastName: "Scott",
    jobTitle: "Operations Coordinator",
    startedDaysAgo: 500,
  },
  { firstName: "Ben", lastName: "Foster", jobTitle: "Finance Analyst", startedDaysAgo: 240 },
];

export interface DemoPersonEntry {
  firstName: string;
  lastName: string;
  jobTitle?: string;
  /** Days before the seeding day; negative for people who have not started yet. */
  startedDaysAgo?: number;
}
