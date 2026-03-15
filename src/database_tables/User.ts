import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from "typeorm";
import { Task } from "./Task";
import { Status } from "./Status";

@Entity()
export class User {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    firstName: string;

    @Column()
    lastName: string;

    @Column()
    email: string;

    @Column()
    password: string;

    @OneToMany(() => Task, (task) => task.user)
    tasks: Task[];

    @OneToMany(() => Status, (status) => status.user)
    statuses: Status[];
}