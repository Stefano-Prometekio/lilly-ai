import { Mic, MicOff, PhoneCall, PhoneOff, Radio, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  useConversationControls,
  useConversationInput,
  useConversationStatus,
  useRawConversation,
} from "@elevenlabs/react";
import { getElevenLabsConversationToken, LILLY_PUBLIC_AGENT_ID } from "../lib/elevenlabs";

export interface BrowserCallRequest {
  vendorName: string;
  vendorAddress?: string;
  dynamicVariables: Record<string, string | number | boolean>;
}

interface BrowserPhoneCallProps {
  call: BrowserCallRequest | null;
  onDeclined: () => void;
  onEnded: (conversationId: string | null) => void;
}

type UiPhase = "ringing" | "connecting" | "live" | "ended";

function describeCanonicalScope(dynamicVariables: Record<string, string | number | boolean>) {
  try {
    const canonical = JSON.parse(String(dynamicVariables.canonical_brief_json ?? "")) as {
      eventType?: string;
      eventDate?: string;
      city?: string;
      guestCount?: number;
      serviceStyle?: string;
    };
    return `${canonical.eventType}, ${canonical.eventDate}, ${canonical.city}, ${canonical.guestCount} guests, ${canonical.serviceStyle}`;
  } catch {
    return "the exact confirmed catering brief supplied with this call";
  }
}

export function BrowserPhoneCall({ call, onDeclined, onEnded }: BrowserPhoneCallProps) {
  const { startSession, endSession, getId } = useConversationControls();
  const { status } = useConversationStatus();
  const { isMuted, setMuted } = useConversationInput();
  const [phase, setPhase] = useState<UiPhase>("ringing");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const endedRef = useRef(false);
  const conversationIdRef = useRef<string | null>(null);

  // Reset when a new call comes in
  useEffect(() => {
    if (call) {
      endedRef.current = false;
      conversationIdRef.current = null;
      setPhase("ringing");
      setSeconds(0);
      setError(null);
    }
  }, [call?.dynamicVariables.call_session_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track ElevenLabs status → phase. Only react after the user accepted
  // (phase === "connecting" or "live"). This avoids reacting to residual
  // status from a previous call while the next vendor's ringing screen shows.
  useEffect(() => {
    if (!call) return;
    if (phase === "connecting" && status === "connected") {
      setPhase("live");
    }
    if (phase === "live" && status === "disconnected" && !endedRef.current) {
      endedRef.current = true;
      setPhase("ended");
      setTimeout(() => onEnded(conversationIdRef.current), 1200);
    }
  }, [status, call, phase, onEnded]);

  // Poll the SDK for the conversation id once live. startSession resolves
  // before ElevenLabs assigns an id, so reading getId() immediately after
  // startSession often returns "" and we lose the transcript link.
  useEffect(() => {
    if (phase !== "live") return;
    if (conversationIdRef.current) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      try {
        const id = getId();
        if (id) {
          conversationIdRef.current = id;
          return;
        }
      } catch {
        /* noop */
      }
      window.setTimeout(tick, 300);
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [phase, getId]);

  // Live-call timer
  useEffect(() => {
    if (phase !== "live") return;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  async function handleAccept() {
    if (!call) return;
    setPhase("connecting");
    setError(null);
    try {
      const participantName = String(
        call.dynamicVariables.call_session_id ?? call.dynamicVariables.brief_id ?? "vendor",
      );
      const token = await getElevenLabsConversationToken(LILLY_PUBLIC_AGENT_ID, participantName);
      const vendorName = String(call.dynamicVariables.vendor_name ?? call.vendorName);
      const eventSummary = describeCanonicalScope(call.dynamicVariables);
      const firstMessage = `Hi, I'm Lilly, an AI event planning assistant. I'm helping a buyer source catering options for ${eventSummary}. Am I reaching ${vendorName}, and do you have a couple of minutes to walk through it?`;
      const commonOptions = {
        connectionType: "webrtc" as const,
        dynamicVariables: call.dynamicVariables,
        userId: participantName,
        overrides: {
          agent: {
            firstMessage,
          },
        },
      };
      if (token) {
        await startSession({ ...commonOptions, conversationToken: token });
      } else {
        await startSession({ ...commonOptions, agentId: LILLY_PUBLIC_AGENT_ID });
      }
      // conversationId is captured by the effect once phase === "live";
      // getId() usually returns "" here.
    } catch (e) {
      setError((e as Error).message);
      setPhase("ringing");
    }
  }

  async function handleHangup() {
    endedRef.current = true;
    try {
      await endSession();
    } catch {
      /* noop */
    }
    setPhase("ended");
    setTimeout(() => onEnded(conversationIdRef.current), 600);
  }

  function handleDecline() {
    onDeclined();
  }

  if (!call) return null;

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const initials = call.vendorName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div className="phone-overlay" role="dialog" aria-label="Incoming call">
      <div className={`phone-frame phone-frame--${phase}`}>
        <div className="phone-status-bar">
          <span>Lilly Labs</span>
          <span>
            {phase === "ringing" && "Incoming call..."}
            {phase === "connecting" && "Connecting..."}
            {phase === "live" && `In call · ${mm}:${ss}`}
            {phase === "ended" && "Call ended"}
          </span>
        </div>

        <div className={`phone-avatar ${phase === "ringing" ? "phone-avatar--ringing" : ""}`}>
          <div className="phone-avatar__inner">
            {initials ? <span>{initials}</span> : <User size={40} />}
          </div>
        </div>

        <div className="phone-caller">
          <strong>{call.vendorName}</strong>
          <span>{call.vendorAddress || "Catering vendor"}</span>
          <span className="phone-caller__meta">
            {phase === "ringing" && "Lilly (event planning assistant) is calling"}
            {phase === "connecting" && "Opening secure voice line..."}
            {phase === "live" && (
              <>
                <Radio size={12} /> Live with Lilly
              </>
            )}
            {phase === "ended" && "The call has ended"}
          </span>
        </div>

        {error && <div className="phone-error">Error: {error}</div>}

        <div className="phone-actions">
          {phase === "ringing" && (
            <>
              <button
                type="button"
                className="phone-button phone-button--decline"
                onClick={handleDecline}
                aria-label="Decline call"
              >
                <PhoneOff size={22} />
              </button>
              <button
                type="button"
                className="phone-button phone-button--accept"
                onClick={handleAccept}
                aria-label="Answer call"
              >
                <PhoneCall size={22} />
              </button>
            </>
          )}
          {phase === "connecting" && (
            <button
              type="button"
              className="phone-button phone-button--decline"
              onClick={handleHangup}
              aria-label="Cancel"
            >
              <PhoneOff size={22} />
            </button>
          )}
          {phase === "live" && (
            <>
              <button
                type="button"
                className="phone-button phone-button--mute"
                onClick={() => setMuted(!isMuted)}
                aria-label={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
              <button
                type="button"
                className="phone-button phone-button--decline"
                onClick={handleHangup}
                aria-label="End call"
              >
                <PhoneOff size={22} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
