import { redirect } from "next/navigation";

// Marketing landing page comes later; for now send everyone to the app.
// The proxy redirects signed-out visitors from /dashboard to /login.
export default function Home() {
  redirect("/dashboard");
}
