import {
  Check,
  Circle,
  ExternalLink,
  LoaderCircle,
  MapPin,
  Radar,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { CateringBrief, MarketReference } from "../domain";
import { marketResearchStages, type MarketResearchProgress } from "../lib/market-research-progress";
import { formatMoney } from "../lib/procurement";
import { LocationMap } from "./LocationMap";

interface MarketResearchProps {
  brief: CateringBrief;
  reference: MarketReference;
  onResearch: () => void;
  error?: string;
  progress?: MarketResearchProgress;
}

export function MarketResearch({
  brief,
  reference,
  onResearch,
  error,
  progress,
}: MarketResearchProps) {
  const running = reference.status === "researching";
  const hasReference = reference.status === "complete";
  const activeStageIndex = progress
    ? marketResearchStages.findIndex((stage) => stage.id === progress.stage)
    : 0;

  return (
    <section className="workspace-grid">
      <div className="panel panel--hero market-hero">
        <div className="eyebrow">
          <Radar size={15} /> Local market scan
        </div>
        <h1>Know the market before contacting vendors.</h1>
        <p className="lede">
          Lilly finds relevant caterers and public pricing signals for your event. You get a useful
          local reference point before any vendor conversation begins.
        </p>
        <div className="research-query">
          <Search size={20} />
          <div>
            <strong>
              {brief.status === "confirmed"
                ? `${brief.serviceStyle} for ${brief.guestCount} guests`
                : "Waiting for a confirmed event brief"}
            </strong>
            <span>
              <MapPin size={13} />
              {brief.status === "confirmed"
                ? `${brief.city} · within ${brief.radiusKm} km`
                : "Location and radius will come from intake"}
            </span>
          </div>
        </div>
        <button
          className="button button--primary"
          type="button"
          onClick={onResearch}
          disabled={brief.status !== "confirmed" || running}
        >
          <Radar size={18} className={running ? "spin" : ""} />
          {running ? progress?.message || "Starting the market scan..." : "Scan the local market"}
        </button>
        {brief.status !== "confirmed" && (
          <p className="inline-note">Confirm your event brief before starting the market scan.</p>
        )}
        {error && <p className="error-note">{error}</p>}
      </div>

      <div className="panel">
        <div className="section-heading">
          <div>
            <span className="kicker">Your pricing reference</span>
            <h2>Expected local range</h2>
          </div>
          <span className={`status-pill ${hasReference ? "status-pill--success" : ""}`}>
            {reference.status}
          </span>
        </div>

        {running ? (
          <div className="research-progress" role="status" aria-live="polite">
            <div className="research-progress__header">
              <span className="research-progress__orb" aria-hidden="true">
                <Radar size={22} />
              </span>
              <div>
                <span className="kicker">Lilly is working</span>
                <strong>{progress?.message || "Starting live research"}</strong>
                <p>{progress?.detail || "Preparing the evidence search."}</p>
              </div>
            </div>

            <ol className="research-progress__steps" aria-label="Market scan progress">
              {marketResearchStages.map((stage, index) => {
                const complete = index < activeStageIndex;
                const active = index === activeStageIndex;
                return (
                  <li
                    className={active ? "is-active" : complete ? "is-complete" : ""}
                    key={stage.id}
                  >
                    <span aria-hidden="true">
                      {complete ? (
                        <Check size={15} />
                      ) : active ? (
                        <LoaderCircle className="spin" size={15} />
                      ) : (
                        <Circle size={15} />
                      )}
                    </span>
                    <div>
                      <strong>{stage.label}</strong>
                      <small>{complete ? "Completed" : active ? "In progress" : "Waiting"}</small>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : hasReference ? (
          <>
            <div className="range-chart">
              <div>
                <span>Low</span>
                <strong>{formatMoney(reference.lowTotal, brief.currency)}</strong>
              </div>
              <div className="range-chart__median">
                <span>Typical price</span>
                <strong>{formatMoney(reference.medianTotal, brief.currency)}</strong>
              </div>
              <div>
                <span>High</span>
                <strong>{formatMoney(reference.highTotal, brief.currency)}</strong>
              </div>
            </div>
            <div className="metric-row">
              <div>
                <span>Per guest</span>
                <strong>{formatMoney(reference.medianPerGuest, brief.currency)}</strong>
              </div>
              <div>
                <span>Priced samples</span>
                <strong>{reference.sampleSize || reference.sources.length}</strong>
              </div>
              <div>
                <span>Confidence</span>
                <strong>{Math.round(reference.confidence * 100)}%</strong>
              </div>
            </div>
            <p className="summary-copy">{reference.summary}</p>
            <div className="warning-card">
              <ShieldCheck size={18} />
              <span>
                Lilly uses local vendor listings for discovery. Only linked public pricing sources
                influence this range.
              </span>
            </div>
            <div className="source-list">
              {reference.sources.map((source) => (
                <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>
                  <div>
                    <strong>{source.title}</strong>
                    <span>{source.note}</span>
                  </div>
                  <ExternalLink size={16} />
                </a>
              ))}
            </div>
            <div className="vendor-map-section">
              <div className="map-section-heading">
                <div>
                  <span className="kicker">Local vendor landscape</span>
                  <h3>Event area and discovered vendors</h3>
                </div>
                <span>{reference.vendors.length} vendors found</span>
              </div>
              <LocationMap
                location={brief.venueAddress.trim() || brief.city}
                radiusKm={brief.radiusKm}
                vendors={reference.vendors}
              />
              <ol className="map-vendor-list">
                {reference.vendors.map((vendor, index) => (
                  <li key={vendor.id}>
                    <span className="map-vendor-list__index">{index + 1}</span>
                    <div>
                      <strong>{vendor.name}</strong>
                      <span>{vendor.address || "Address unavailable"}</span>
                    </div>
                    {vendor.mapsUrl && (
                      <a
                        href={vendor.mapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Open ${vendor.name} in Google Maps`}
                      >
                        <ExternalLink size={15} />
                      </a>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <Radar size={38} />
            <strong>Your market snapshot will appear here</strong>
            <span>Confirm the event brief, then ask Lilly to scan the local market.</span>
          </div>
        )}
      </div>
    </section>
  );
}
