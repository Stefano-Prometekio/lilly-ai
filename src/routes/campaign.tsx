import { createFileRoute } from "@tanstack/react-router";
import { ConversationProvider } from "@elevenlabs/react";
import App from "../App";

export const Route = createFileRoute("/campaign")({
  component: Campaign,
  ssr: false,
});

function Campaign() {
  return (
    <ConversationProvider>
      <App />
    </ConversationProvider>
  );
}
