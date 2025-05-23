import { describe, it, beforeEach, expect } from "vitest";
import path from "path";
import { Collection, Db } from "mongodb";
import { Migrator } from "../src/mongodb-migrations";
import { beforeEach as commonBeforeEach } from "./common";

describe("Migrator Rollback", () => {
    let migrator: Migrator;
    let db: Db;
    let coll: Collection;

    beforeEach(async () => {
        ({ migrator, db } = await commonBeforeEach());
        coll = db.collection("test");
        await coll.deleteMany({});
    });

    it("should cleanup the migrations collection properly", async () => {
        const dir = path.join(__dirname, "migrations");
        const migrationsCol = db.collection("_migrations");

        await migrator.runFromDir(dir);
        let count = await migrationsCol.countDocuments();
        expect(count).toBe(3);

        await migrator.rollback();
        count = await coll.countDocuments();
        expect(count).toBe(0);

        count = await migrationsCol.countDocuments();
        expect(count).toBe(0);
    });
});
