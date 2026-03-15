import { Router, Response } from "express";
import { AppDataSource } from "../data-sources";
import { Task } from "../database_tables/Task";
import { Status } from "../database_tables/Status";
import { authenticateToken, AuthRequest } from "../middleware/auth";

const router = Router();

// Apply authentication middleware to all task routes
router.use(authenticateToken);

// Get all tasks for the logged in user
router.get("/", async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        const taskRepository = AppDataSource.getRepository(Task);
        const tasks = await taskRepository.find({
            where: { user: { id: userId } },
            relations: ["user", "status"]
        });

        // Remove sensitive user info before sending response
        const sanitizedTasks = tasks.map(task => ({
            ...task,
            user: {
                id: task.user.id,
            }
        }));

        res.json(sanitizedTasks);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// Create a new task for the logged-in user
router.post("/", async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        const { title, description, statusId, statusName, statusColor } = req.body;

        if (!title || (!statusId && !statusName)) {
            res.status(400).json({ message: "Missing required fields" });
            return;
        }

        const taskRepository = AppDataSource.getRepository(Task);
        const statusRepository = AppDataSource.getRepository(Status);
        
        let validStatus;

        if (statusId && typeof statusId === "number") {
            validStatus = await statusRepository.findOne({
                where: { id: statusId, user: { id: userId } }
            });
        } else if (statusName) {
            validStatus = await statusRepository.findOne({
                where: { name: statusName, user: { id: userId } }
            });
            
            if (!validStatus) {
                // Creates a new database entry for the column on-the-fly 
                // ONLY when a task is actually assigned to it
                validStatus = statusRepository.create({
                    name: statusName,
                    user: { id: userId }
                });
                await statusRepository.save(validStatus);
            }
        }

        if (!validStatus) {
            res.status(403).json({ message: "Status not found or doesn't belong to you" });
            return;
        }

        const newTask = taskRepository.create({
            title,
            description,
            status: validStatus,
            user: { id: userId }
        });

        await taskRepository.save(newTask);

        // Return the created task with resolved status
        const sanitizedTask = await taskRepository.findOne({
            where: { id: newTask.id },
            relations: ["user", "status"]
        });

        if (sanitizedTask) {
            res.status(201).json({
                ...sanitizedTask,
                user: {
                    id: sanitizedTask.user.id,
                }
            });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// Update a task only if userid=task.userid
router.put("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        const taskId = parseInt(req.params.id as string, 10);
        const { title, description, statusId, statusName, statusColor } = req.body;

        const taskRepository = AppDataSource.getRepository(Task);
        const statusRepository = AppDataSource.getRepository(Status);

        const task = await taskRepository.findOne({
            where: { id: taskId, user: { id: userId } },
            relations: ["status"]
        });

        if (!task) {
            res.status(404).json({ message: "Task not found or doesn't belong to you" });
            return;
        }

        task.title = title || task.title;
        task.description = description || task.description;

        if (statusId || statusName) {
            let validStatus;

            if (statusId && typeof statusId === "number") {
                validStatus = await statusRepository.findOne({
                    where: { id: statusId, user: { id: userId } }
                });
            } else if (statusName) {
                validStatus = await statusRepository.findOne({
                    where: { name: statusName, user: { id: userId } }
                });
                
                if (!validStatus) {
                    validStatus = statusRepository.create({
                        name: statusName,
                        user: { id: userId }
                    });
                    await statusRepository.save(validStatus);
                }
            }

            if (!validStatus) {
                res.status(403).json({ message: "Status not found or doesn't belong to you" });
                return;
            }
            task.status = validStatus;
        }

        await taskRepository.save(task);

        const updatedTask = await taskRepository.findOne({
            where: { id: taskId },
            relations: ["status"]
        });

        res.json(updatedTask);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// Delete a task only if userid=task.userid
router.delete("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        const taskId = parseInt(req.params.id as string, 10);

        const taskRepository = AppDataSource.getRepository(Task);

        const task = await taskRepository.findOne({
            where: { id: taskId, user: { id: userId } }
        });

        if (!task) {
            res.status(404).json({ message: "Task not found or doesn't belong to you" });
            return;
        }

        await taskRepository.remove(task);
        res.status(204).send();
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
});

export default router;
