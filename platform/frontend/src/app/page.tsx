import { redirect } from "next/navigation";
import { getInteractions } from "@/lib/clients/api";
import { WaitingScreen } from "./_parts/waiting-screen";

export default async function Home() {
  try {
    // Check if there are any interactions
    const response = await getInteractions();
    const interactions = response.data;

    // If no interactions exist, show waiting screen
    if (!interactions || interactions.length === 0) {
      return <WaitingScreen />;
    }

    redirect("/test-agent");
  } catch (error) {
    console.error("Failed to fetch interactions:", error);
    return <WaitingScreen />;
  }
}
