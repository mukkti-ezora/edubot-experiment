/** Seeded demo accounts for one-click sign-in. Passwords come from env, never from source. */
export interface DemoAccount {
  role: string;
  name: string;
  email: string;
  password: string;
}

export function demoAccounts(): DemoAccount[] {
  const admin = import.meta.env.VITE_DEMO_ADMIN_PASSWORD;
  const role = import.meta.env.VITE_DEMO_ROLE_PASSWORD;
  if (!admin || !role) return [];
  return [
    { role: "Administrator", name: "Marisol Vance", email: "sysadmin@edubot.example.edu", password: admin },
    { role: "Student", name: "Ingrid Abiodun", email: "ingrid.abiodun@ashf.example.edu", password: role },
    { role: "Teacher", name: "Leila Abiodun", email: "leila.abiodun@ashf.example.edu", password: role },
    { role: "Parent", name: "Adaeze Abiodun", email: "adaeze.abiodun@ashf.example.edu", password: role },
  ];
}
