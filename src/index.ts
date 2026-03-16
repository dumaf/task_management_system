import path from "path";
import "dotenv/config";
import "reflect-metadata";
import express from "express";
import cors from "cors";
import { AppDataSource } from "./data-sources";

// Routing to the component routes for better readability
import userRoutes from "./back_routes/userRoutes";
import taskRoutes from "./back_routes/taskRoutes";
import statusRoutes from "./back_routes/statusRoutes";
import chatRoutes from "./back_routes/chatRoutes";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3000", 10);

// In production lock CORS to the deployed frontend origin;
// fall back to wildcard for local development.
const corsOrigin = process.env.FRONTEND_URL ?? "*";
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

// Health-check endpoint — required by AWS ALB / EC2 Auto Scaling
app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
});

AppDataSource.initialize()
    .then(() => {
        app.use("/users", userRoutes);
        app.use("/tasks", taskRoutes);
        app.use("/statuses", statusRoutes);
        app.use("/chat", chatRoutes);

	const frontendPath = path.join(__dirname, "../frontend/dist");
        app.use(express.static(frontendPath));

	app.use((_req, res) => {
  		res.sendFile(path.join(frontendPath, "index.html"));
	});
        console.log("Database connected");
        app.listen(PORT, "0.0.0.0", () => {
            console.log(`Server started on port ${PORT}`);
        });
    })
    .catch((error) => {
        console.error("Failed to connect to database:", error);
        process.exit(1);
    });
