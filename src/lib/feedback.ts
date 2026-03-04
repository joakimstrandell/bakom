import { createServerFn } from "@tanstack/react-start";

type FeedbackData = {
  message: string;
  email?: string;
  name?: string;
};

export const submitFeedbackFn = createServerFn({ method: "POST" })
  .inputValidator((d: FeedbackData) => d)
  .handler(async ({ data }) => {
    const { message, email, name } = data;
    const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

    if (!message?.trim()) {
      throw new Error("Meddelande krävs");
    }

    if (!SLACK_WEBHOOK_URL) {
      console.error("SLACK_WEBHOOK_URL is not configured");
      throw new Error("Feedback är inte konfigurerat");
    }

    const slackPayload = {
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "📬 Ny feedback från Bakom",
            emoji: true,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: message,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: [
                name ? `*Namn:* ${name}` : null,
                email ? `*E-post:* ${email}` : null,
                `*Tid:* ${new Date().toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" })}`,
              ]
                .filter(Boolean)
                .join("  |  "),
            },
          ],
        },
      ],
    };

    const slackRes = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slackPayload),
    });

    if (!slackRes.ok) {
      console.error("Slack webhook failed:", await slackRes.text());
      throw new Error("Kunde inte skicka feedback");
    }

    return { success: true };
  });
