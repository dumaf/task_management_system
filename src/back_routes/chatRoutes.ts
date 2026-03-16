import { Router, Response } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { AppDataSource } from "../data-sources";
import { Task } from "../database_tables/Task";
import { Status } from "../database_tables/Status";
import { authenticateToken, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authenticateToken);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

const SYSTEM_PROMPT = `You are an AI assistant integrated into a Kanban task management app.
Your job is to help users manage their tasks. You can create tasks, delete tasks, change the status of tasks, and create custom statuses.

The user will describe what they want in natural language. You MUST respond with ONLY a valid JSON object — no markdown, no explanation, no extra text.

Use one of the following JSON shapes depending on what the user wants:

1. To create a task:
{"action":"confirm_create","task":{"title":"...","description":"...","statusName":"..."}}

2. To delete a task:
{"action":"confirm_delete","taskId":123,"taskTitle":"..."}

3. To change a task's status:
{"action":"confirm_status_change","taskId":123,"taskTitle":"...","newStatusName":"..."}

4. To create a custom status:
{"action":"confirm_create_status","statusName":"..."}

5. For any conversational reply (greetings, questions, clarifications, confirmations):
{"action":"message","text":"..."}

Rules:
- Always return ONLY valid JSON with no surrounding markdown or text.
- Use the task IDs and status names from the context provided below.
- If the user references a task by name, find its ID from the context.
- If the user wants to create a task but doesn't specify a status, use the first available status.
- If the user's request is unclear, use action "message" to ask for clarification.`;

interface ChatMessage {
    role: "user" | "model";
    parts: string;
}

router.post("/", async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        const { message, history = [] }: { message: string; history: ChatMessage[] } = req.body;

        if (!message) {
            res.status(400).json({ message: "Missing required field: message" });
            return;
        }

        // Fetch user's tasks and statuses for context
        const taskRepository = AppDataSource.getRepository(Task);
        const statusRepository = AppDataSource.getRepository(Status);

        const [tasks, statuses] = await Promise.all([
            taskRepository.find({ where: { user: { id: userId } }, relations: ["status"] }),
            statusRepository.find({ where: { user: { id: userId } } }),
        ]);

        const contextInfo = `
Current tasks:
${tasks.length === 0 ? "  (none)" : tasks.map(t => `  - ID ${t.id}: "${t.title}" (status: "${t.status?.name ?? "unknown"}")${t.description ? ` — ${t.description}` : ""}`).join("\n")}

Available statuses:
${statuses.length === 0 ? "  (none)" : statuses.map(s => `  - "${s.name}"`).join("\n")}
`;

        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            systemInstruction: SYSTEM_PROMPT + "\n\n" + contextInfo,
        });

        // Build chat history for multi-turn conversation
        const chatHistory = history.map((msg) => ({
            role: msg.role,
            parts: [{ text: msg.parts }],
        }));

        const chat = model.startChat({ history: chatHistory });
        const result = await chat.sendMessage(message);
        const responseText = result.response.text().trim();

        // Strip markdown code fences if Gemini wraps its output
        const cleaned = responseText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

        let parsed;
        try {
            parsed = JSON.parse(cleaned);
        } catch {
            parsed = { action: "message", text: responseText };
        }

        res.json({ response: parsed });
    } catch (error) {
        console.error("[ChatRoute] Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

export default router;
