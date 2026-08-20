import { headers } from "next/headers";
import { getChatGPTUser, requireChatGPTUser, chatGPTSignOutPath } from "./chatgpt-auth";
import CipherDropClient from "./CipherDropClient";

export const dynamic = "force-dynamic";

export default async function Home() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "";
  const signedInUser = await getChatGPTUser();
  const user = signedInUser ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1")
    ? { userId: "local-preview", displayName: "Local preview", email: "preview@local", fullName: "Local preview" }
    : await requireChatGPTUser("/"));

  return <CipherDropClient displayName={user.displayName} signOutPath={chatGPTSignOutPath("/")} />;
}
