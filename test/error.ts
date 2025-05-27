import { describe, it, beforeEach, expect } from "vitest";
import { Collection, Db } from "mongodb";
import { Migrator } from "../src/mongodb-migrations";
import { beforeEach as commonBeforeEach } from "./common";

describe("Migrator Errors Handling", () => {
    let migrator: Migrator;
    let db: Db;
    let coll: Collection;

    beforeEach(async () => {
        ({ migrator, db } = await commonBeforeEach());
        coll = db.collection("test");
        await coll.deleteMany({});
    });

    it("should run migrations and stop on the first error", async () => {
        migrator.add({
            id: "1",
            up: async () => {},
        });

        migrator.add({
            id: "2",
            up: async () => {},
        });

        migrator.add({
            id: "3",
            up: async () => {
                throw new Error("Some error");
            },
        });

        migrator.add({
            id: "4",
            up: async () => {},
        });

        await expect(migrator.migrate()).rejects.toThrow(/Some error$/);

        // The results should still be available on the migrator
        const res = migrator["_result"];
        expect(res).toBeDefined();

        expect(res["1"]).toBeDefined();
        expect(res["1"].status).toBe("ok");

        expect(res["2"]).toBeDefined();
        expect(res["2"].status).toBe("ok");

        expect(res["3"]).toBeDefined();
        expect(res["3"].status).toBe("error");
        expect(res["3"].error!.toString()).toMatch(/Some error$/);

        expect(res["4"]).toBeUndefined();
    });
});
