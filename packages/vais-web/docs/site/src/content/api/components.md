# @vaisx/components

Tree-shakeable UI primitives for VaisX applications. Each component ships as
a `.vaisx` single-file component and exposes a typed `Props` interface.

## Installation

```bash
pnpm add @vaisx/components
```

---

## Button

### `ButtonProps`

```typescript
interface ButtonProps {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
}
```

| Property | Type | Default | Description |
|---|---|---|---|
| `variant` | `"primary" \| "secondary" \| "ghost"` | `"primary"` | Visual style variant |
| `size` | `"sm" \| "md" \| "lg"` | `"md"` | Button size |
| `disabled` | `boolean` | `false` | Disables interaction and applies disabled styling |
| `type` | `"button" \| "submit" \| "reset"` | `"button"` | HTML button type |

**Example**

```typescript
// In a .vaisx file
<Button variant="primary" size="md" type="submit">
  Save changes
</Button>

<Button variant="ghost" size="sm" disabled>
  Not available
</Button>
```

---

## Input

### `InputProps`

```typescript
interface InputProps {
  type?: "text" | "email" | "password" | "number";
  placeholder?: string;
  value?: string;
  disabled?: boolean;
  name?: string;
}
```

| Property | Type | Default | Description |
|---|---|---|---|
| `type` | `"text" \| "email" \| "password" \| "number"` | `"text"` | Input field type |
| `placeholder` | `string` (optional) | — | Placeholder text |
| `value` | `string` (optional) | — | Controlled value |
| `disabled` | `boolean` | `false` | Disables the input |
| `name` | `string` (optional) | — | Form field name for `FormData` |

**Example**

```typescript
// In a .vaisx file
<Input
  type="email"
  name="email"
  placeholder="you@example.com"
  value={emailSignal()}
/>
```

---

## Link

### `LinkProps`

```typescript
interface LinkProps {
  href: string;
  target?: "_self" | "_blank";
  prefetch?: boolean;
}
```

| Property | Type | Default | Description |
|---|---|---|---|
| `href` | `string` | — | **Required.** Destination URL |
| `target` | `"_self" \| "_blank"` | `"_self"` | Navigation target |
| `prefetch` | `boolean` | `false` | Prefetch the linked route on hover |

**Example**

```typescript
// In a .vaisx file
<Link href="/blog/hello-world" prefetch>
  Read the post
</Link>

<Link href="https://example.com" target="_blank">
  External link
</Link>
```

---

## Head

### `HeadProps`

```typescript
interface HeadProps {
  title?: string;
  description?: string;
  og?: {
    title?: string;
    description?: string;
    image?: string;
  };
}
```

Manages `<head>` metadata for a page. Can be used inside any page or layout
component.

| Property | Type | Description |
|---|---|---|
| `title` | `string` (optional) | Page `<title>` |
| `description` | `string` (optional) | `<meta name="description">` |
| `og.title` | `string` (optional) | Open Graph title |
| `og.description` | `string` (optional) | Open Graph description |
| `og.image` | `string` (optional) | Open Graph image URL |

**Example**

```typescript
// In a .vaisx file
<Head
  title="My Blog Post"
  description="A short description of my post."
  og={{ title: "My Blog Post", image: "/og/blog-post.png" }}
/>
```

---

## Modal

### `ModalProps`

```typescript
interface ModalProps {
  open: boolean;
  onClose?: () => void;
}
```

A dialog overlay. Controls its own visibility through the `open` prop.

| Property | Type | Description |
|---|---|---|
| `open` | `boolean` | **Required.** Whether the modal is visible |
| `onClose` | `() => void` (optional) | Called when the user requests to close the modal (backdrop click, Escape key) |

**Example**

```typescript
import { createSignal } from "@vaisx/runtime";

// In a .vaisx file
const isOpen = createSignal(false);

<Button onClick={() => isOpen.set(true)}>Open</Button>

<Modal open={isOpen()} onClose={() => isOpen.set(false)}>
  <p>Modal content goes here.</p>
</Modal>
```

---

## Dropdown

### `DropdownOption`

```typescript
interface DropdownOption {
  label: string;
  value: string;
}
```

A single option in a `Dropdown`.

| Property | Type | Description |
|---|---|---|
| `label` | `string` | Display text |
| `value` | `string` | Internal value passed to `onChange` |

### `DropdownProps`

```typescript
interface DropdownProps {
  options: DropdownOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
}
```

| Property | Type | Description |
|---|---|---|
| `options` | `DropdownOption[]` | **Required.** List of selectable options |
| `value` | `string` (optional) | Currently selected value |
| `onChange` | `(value: string) => void` (optional) | Called with the new value on selection |
| `placeholder` | `string` (optional) | Text shown when no value is selected |

**Example**

```typescript
import { createSignal } from "@vaisx/runtime";

// In a .vaisx file
const color = createSignal("");

<Dropdown
  options={[
    { label: "Red", value: "red" },
    { label: "Green", value: "green" },
    { label: "Blue", value: "blue" },
  ]}
  value={color()}
  onChange={(v) => color.set(v)}
  placeholder="Pick a color"
/>
```

---

## Table

### `TableColumn`

```typescript
interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
}
```

Defines one column in a `Table`.

| Property | Type | Description |
|---|---|---|
| `key` | `string` | Property key in each row data object |
| `label` | `string` | Column header text |
| `sortable` | `boolean` (optional) | Enables click-to-sort on this column |

### `TableProps`

```typescript
interface TableProps {
  columns: TableColumn[];
  data: Record<string, unknown>[];
  sortable?: boolean;
}
```

| Property | Type | Description |
|---|---|---|
| `columns` | `TableColumn[]` | **Required.** Column definitions |
| `data` | `Record<string, unknown>[]` | **Required.** Row data objects |
| `sortable` | `boolean` (optional) | Enable sorting on all sortable columns |

**Example**

```typescript
// In a .vaisx file
<Table
  columns={[
    { key: "name", label: "Name", sortable: true },
    { key: "email", label: "Email" },
    { key: "role", label: "Role" },
  ]}
  data={users}
  sortable
/>
```

---

## Toast

### `ToastProps`

```typescript
interface ToastProps {
  message: string;
  type?: "success" | "error" | "warning" | "info";
  duration?: number;
  onDismiss?: () => void;
}
```

A transient notification message.

| Property | Type | Default | Description |
|---|---|---|---|
| `message` | `string` | — | **Required.** Notification text |
| `type` | `"success" \| "error" \| "warning" \| "info"` | `"info"` | Visual style variant |
| `duration` | `number` (optional) | — | Auto-dismiss delay in milliseconds |
| `onDismiss` | `() => void` (optional) | — | Called when the toast is dismissed (auto or manual) |

**Example**

```typescript
import { createSignal } from "@vaisx/runtime";

// In a .vaisx file
const showToast = createSignal(false);

{showToast() && (
  <Toast
    message="Saved successfully!"
    type="success"
    duration={3000}
    onDismiss={() => showToast.set(false)}
  />
)}
```
