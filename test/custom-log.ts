import { describe, it, expect } from "vitest";
import { Migrator } from "../src/mongodb-migrations";
import { config } from "./common";

describe("Migrator Logging", () => {
    it("should allow custom logging", async () => {
        const messages: string[] = [];
        const log = (level: string, message: string): void => {
            if (level === "user") {
                messages.push(message);
            }
        };

        const migrator = new Migrator(config, log);

        migrator.add({
            id: "1",
            up: async function () {
                this.log("1");
                this.log("2");
            },
        });

        const res = await migrator.migrate();
        expect(res["1"]).toBeDefined();
        expect(messages).toHaveLength(2);
        expect(messages[0]).toBe("1");
        expect(messages[1]).toBe("2");
    });
});
