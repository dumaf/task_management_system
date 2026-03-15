import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from "typeorm";
import { User } from "./User";
import { Status } from "./Status";

@Entity()
export class Task {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    title: string;

    @Column()
    description: string;

    @ManyToOne(() => Status, (status) => status.tasks)
    status: Status;

    @ManyToOne(() => User, (user) => user.tasks)
    user: User;
}