import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToOne } from "typeorm";
import { Task } from "./Task";
import { User } from "./User";

@Entity()
export class Status {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string;

    @OneToMany(() => Task, (task) => task.status)
    tasks: Task[];

    @ManyToOne(() => User, (user) => user.statuses)
    user: User;
}
