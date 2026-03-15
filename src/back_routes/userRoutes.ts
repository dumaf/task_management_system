import { Router, Request, Response } from "express";
import { AppDataSource } from "../data-sources";
import { User } from "../database_tables/User";
import { Status } from "../database_tables/Status";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET environment variable is not set");

// Hash function - using md5 as anything more is not required at this moment
const hashPassword = (password: string) => {
    return crypto.createHash("md5").update(password).digest("hex");
};


// Registering a new user
router.post("/register", async (req: Request, res: Response): Promise<void> => {
    try {
        const { firstName, lastName, email, password } = req.body;

        if (!email || !password) {
            res.status(400).json({ message: "Email and password are required" });
            return;
        }

        const userRepository = AppDataSource.getRepository(User);

        const existingUser = await userRepository.findOne({ where: { email } });
        if (existingUser) {
            res.status(400).json({ message: "User already exists" });
            return;
        }

        const hashedPassword = hashPassword(password);

        const newUser = userRepository.create({
            firstName,
            lastName,
            email,
            password: hashedPassword
        });

        await userRepository.save(newUser);

        res.status(201).json({ message: "User created successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// Logging in as a preregistered user
router.post("/login", async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password } = req.body;

        const userRepository = AppDataSource.getRepository(User);
        const user = await userRepository.findOne({ where: { email } });

        if (!user) {
            res.status(400).json({ message: "Invalid credentials" });
            return;
        }

        const hashedPassword = hashPassword(password);

        if (user.password !== hashedPassword) {
            res.status(400).json({ message: "Invalid credentials" });
            return;
        }

        const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "1h" });

        res.json({ token });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
});

export default router;
