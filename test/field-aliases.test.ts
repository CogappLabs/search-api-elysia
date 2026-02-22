import { describe, expect, it } from "bun:test";
import { FieldAliasMap } from "../src/field-aliases.ts";

describe("FieldAliasMap", () => {
  const aliases = new FieldAliasMap({
    country: "placeCountry",
    region: "placeRegion",
    coords: "placeCoordinates",
  });

  describe("toEs / fromEs", () => {
    it("translates alias to ES field name", () => {
      expect(aliases.toEs("country")).toBe("placeCountry");
    });

    it("passes through unknown fields", () => {
      expect(aliases.toEs("title")).toBe("title");
    });

    it("translates ES field name back to alias", () => {
      expect(aliases.fromEs("placeCountry")).toBe("country");
    });

    it("passes through unmapped ES fields", () => {
      expect(aliases.fromEs("title")).toBe("title");
    });
  });

  describe("keysToEs / keysFromEs", () => {
    it("translates record keys to ES field names", () => {
      const result = aliases.keysToEs({ country: "Scotland", title: "test" });
      expect(result).toEqual({ placeCountry: "Scotland", title: "test" });
    });

    it("translates record keys from ES field names", () => {
      const result = aliases.keysFromEs({
        placeCountry: ["a", "b"],
        title: ["c"],
      });
      expect(result).toEqual({ country: ["a", "b"], title: ["c"] });
    });
  });

  describe("arrayToEs / arrayFromEs", () => {
    it("translates field name arrays to ES", () => {
      expect(aliases.arrayToEs(["country", "title"])).toEqual([
        "placeCountry",
        "title",
      ]);
    });

    it("translates field name arrays from ES", () => {
      expect(aliases.arrayFromEs(["placeCountry", "title"])).toEqual([
        "country",
        "title",
      ]);
    });
  });

  describe("passthrough (no aliases)", () => {
    const empty = new FieldAliasMap();

    it("hasAliases is false", () => {
      expect(empty.hasAliases).toBe(false);
    });

    it("returns same reference for keysToEs", () => {
      const record = { foo: "bar" };
      expect(empty.keysToEs(record)).toBe(record);
    });

    it("returns same reference for keysFromEs", () => {
      const record = { foo: "bar" };
      expect(empty.keysFromEs(record)).toBe(record);
    });

    it("returns same reference for arrayToEs", () => {
      const arr = ["foo", "bar"];
      expect(empty.arrayToEs(arr)).toBe(arr);
    });

    it("returns same reference for arrayFromEs", () => {
      const arr = ["foo", "bar"];
      expect(empty.arrayFromEs(arr)).toBe(arr);
    });
  });
});
