import { createFileRoute } from "@tanstack/react-router";
import JSZip from "jszip";

const FIELD_SCHEMA_HINT = `{
  "eventType": string,
  "eventDate": string (ISO or human date),
  "city": string,
  "venueAddress": string,
  "guestCount": number,
  "serviceStyle": string,
  "menuPreference": string,
  "dietaryRequirements": string,
  "staffingHours": number,
  "targetBudget": number,
  "absoluteMaximum": number,
  "radiusKm": number,
  "currency": "EUR" | "USD" | "GBP"
}`;

async function extractTextFromDocx(buffer: ArrayBuffer) {
  const zip = await JSZip.loadAsync(buffer);
  const doc = zip.file("word/document.xml");
  if (!doc) throw new Error("Word document is missing word/document.xml.");
  const xml = await doc.async("string");
  const text = xml
    .replace(/<w:p[^>]*>/g, "\n")
    .replace(/<w:tab[^>]*\/>/g, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
  return text.trim();
}

async function extractTextFromPptx(buffer: ArrayBuffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort();
  const parts: string[] = [];
  for (const name of slideFiles) {
    const xml = await zip.files[name].async("string");
    const text = xml
      .replace(/<a:p[^>]*>/g, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
    if (text) parts.push(text);
  }
  return parts.join("\n\n");
}

async function extractFieldsWithOpenAI(args: {
  apiKey: string;
  model: string;
  fileName: string;
  text?: string;
  pdfBase64?: string;
  pdfMime?: string;
}) {
  const systemPrompt = `You extract catering event brief fields from a supplied document.
Return ONLY a compact JSON object matching this shape (omit fields you cannot confidently infer):
${FIELD_SCHEMA_HINT}
Numeric fields must be numbers, not strings. Do not invent values.`;

  const userContent: Array<Record<string, unknown>> = [];
  if (args.pdfBase64) {
    userContent.push({
      type: "input_file",
      filename: args.fileName,
      file_data: `data:${args.pdfMime ?? "application/pdf"};base64,${args.pdfBase64}`,
    });
    userContent.push({
      type: "input_text",
      text: "Extract the catering brief fields from this document.",
    });
  } else {
    userContent.push({
      type: "input_text",
      text: `Extract the catering brief fields from the document "${args.fileName}":\n\n${args.text ?? ""}`,
    });
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      model: args.model,
      input: [
        { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
        { role: "user", content: userContent },
      ],
      text: { format: { type: "json_object" } },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI extraction failed: ${response.status} ${detail.slice(0, 300)}`);
  }
  const payload = (await response.json()) as Record<string, unknown>;
  let outputText = typeof payload.output_text === "string" ? payload.output_text : "";
  if (!outputText && Array.isArray(payload.output)) {
    for (const item of payload.output as Array<Record<string, unknown>>) {
      const content = Array.isArray(item.content) ? item.content : [];
      for (const part of content as Array<Record<string, unknown>>) {
        if (typeof part.text === "string") outputText += part.text;
      }
    }
  }
  if (!outputText) throw new Error("OpenAI returned no fields.");
  return JSON.parse(outputText) as Record<string, unknown>;
}

export const Route = createFileRoute("/api/parse-brief-document")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const apiKey = process.env.OPENAI_API_KEY;
          const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
          if (!apiKey) {
            return new Response(
              JSON.stringify({ error: "OPENAI_API_KEY is not configured on the server." }),
              { status: 500, headers: { "Content-Type": "application/json" } },
            );
          }
          const form = await request.formData();
          const file = form.get("file");
          if (!(file instanceof File)) {
            return new Response(JSON.stringify({ error: "No file supplied." }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }
          const name = file.name.toLowerCase();
          const buffer = await file.arrayBuffer();
          let fields: Record<string, unknown>;

          if (name.endsWith(".pdf") || file.type === "application/pdf") {
            const base64 = Buffer.from(buffer).toString("base64");
            fields = await extractFieldsWithOpenAI({
              apiKey,
              model,
              fileName: file.name,
              pdfBase64: base64,
              pdfMime: file.type || "application/pdf",
            });
          } else if (name.endsWith(".docx")) {
            const text = await extractTextFromDocx(buffer);
            fields = await extractFieldsWithOpenAI({
              apiKey,
              model,
              fileName: file.name,
              text,
            });
          } else if (name.endsWith(".pptx")) {
            const text = await extractTextFromPptx(buffer);
            fields = await extractFieldsWithOpenAI({
              apiKey,
              model,
              fileName: file.name,
              text,
            });
          } else {
            return new Response(
              JSON.stringify({
                error: "Unsupported file type. Upload PDF, DOCX, or PPTX.",
              }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          return new Response(JSON.stringify({ fields }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          return new Response(
            JSON.stringify({
              error: error instanceof Error ? error.message : "Document parsing failed.",
            }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
