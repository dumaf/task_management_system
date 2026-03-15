import { Router, Response } from "express";
import { AppDataSource } from "../data-sources";
import { Status } from "../database_tables/Status";
import { authenticateToken, AuthRequest } from "../middleware/auth";

const router = Router();

// Apply authentication middleware to all status routes
router.use(authenticateToken);

// Get all statuses for the logged in user
router.get("/", async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        const statusRepository = AppDataSource.getRepository(Status);
        const statuses = await statusRepository.find({
            where: { user: { id: userId } },
            relations: ["user", "tasks"]
        });

        // Remove sensitive user info
        const sanitizedStatuses = statuses.map(status => ({
            ...status,
            user: { id: status.user.id }
        }));

        res.json(sanitizedStatuses);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// Create a new status for the logged-in user
router.post("/", async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        const { name } = req.body;

        if (!name) {
            res.status(400).json({ message: "Missing required field: name" });
            return;
        }

        const statusRepository = AppDataSource.getRepository(Status);

        // Avoid creating duplicate statuses for the same user
        let existingStatus = await statusRepository.findOne({
            where: { name, user: { id: userId } }
        });

        if (existingStatus) {
            // Return existing status instead of creating a duplicate
            res.status(200).json({
                ...existingStatus,
                user: { id: existingStatus.user.id }
            });
            return;
        }

        const newStatus = statusRepository.create({
            name,
            user: { id: userId } // Relate to User
        });

        await statusRepository.save(newStatus);

        const savedStatus = await statusRepository.findOne({
            where: { id: newStatus.id },
            relations: ["user"]
        });

        if (savedStatus) {
            res.status(201).json({
                ...savedStatus,
                user: { id: savedStatus.user.id }
            });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// Update a status
router.put("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        const statusId = parseInt(req.params.id as string, 10);
        const { name } = req.body;

        const statusRepository = AppDataSource.getRepository(Status);

        const status = await statusRepository.findOne({
            where: { id: statusId, user: { id: userId } }
        });

        if (!status) {
            res.status(404).json({ message: "Status not found or doesn't belong to you" });
            return;
        }

        status.name = name || status.name;

        await statusRepository.save(status);

        res.json(status);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// Delete a status
router.delete("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        const statusId = parseInt(req.params.id as string, 10);

        const statusRepository = AppDataSource.getRepository(Status);

        const status = await statusRepository.findOne({
            where: { id: statusId, user: { id: userId } }
        });

        if (!status) {
            res.status(404).json({ message: "Status not found or doesn't belong to you" });
            return;
        }

        if (status.tasks && status.tasks.length > 0) {
            // Prevent deleting statuses that still have tasks assigned to them.
            res.status(400).json({ message: "Cannot delete status while tasks are assigned to it" });
            return;
        }

        await statusRepository.remove(status);
        res.status(204).send();
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
});

export default router;
