import { describe, it, beforeEach, expect } from "vitest";
import { Collection, Db } from "mongodb";
import { Migrator } from "../src/mongodb-migrations";
import { beforeEach as commonBeforeEach } from "./common";

describe("Migrator", () => {
    let migrator: Migrator;
    let db: Db;
    let coll: Collection;

    beforeEach(async () => {
        ({ migrator, db } = await commonBeforeEach());
        coll = db.collection("test");
        await coll.deleteMany({});
    });

    it("should exist", () => {
        expect(migrator).toBeTruthy();
        expect(db).toBeTruthy();
    });

    it("should set default migrations collection", () => {
        const config1 = {
            host: "localhost",
            port: 27017,
            db: "_mm",
        };
        const m1 = new Migrator(config1, null);
        expect((m1 as any).collName).toBe("_migrations");

        const config2 = {
            host: "localhost",
            port: 27017,
            db: "_mm",
            collection: "_custom",
        };
        const m2 = new Migrator(config2, null);
        expect((m2 as any).collName).toBe("_custom");
    });

    it("should run migrations and return result", async () => {
        migrator.add({
            id: "1",
            up: async () => {
                await coll.insertOne({ name: "tobi" });
            },
        });

        const res = await migrator.migrate();
        expect(res).toBeTruthy();
        expect(res["1"]).toBeTruthy();
        expect(res["1"].status).toBe("ok");

        const count = await coll.countDocuments({ name: "tobi" });
        expect(count).toBe(1);
    });

    it("should run migrations and return error on promise rejection", async () => {
        migrator.add({
            id: "1",
            up: async () => {
                throw new Error("error - promise rejected");
            },
        });

        await expect(migrator.migrate()).rejects.toThrow("error - promise rejected");
    });

    it("should timeout on promise-based migration and return error", async () => {
        migrator.add({
            id: "1",
            up: async () => {
                await new Promise((resolve) => setTimeout(resolve, 300));
            },
        });

        await expect(migrator.migrate()).rejects.toThrow(/timed-out$/);
    });

    it("should allow rollback", async () => {
        migrator.add({
            id: "1",
            up: async () => {
                await coll.insertOne({ name: "tobi" });
            },
            down: async () => {
                await coll.updateOne({ name: "tobi" }, { $set: { name: "loki" } });
            },
        });

        await migrator.migrate();
        await migrator.rollback();

        let count = await coll.countDocuments({ name: "tobi" });
        expect(count).toBe(0);

        count = await coll.countDocuments({ name: "loki" });
        expect(count).toBe(1);
    });

    it("should skip on consequent runs", async () => {
        migrator.add({
            id: "1",
            up: async () => {
                await coll.insertOne({ name: "tobi" });
            },
            down: async () => {
                await coll.updateOne({ name: "tobi" }, { $set: { name: "loki" } });
            },
        });

        let res = await migrator.migrate();
        expect(res["1"]).toBeTruthy();
        expect(res["1"].status).toBe("ok");

        res = await migrator.migrate();
        expect(res["1"]).toBeTruthy();
        expect(res["1"].status).toBe("skip");
    });
});
