import "reflect-metadata";
import { DataSource } from "typeorm";
import { User } from "./database_tables/User";
import { Task } from "./database_tables/Task";
import { Status } from "./database_tables/Status";

// When DB_SSL=true (e.g. Amazon RDS), connect over SSL.
// Set DB_SSL_REJECT_UNAUTHORIZED=false only if using RDS default certs
// without a custom CA bundle — safe for most setups.
const useSSL = process.env.DB_SSL === "true";

export const AppDataSource = new DataSource({
    type: "postgres",

    host: process.env.DB_HOST ?? "localhost",
    port: parseInt(process.env.DB_PORT ?? "5432", 10),
    username: process.env.DB_USERNAME ?? "postgres",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_DATABASE ?? "task_manager",

    ssl: useSSL
        ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false" }
        : false,

    synchronize: true,

    logging: false,

    entities: [User, Task, Status],
    migrations: [],
    subscribers: [],
});