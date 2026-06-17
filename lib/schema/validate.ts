/**
 * Runtime JSON-LD validation. schema-dts gives us compile-time types when we
 * BUILD schema, but a draft's schema can be hand-edited in the editor, so we
 * re-validate the actual object at runtime before it's ever exported.
 *
 * "Invalid JSON-LD is worse than none" — we check the required properties per
 * @type and never present unvalidated schema as valid. PURE → eval-tested.
 */

export type SchemaValidation = { valid: boolean; errors: string[] };

const RECOGNIZED_TYPES = [
  "Person",
  "Organization",
  "LocalBusiness",
  "Product",
  "Article",
  "BlogPosting",
  "WebSite",
  "FAQPage",
  "QAPage",
  "Question",
  "Answer",
];

function typesOf(node: Record<string, unknown>): string[] {
  const t = node["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  return [];
}

function nonEmptyString(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

/** Validate a single node by its @type. Pushes human-readable errors. */
function validateNode(node: unknown, errors: string[], path: string): void {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    errors.push(`${path}: expected an object.`);
    return;
  }
  const obj = node as Record<string, unknown>;
  const types = typesOf(obj);
  if (types.length === 0) {
    errors.push(`${path}: missing @type.`);
    return;
  }

  for (const type of types) {
    switch (type) {
      case "Person":
      case "Organization":
      case "LocalBusiness":
      case "Product":
        if (!nonEmptyString(obj.name)) errors.push(`${path} (${type}): requires a non-empty "name".`);
        break;
      case "Article":
      case "BlogPosting":
        if (!nonEmptyString(obj.headline) && !nonEmptyString(obj.name))
          errors.push(`${path} (${type}): requires a "headline".`);
        break;
      case "WebSite":
        if (!nonEmptyString(obj.url) && !nonEmptyString(obj.name))
          errors.push(`${path} (${type}): requires a "url" or "name".`);
        break;
      case "FAQPage":
      case "QAPage": {
        const main = obj.mainEntity;
        const list = Array.isArray(main) ? main : main ? [main] : [];
        if (list.length === 0) {
          errors.push(`${path} (${type}): requires at least one Question in "mainEntity".`);
        } else {
          list.forEach((q, i) => validateNode(q, errors, `${path}.mainEntity[${i}]`));
        }
        break;
      }
      case "Question": {
        if (!nonEmptyString(obj.name)) errors.push(`${path} (Question): requires a "name" (the question).`);
        const ans = obj.acceptedAnswer;
        if (!ans) errors.push(`${path} (Question): requires an "acceptedAnswer".`);
        else validateNode(ans, errors, `${path}.acceptedAnswer`);
        break;
      }
      case "Answer":
        if (!nonEmptyString(obj.text)) errors.push(`${path} (Answer): requires non-empty "text".`);
        break;
      default:
        if (!RECOGNIZED_TYPES.includes(type)) {
          // Unknown types aren't fatal (schema.org is open), but flag so the UI can warn.
          errors.push(`${path}: unrecognized @type "${type}".`);
        }
    }
  }
}

/**
 * Validate a JSON-LD object (single node or a `@graph`). Returns valid=false
 * with specific errors when any required field is missing — never silently OK.
 */
export function validateJsonLd(jsonLd: unknown): SchemaValidation {
  const errors: string[] = [];
  if (!jsonLd || typeof jsonLd !== "object") {
    return { valid: false, errors: ["Schema is empty or not an object."] };
  }
  const root = jsonLd as Record<string, unknown>;
  if ("@graph" in root) {
    // An object carrying @graph is a graph wrapper — it MUST be an array, else
    // the payload would slip through unvalidated.
    const graph = root["@graph"];
    if (!Array.isArray(graph)) {
      errors.push("@graph must be an array.");
    } else if (graph.length === 0) {
      errors.push("@graph is empty.");
    } else {
      graph.forEach((node, i) => validateNode(node, errors, `@graph[${i}]`));
    }
  } else {
    validateNode(root, errors, "root");
  }
  return { valid: errors.length === 0, errors };
}
