import { describe, it, beforeEach, expect } from "vitest";
import path from "path";
import fs from "fs";
import { rimraf } from "rimraf";
import { Migrator } from "../src/mongodb-migrations";
import { beforeEach as commonBeforeEach } from "./common";

describe("Migrations Builder", () => {
    let migrator: Migrator;
    const dir = path.join(__dirname, "created-migrations");

    beforeEach(async () => {
        ({ migrator } = await commonBeforeEach());
        await rimraf(dir);
    });

    it("should create migration stubs for JS", () => {
        migrator.create(dir, "test1");
        expect(fs.existsSync(path.join(dir, "1-test1.js"))).toBe(true);

        migrator.create(dir, "test2");
        expect(fs.existsSync(path.join(dir, "2-test2.js"))).toBe(true);
    });
});
