/**
 * The sample company Broccoli fills a new instance with: a lean UK software company.
 * Each person's avatar is `avatars/<first>-<last>.webp`.
 */
export const DEMO_PEOPLE: readonly DemoPersonEntry[] = [
  {
    firstName: "Oliver",
    lastName: "Bennett",
    jobTitle: "CEO",
    startedDaysAgo: 2555,
    isOwner: true,
  },
  {
    firstName: "Priya",
    lastName: "Shah",
    manager: "Oliver Bennett",
    jobTitle: "CTO",
    startedDaysAgo: 2520,
  },
  {
    firstName: "James",
    lastName: "Whitfield",
    manager: "Oliver Bennett",
    jobTitle: "COO",
    startedDaysAgo: 2190,
  },
  {
    firstName: "Daniel",
    lastName: "Okafor",
    manager: "Priya Shah",
    jobTitle: "Engineering Lead",
    startedDaysAgo: 1825,
  },
  {
    firstName: "Sophie",
    lastName: "Turner",
    manager: "Daniel Okafor",
    jobTitle: "Senior Software Engineer",
    startedDaysAgo: 1460,
  },
  {
    firstName: "Arjun",
    lastName: "Patel",
    manager: "Daniel Okafor",
    jobTitle: "Senior Software Engineer",
    startedDaysAgo: 1280,
  },
  {
    firstName: "Hannah",
    lastName: "Moss",
    manager: "Daniel Okafor",
    jobTitle: "Senior Software Engineer",
    startedDaysAgo: 1095,
  },
  {
    firstName: "Wei",
    lastName: "Chen",
    manager: "Daniel Okafor",
    jobTitle: "Software Engineer",
    startedDaysAgo: 900,
  },
  {
    firstName: "Tom",
    lastName: "Hughes",
    manager: "Daniel Okafor",
    jobTitle: "Software Engineer",
    startedDaysAgo: 610,
  },
  {
    firstName: "Emily",
    lastName: "Clarke",
    manager: "Daniel Okafor",
    jobTitle: "Software Engineer",
    startedDaysAgo: 430,
  },
  {
    firstName: "Lewis",
    lastName: "Grant",
    manager: "Daniel Okafor",
    jobTitle: "Software Engineer",
    startedDaysAgo: -14,
  },
  {
    firstName: "Charlotte",
    lastName: "Evans",
    manager: "Priya Shah",
    jobTitle: "Product Manager",
    startedDaysAgo: 1200,
  },
  {
    firstName: "Ravi",
    lastName: "Kumar",
    manager: "Priya Shah",
    jobTitle: "Product Manager",
    startedDaysAgo: 700,
  },
  {
    firstName: "Isla",
    lastName: "Murray",
    manager: "Charlotte Evans",
    jobTitle: "Product Designer",
    startedDaysAgo: 820,
  },
  { firstName: "Jack", lastName: "Robinson", manager: "Daniel Okafor", startedDaysAgo: 120 },
  {
    firstName: "Rachel",
    lastName: "Doyle",
    manager: "Oliver Bennett",
    jobTitle: "Head of Sales",
    startedDaysAgo: 1650,
  },
  {
    firstName: "Ethan",
    lastName: "Walsh",
    manager: "Rachel Doyle",
    jobTitle: "Account Executive",
    startedDaysAgo: 980,
  },
  {
    firstName: "Amira",
    lastName: "Hassan",
    manager: "Rachel Doyle",
    jobTitle: "Account Executive",
    startedDaysAgo: 540,
  },
  {
    firstName: "George",
    lastName: "Price",
    manager: "Rachel Doyle",
    jobTitle: "Account Executive",
    startedDaysAgo: 300,
  },
  {
    firstName: "Noah",
    lastName: "Fletcher",
    manager: "Rachel Doyle",
    jobTitle: "Account Executive",
    startedDaysAgo: -30,
  },
  {
    firstName: "Chloe",
    lastName: "Ward",
    manager: "Rachel Doyle",
    jobTitle: "Sales Development Representative",
    startedDaysAgo: 210,
  },
  {
    firstName: "Samuel",
    lastName: "Adeyemi",
    manager: "Rachel Doyle",
    jobTitle: "Sales Development Representative",
    startedDaysAgo: 90,
  },
  {
    firstName: "Megan",
    lastName: "Lloyd",
    manager: "Rachel Doyle",
    jobTitle: "Sales Development Representative",
  },
  {
    firstName: "Lucy",
    lastName: "Fraser",
    manager: "Oliver Bennett",
    jobTitle: "Marketing Manager",
    startedDaysAgo: 1100,
  },
  {
    firstName: "Harry",
    lastName: "Lawson",
    manager: "Lucy Fraser",
    jobTitle: "Content Marketer",
    startedDaysAgo: 460,
  },
  {
    firstName: "Grace",
    lastName: "Mitchell",
    manager: "James Whitfield",
    jobTitle: "Head of Customer Success",
    startedDaysAgo: 1500,
  },
  {
    firstName: "Aisha",
    lastName: "Begum",
    manager: "Grace Mitchell",
    jobTitle: "Customer Success Manager",
    startedDaysAgo: 760,
  },
  {
    firstName: "Ryan",
    lastName: "Campbell",
    manager: "Grace Mitchell",
    jobTitle: "Customer Success Manager",
    startedDaysAgo: 650,
  },
  {
    firstName: "Ella",
    lastName: "Harrison",
    manager: "Grace Mitchell",
    jobTitle: "Customer Success Manager",
    startedDaysAgo: 380,
  },
  {
    firstName: "Kwame",
    lastName: "Mensah",
    manager: "Grace Mitchell",
    jobTitle: "Support Specialist",
    startedDaysAgo: 260,
  },
  {
    firstName: "Zoe",
    lastName: "Parker",
    manager: "Grace Mitchell",
    jobTitle: "Support Specialist",
    startedDaysAgo: 150,
  },
  {
    firstName: "Callum",
    lastName: "Reid",
    manager: "Grace Mitchell",
    jobTitle: "Support Specialist",
    startedDaysAgo: 60,
  },
  { firstName: "Jasmine", lastName: "Wong", manager: "Grace Mitchell", startedDaysAgo: 30 },
  {
    firstName: "Laura",
    lastName: "Simmons",
    manager: "James Whitfield",
    jobTitle: "Operations Manager",
    startedDaysAgo: 1700,
  },
  {
    firstName: "Nadia",
    lastName: "Hussain",
    manager: "James Whitfield",
    jobTitle: "People Partner",
    startedDaysAgo: 870,
  },
  {
    firstName: "Mark",
    lastName: "Davies",
    manager: "James Whitfield",
    jobTitle: "Finance Manager",
    startedDaysAgo: 2000,
  },
  {
    firstName: "Helen",
    lastName: "Brooks",
    manager: "Mark Davies",
    jobTitle: "Bookkeeper",
    startedDaysAgo: 1350,
  },
  { firstName: "Owen", lastName: "Jenkins", manager: "Laura Simmons", jobTitle: "Office Manager" },
  {
    firstName: "Amelia",
    lastName: "Scott",
    manager: "Laura Simmons",
    jobTitle: "Operations Coordinator",
    startedDaysAgo: 500,
  },
  {
    firstName: "Ben",
    lastName: "Foster",
    manager: "Mark Davies",
    jobTitle: "Finance Analyst",
    startedDaysAgo: 240,
  },
];

export interface DemoPersonEntry {
  firstName: string;
  lastName: string;
  jobTitle?: string;
  /** The manager's first and last name, another entry's. */
  manager?: string;
  /** Days before the seeding day; negative for people who have not started yet. */
  startedDaysAgo?: number;
  /** The person the workspace's owner is in the demo, so their own pages and tasks show. */
  isOwner?: true;
}
