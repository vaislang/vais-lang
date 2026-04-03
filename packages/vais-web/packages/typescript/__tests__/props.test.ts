import { describe, it, expect } from "vitest";
import { extractProps, buildPropsMap } from "../src/props.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const INLINE_PROPS_VAISX = `
<script lang="ts">
const props = defineProps<{
  title: string;
  count?: number;
  label?: string;
}>();
</script>
`;

const NAMED_TYPE_VAISX = `
<script lang="ts">
interface ButtonProps {
  text: string;
  disabled?: boolean;
}

const props = defineProps<ButtonProps>();
</script>
`;

const WITH_DEFAULTS_VAISX = `
<script lang="ts">
const props = withDefaults(defineProps<{
  size?: string;
  color?: string;
}>(), {
  size: '"md"',
  color: '"blue"',
});
</script>
`;

const NO_DEFINE_PROPS = `
<script lang="ts">
const x: number = 1;
</script>
`;

const COMPLEX_TYPES_VAISX = `
<script lang="ts">
const props = defineProps<{
  items: string[];
  handler: (event: MouseEvent) => void;
  record: Record<string, number>;
}>();
</script>
`;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("extractProps — inline object type", () => {
  it("detects defineProps with an inline generic object type", () => {
    const result = extractProps(INLINE_PROPS_VAISX);
    expect(result.rawGeneric).toBeTruthy();
    expect(result.props).toHaveLength(3);
  });

  it("marks non-optional props as required", () => {
    const result = extractProps(INLINE_PROPS_VAISX);
    const titleProp = result.props.find((p) => p.name === "title");
    expect(titleProp).toBeDefined();
    expect(titleProp!.required).toBe(true);
  });

  it("marks optional props (?) as not required", () => {
    const result = extractProps(INLINE_PROPS_VAISX);
    const countProp = result.props.find((p) => p.name === "count");
    expect(countProp).toBeDefined();
    expect(countProp!.required).toBe(false);
  });

  it("correctly captures the prop type string", () => {
    const result = extractProps(INLINE_PROPS_VAISX);
    const titleProp = result.props.find((p) => p.name === "title");
    expect(titleProp!.type).toBe("string");
  });
});

describe("extractProps — named type reference", () => {
  it("detects a named interface reference in defineProps<ButtonProps>()", () => {
    const result = extractProps(NAMED_TYPE_VAISX);
    expect(result.referencedType).toBe("ButtonProps");
  });

  it("resolves the interface definition and extracts its props", () => {
    const result = extractProps(NAMED_TYPE_VAISX);
    expect(result.props).toHaveLength(2);
    expect(result.props.map((p) => p.name)).toContain("text");
    expect(result.props.map((p) => p.name)).toContain("disabled");
  });
});

describe("extractProps — withDefaults", () => {
  it("attaches default values to the corresponding props", () => {
    const result = extractProps(WITH_DEFAULTS_VAISX);
    const sizeProp = result.props.find((p) => p.name === "size");
    expect(sizeProp).toBeDefined();
    expect(sizeProp!.default).toBeDefined();
  });
});

describe("extractProps — no defineProps", () => {
  it("returns empty props array when defineProps is absent", () => {
    const result = extractProps(NO_DEFINE_PROPS);
    expect(result.props).toHaveLength(0);
    expect(result.rawGeneric).toBeNull();
  });
});

describe("extractProps — rawTs mode", () => {
  it("works with a bare TypeScript string (rawTs=true)", () => {
    const ts = `
const props = defineProps<{ name: string }>();
    `;
    const result = extractProps(ts, true);
    expect(result.props).toHaveLength(1);
    expect(result.props[0].name).toBe("name");
  });
});

describe("buildPropsMap", () => {
  it("returns a Map keyed by prop name", () => {
    const map = buildPropsMap(INLINE_PROPS_VAISX);
    expect(map.has("title")).toBe(true);
    expect(map.has("count")).toBe(true);
    expect(map.has("label")).toBe(true);
  });

  it("map values contain correct PropDefinition objects", () => {
    const map = buildPropsMap(INLINE_PROPS_VAISX);
    expect(map.get("title")!.required).toBe(true);
    expect(map.get("count")!.required).toBe(false);
  });
});
