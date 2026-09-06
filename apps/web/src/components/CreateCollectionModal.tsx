import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { Portal } from "./Portal";

type ConditionField = "tags" | "itemType" | "title" | "createdAt";

type ConditionRow = { field: ConditionField; value: string };

const FIELD_LABELS: Record<ConditionField, string> = {
  tags: "tagged",
  itemType: "type is",
  title: "title contains",
  createdAt: "added in the last (days)",
};

function conditionToApiShape(row: ConditionRow) {
  switch (row.field) {
    case "tags":
      return { field: "tags", op: "contains", value: row.value };
    case "itemType":
      return { field: "itemType", op: "eq", value: row.value };
    case "title":
      return { field: "title", op: "contains", value: row.value };
    case "createdAt":
      return { field: "createdAt", op: "within_last_days", value: Number(row.value) };
  }
}

async function createCollection(body: unknown) {
  const res = await fetch("/api/collections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to create collection: ${res.status}`);
  return res.json();
}

export function CreateCollectionModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"manual" | "smart">("manual");
  const [ruleOp, setRuleOp] = useState<"AND" | "OR">("AND");
  const [conditions, setConditions] = useState<ConditionRow[]>([{ field: "tags", value: "" }]);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: createCollection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      onClose();
    },
  });

  function submit() {
    if (!name.trim()) return;
    if (type === "manual") {
      mutation.mutate({ name, type: "manual" });
      return;
    }
    const validConditions = conditions.filter((c) => c.value.trim() !== "");
    mutation.mutate({
      name,
      type: "smart",
      smartRule: { op: ruleOp, conditions: validConditions.map(conditionToApiShape) },
    });
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
        onClick={onClose}
      >
      <div
        className="w-full max-w-md space-y-4 rounded-lg bg-background p-5 text-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">New Collection</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Collection name"
          className="w-full rounded-md border border-border bg-transparent px-3 py-1.5 text-sm"
        />

        <div className="flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => setType("manual")}
            className={`rounded-md border border-border px-3 py-1 ${type === "manual" ? "bg-primary text-primary-foreground" : ""}`}
          >
            Manual
          </button>
          <button
            type="button"
            onClick={() => setType("smart")}
            className={`rounded-md border border-border px-3 py-1 ${type === "smart" ? "bg-primary text-primary-foreground" : ""}`}
          >
            Smart
          </button>
        </div>

        {type === "smart" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              Match
              <select
                value={ruleOp}
                onChange={(e) => setRuleOp(e.target.value as "AND" | "OR")}
                className="rounded border border-border bg-transparent px-1"
              >
                <option value="AND">all</option>
                <option value="OR">any</option>
              </select>
              of the following:
            </div>

            {conditions.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={row.field}
                  onChange={(e) => {
                    const field = e.target.value as ConditionField;
                    setConditions(conditions.map((c, j) => (j === i ? { field, value: "" } : c)));
                  }}
                  className="rounded border border-border bg-transparent px-1 py-1 text-xs"
                >
                  {Object.entries(FIELD_LABELS).map(([field, label]) => (
                    <option key={field} value={field}>
                      {label}
                    </option>
                  ))}
                </select>
                {row.field === "itemType" ? (
                  <select
                    value={row.value}
                    onChange={(e) =>
                      setConditions(
                        conditions.map((c, j) => (j === i ? { ...c, value: e.target.value } : c))
                      )
                    }
                    className="flex-1 rounded border border-border bg-transparent px-2 py-1 text-xs"
                  >
                    <option value="">select…</option>
                    <option value="video">video</option>
                    <option value="photo">photo</option>
                  </select>
                ) : (
                  <input
                    value={row.value}
                    type={row.field === "createdAt" ? "number" : "text"}
                    onChange={(e) =>
                      setConditions(
                        conditions.map((c, j) => (j === i ? { ...c, value: e.target.value } : c))
                      )
                    }
                    className="flex-1 rounded border border-border bg-transparent px-2 py-1 text-xs"
                  />
                )}
                <button
                  type="button"
                  onClick={() => setConditions(conditions.filter((_, j) => j !== i))}
                  aria-label="Remove condition"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => setConditions([...conditions, { field: "tags", value: "" }])}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-3" /> Add condition
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={mutation.isPending || !name.trim()}
          className="w-full rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
        >
          Create
          </button>
        </div>
      </div>
    </Portal>
  );
}
