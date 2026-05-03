const https = require("https");

exports.handler = async function (event, context) {
  // Only allow POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  // CORS headers — allow all origins (your frontend)
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  // Handle preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  // Get API key from Netlify environment variable (never exposed to browser)
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "API key not configured. Add CLAUDE_API_KEY in Netlify environment variables." }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const userMessage = body.message;
  const currentDateTime = body.currentDateTime || new Date().toISOString();

  if (!userMessage) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "No message provided" }) };
  }

  const systemPrompt = `You are RemindAI, an intelligent reminder assistant embedded in a web app.

Your job is to extract reminder details from the user's natural language input and return ONLY valid JSON — no markdown, no explanation, just the raw JSON object.

Current date/time (user's local time): ${currentDateTime}

Rules:
- Parse vague time references relative to the current date/time above
  (e.g. "next Thursday", "tomorrow at 9am", "in 2 hours", "next week Monday")
- If no time is given, default to 9:00 AM on the relevant day
- If no date is given, assume today
- Choose category from: GENERAL, WORK, VEHICLE, HEALTH, PERSONAL, MEETING, FINANCE
- Choose recurrence from: NONE, DAILY, WEEKLY, MONTHLY
- Write a warm, brief confirmationMessage (1 sentence max) confirming what was set
- triggerTimestamp must be a valid ISO 8601 datetime string in the user's local time

Return ONLY this exact JSON structure:
{
  "title": "Short reminder title",
  "description": "Optional extra detail or empty string",
  "triggerTimestamp": "2026-05-10T13:00:00",
  "category": "WORK",
  "recurrence": "NONE",
  "confirmationMessage": "Done! I've set a reminder for your oil change on Thursday at 1:00 PM."
}`;

  const requestBody = JSON.stringify({
    model: "claude-opus-4-5",
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  return new Promise((resolve) => {
    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "content-length": Buffer.byteLength(requestBody),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            resolve({
              statusCode: 400,
              headers,
              body: JSON.stringify({ error: parsed.error.message || "Claude API error" }),
            });
            return;
          }
          const textContent = parsed.content?.find((c) => c.type === "text")?.text || "";
          const clean = textContent.replace(/```json|```/g, "").trim();
          const reminder = JSON.parse(clean);
          resolve({ statusCode: 200, headers, body: JSON.stringify({ success: true, reminder }) });
        } catch (e) {
          resolve({
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Failed to parse Claude response", raw: data }),
          });
        }
      });
    });

    req.on("error", (e) => {
      resolve({ statusCode: 500, headers, body: JSON.stringify({ error: e.message }) });
    });

    req.write(requestBody);
    req.end();
  });
};
