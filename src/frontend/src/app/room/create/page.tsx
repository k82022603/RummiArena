import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import CreateRoomClient from "./CreateRoomClient";

/**
 * Room 생성 페이지 (Server Component)
 */
export default async function CreateRoomPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return <CreateRoomClient />;
}
