import { describe, it, beforeEach, expect } from "vitest";
import path from "path";
import { Collection, Db } from "mongodb";
import { Migrator } from "../src/mongodb-migrations";
import { beforeEach as commonBeforeEach } from "./common";

describe("Migrator from Directory", () => {
    let migrator: Migrator;
    let db: Db;
    let coll: Collection;

    beforeEach(async () => {
        ({ migrator, db } = await commonBeforeEach());
        coll = db.collection("test");
        await coll.deleteMany({});
    });

    it("should run migrations from directory", async () => {
        const dir = path.join(__dirname, "migrations");
        const res = await migrator.runFromDir(dir);

        let count = await coll.countDocuments({ name: "tobi" });
        expect(count).toBe(1);

        count = await coll.countDocuments({ name: "loki" });
        expect(count).toBe(1);

        count = await coll.countDocuments({ ok: 1 });
        expect(count).toBe(2);

        await migrator.rollback();
        count = await coll.countDocuments();
        expect(count).toBe(0);
    });
});
