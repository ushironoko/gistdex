import { describe, expect, it, jest } from "bun:test";
import { createBatchOperations } from "./common-operations.js";

describe("createBatchOperations", () => {
  describe("insertBatch", () => {
    it("should insert multiple items sequentially", async () => {
      const insertFn = jest
        .fn()
        .mockImplementation((item: { name: string }) =>
          Promise.resolve(`id-${item.name}`),
        );

      const batchOps = createBatchOperations();
      const items = [{ name: "item1" }, { name: "item2" }, { name: "item3" }];

      const ids = await batchOps.insertBatch(items, insertFn);

      expect(ids).toEqual(["id-item1", "id-item2", "id-item3"]);
      expect(insertFn).toHaveBeenCalledTimes(3);
      expect(insertFn).toHaveBeenNthCalledWith(1, { name: "item1" });
      expect(insertFn).toHaveBeenNthCalledWith(2, { name: "item2" });
      expect(insertFn).toHaveBeenNthCalledWith(3, { name: "item3" });
    });

    it("should handle empty array", async () => {
      const insertFn = jest.fn();
      const batchOps = createBatchOperations();

      const ids = await batchOps.insertBatch([], insertFn);

      expect(ids).toEqual([]);
      expect(insertFn).not.toHaveBeenCalled();
    });

    it("should propagate errors from insert function", async () => {
      const insertFn = jest
        .fn()
        .mockResolvedValueOnce("id-1")
        .mockRejectedValueOnce(new Error("Insert failed"));

      const batchOps = createBatchOperations();
      const items = [{ name: "item1" }, { name: "item2" }];

      await expect(batchOps.insertBatch(items, insertFn)).rejects.toThrow(
        "Insert failed",
      );
      expect(insertFn).toHaveBeenCalledTimes(2);
    });
  });

  describe("deleteBatch", () => {
    it("should delete multiple items sequentially", async () => {
      const deleteFn = jest.fn().mockResolvedValue(undefined);

      const batchOps = createBatchOperations();
      const ids = ["id-1", "id-2", "id-3"];

      await batchOps.deleteBatch(ids, deleteFn);

      expect(deleteFn).toHaveBeenCalledTimes(3);
      expect(deleteFn).toHaveBeenNthCalledWith(1, "id-1");
      expect(deleteFn).toHaveBeenNthCalledWith(2, "id-2");
      expect(deleteFn).toHaveBeenNthCalledWith(3, "id-3");
    });

    it("should handle empty array", async () => {
      const deleteFn = jest.fn();
      const batchOps = createBatchOperations();

      await batchOps.deleteBatch([], deleteFn);

      expect(deleteFn).not.toHaveBeenCalled();
    });

    it("should propagate errors from delete function", async () => {
      const deleteFn = jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("Delete failed"));

      const batchOps = createBatchOperations();
      const ids = ["id-1", "id-2"];

      await expect(batchOps.deleteBatch(ids, deleteFn)).rejects.toThrow(
        "Delete failed",
      );
      expect(deleteFn).toHaveBeenCalledTimes(2);
    });
  });
});
