import { Hono } from "hono";

type Bindings = {
  TASK_WEBHOOK_URL: string;
  ENQUETE_WEBHOOK_URL: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/", (c) => {
  return c.text("Hello Scene Hunter Workers!");
});

app.post("/task", async (c) => {
  const data = await c.req.json();
  const taskName = data.data.properties["タスク名"].title[0].text.content;
  const status = data.data.properties["Status"].status.name;
  const assignedToAvatarUrl =
    data.data.properties["割り当て"].people[0].avatar_url;
  const dueDate = data.data.properties["期限"].date.start;
  const priority = data.data.properties["重要度"].select.name;
  const taskUrl = data.data.url;

  // Assemble Discord message
  const discordMessage = {
    title: taskName,
    color: status == "Done" ? 2883391 : 3093247,
    author: {
      name: status,
      icon_url: assignedToAvatarUrl,
    },
    url: taskUrl,
    footer: {
      text: `優先度 ${priority} | 期限`,
    },
    timestamp: dueDate,
  };

  const webhookUrl = c.env.TASK_WEBHOOK_URL;
  return sendToDiscord(c, webhookUrl, discordMessage);
});

app.post("/enquete", async (c) => {
  const data = await c.req.json();
  const properties = extractProperties(data);

  // Assemble Discord message
  const discordMessage = {
    title: "アンケート結果",
    color: 55807,
    fields: [
      ...Object.entries(properties).map(([key, value]) => ({
        name: key,
        value: value,
      })),
    ],
  };

  // Send to Discord
  const webhookUrl = c.env.ENQUETE_WEBHOOK_URL;
  return sendToDiscord(c, webhookUrl, discordMessage);
});

const extractProperties = (data: any) => {
  const result: { [key: string]: any } = {};
  const properties = data.data.properties;

  for (const [key, value] of Object.entries(properties)) {
    let extractedValue = null;

    switch ((value as any).type) {
      case "rich_text":
        extractedValue = (value as any).rich_text
          .map((item: any) => item.text.content)
          .join(" ");
        break;
      case "select":
        extractedValue = (value as any).select?.name || null;
        break;
      case "multi_select":
        extractedValue = (value as any).multi_select
          .map((item: any) => item.name)
          .join(", ");
        break;
      default:
        extractedValue = null;
        break;
    }

    if (extractedValue) {
      result[key] = extractedValue;
    }
  }

  return result;
};

const sendToDiscord = async (c: any, url: string, message: any) => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      embeds: [message],
    }),
  });
  if (!response.ok) {
    return c.json({ message: "Failed to send task to Discord" }, 500);
  }
  return c.json({ message: "Task sent to Discord" });
};

export default app;
