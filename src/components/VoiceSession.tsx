import { Mic, MicOff, PhoneCall, PhoneOff, Radio } from "lucide-react";
import {
  useConversationControls,
  useConversationInput,
  useConversationStatus,
} from "@elevenlabs/react";
import { getElevenLabsConversationToken, LILLY_PUBLIC_AGENT_ID } from "../lib/elevenlabs";

interface VoiceSessionProps {
  agentId?: string;
  label: string;
  dynamicVariables: Record<string, string | number | boolean>;
  onStarted?: () => void;
  onEnded?: () => void;
}

export function VoiceSession({
  agentId,
  label,
  dynamicVariables,
  onStarted,
  onEnded,
}: VoiceSessionProps) {
  const { startSession, endSession } = useConversationControls();
  const { status, message } = useConversationStatus();
  const { isMuted, setMuted } = useConversationInput();
  const resolvedAgentId = agentId || LILLY_PUBLIC_AGENT_ID;
  const isConnected = status === "connected";
  const isConnecting = status === "connecting";

  async function handleStart() {
    const participantName = String(dynamicVariables.call_session_id ?? dynamicVariables.brief_id);
    const conversationToken = await getElevenLabsConversationToken(
      resolvedAgentId,
      participantName,
    );
    const commonOptions = {
      connectionType: "webrtc" as const,
      dynamicVariables,
      userId: participantName,
    };

    if (conversationToken) {
      await startSession({ ...commonOptions, conversationToken });
    } else {
      await startSession({ ...commonOptions, agentId: resolvedAgentId });
    }
    onStarted?.();
  }

  async function handleEnd() {
    await endSession();
    onEnded?.();
  }

  return (
    <div className={`voice-session ${isConnected ? "voice-session--live" : ""}`}>
      <div className="voice-orb" aria-hidden="true">
        {isConnected ? <Radio size={26} /> : <PhoneCall size={26} />}
      </div>
      <div className="voice-session__copy">
        <strong>{label}</strong>
        <span>
          {isConnected
            ? "Live with Lilly"
            : isConnecting
              ? "Connecting securely..."
              : message || "Ready for a live browser voice session"}
        </span>
      </div>
      <div className="voice-session__actions">
        {isConnected && (
          <button
            className="icon-button"
            type="button"
            onClick={() => setMuted(!isMuted)}
            aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
          >
            {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
        )}
        <button
          className={isConnected ? "button button--danger" : "button button--primary"}
          type="button"
          disabled={isConnecting}
          onClick={isConnected ? handleEnd : handleStart}
        >
          {isConnected ? <PhoneOff size={17} /> : <PhoneCall size={17} />}
          {isConnected ? "End session" : "Talk to Lilly"}
        </button>
      </div>
    </div>
  );
}
