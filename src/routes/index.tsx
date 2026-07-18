import { createFileRoute } from "@tanstack/react-router";
import { ConversationProvider } from "@elevenlabs/react";
import App from "../App";

export const Route = createFileRoute("/")({
  component: Index,
  ssr: false,
});

function Index() {
  return (
    <ConversationProvider>
      <App />
    </ConversationProvider>
  );
}
