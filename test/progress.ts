import { describe, it, expect, beforeEach } from "vitest";
import { Migrator } from "../src/mongodb-migrations";
import { beforeEach as commonBeforeEach, config } from "./common";
import { LogLevel } from "../src/mongodb-migrations";

describe("Migrator Progress Reporting", () => {
    let migrator: Migrator;

    beforeEach(async () => {
        await commonBeforeEach();
    });

    it("should call back the progress parameter", async () => {
        const messages: string[] = [];
        const log = (level: LogLevel, message: string): void => {
            if (level === "user") {
                messages.push(message);
            }
        };

        const progressResults: string[] = [];
        const progressFunc = (migrationId, migrationRes) => {
            const status = migrationRes?.status;
            if (status !== "ok") {
                throw new Error(`Error running ${migrationId}, result is ${status}`);
            }
            progressResults.push(migrationId);
        };

        const migrator = new Migrator(config, log);

        migrator.add({
            id: "1",
            up: async function () {
                this.log("1");
            },
        });

        migrator.add({
            id: "2",
            up: async function () {
                this.log("2");
            },
        });

        await migrator.migrate(progressFunc);

        expect(messages).toHaveLength(2);
        expect(progressResults).toHaveLength(2);
    });
});
