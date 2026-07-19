import type { CateringBrief } from "../domain";
import { getMissingBriefFields } from "./brief-intake";

export function getCanonicalBriefPayload(brief: CateringBrief) {
  return {
    id: brief.id,
    version: brief.version,
    vertical: "catering",
    eventType: brief.eventType,
    eventDate: brief.eventDate,
    city: brief.city,
    venueAddress: brief.venueAddress,
    guestCount: brief.guestCount,
    serviceStyle: brief.serviceStyle,
    menuPreference: brief.menuPreference,
    dietaryRequirements: brief.dietaryRequirements,
    staffingHours: brief.staffingHours,
    targetBudget: brief.targetBudget,
    absoluteMaximum: brief.absoluteMaximum,
    radiusKm: brief.radiusKm,
    currency: brief.currency,
    authority: {
      mayUseVerifiedLeverage: brief.mayUseVerifiedLeverage,
      mayDiscloseTargetBudget: brief.mayDiscloseTargetBudget,
      mayBook: false as const,
    },
  };
}

export function serializeCanonicalBrief(brief: CateringBrief) {
  return JSON.stringify(getCanonicalBriefPayload(brief));
}

function fallbackSha256(bytes: Uint8Array) {
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const words: number[] = [];
  const bitLength = bytes.length * 8;

  for (let index = 0; index < bytes.length; index += 1) {
    words[index >> 2] = (words[index >> 2] ?? 0) | (bytes[index] << (24 - (index % 4) * 8));
  }
  words[bitLength >> 5] = (words[bitLength >> 5] ?? 0) | (0x80 << (24 - (bitLength % 32)));
  words[(((bitLength + 64) >> 9) << 4) + 15] = bitLength;

  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  for (let block = 0; block < words.length; block += 16) {
    const schedule = new Array<number>(64);
    for (let round = 0; round < 64; round += 1) {
      if (round < 16) {
        schedule[round] = words[block + round] ?? 0;
      } else {
        const previous15 = schedule[round - 15];
        const previous2 = schedule[round - 2];
        const sigma0 =
          ((previous15 >>> 7) | (previous15 << 25)) ^
          ((previous15 >>> 18) | (previous15 << 14)) ^
          (previous15 >>> 3);
        const sigma1 =
          ((previous2 >>> 17) | (previous2 << 15)) ^
          ((previous2 >>> 19) | (previous2 << 13)) ^
          (previous2 >>> 10);
        schedule[round] = (schedule[round - 16] + sigma0 + schedule[round - 7] + sigma1) >>> 0;
      }
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let round = 0; round < 64; round += 1) {
      const sum1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choose + constants[round] + schedule[round]) >>> 0;
      const sum0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  return hash.map((value) => value.toString(16).padStart(8, "0")).join("");
}

export async function hashCanonicalBrief(canonicalJson: string) {
  const data = new TextEncoder().encode(canonicalJson);
  if (!globalThis.crypto?.subtle) {
    return fallbackSha256(data);
  }

  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function confirmCanonicalBrief(brief: CateringBrief): Promise<CateringBrief> {
  const missingFields = getMissingBriefFields(brief);
  if (missingFields.length) {
    throw new Error(`Complete the brief before confirmation: ${missingFields.join(", ")}.`);
  }
  if (!brief.intakeEvidence.voiceInterviewCompleted) {
    throw new Error("Complete the ElevenLabs voice interview before confirmation.");
  }
  if (!brief.intakeEvidence.documents.length) {
    throw new Error("Import at least one document before confirmation.");
  }

  const canonicalJson = serializeCanonicalBrief(brief);
  const contentHash = await hashCanonicalBrief(canonicalJson);
  return {
    ...brief,
    status: "confirmed",
    canonicalJson,
    contentHash,
    confirmedAt: new Date().toISOString(),
  };
}

export function amendCanonicalBrief(brief: CateringBrief): CateringBrief {
  return {
    ...brief,
    version: brief.version + 1,
    status: "draft",
    canonicalJson: undefined,
    contentHash: undefined,
    confirmedAt: undefined,
  };
}
