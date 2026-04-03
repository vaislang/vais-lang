# Components

VaisX components are `.vaisx` files with three optional sections: `<script>`, `<template>`, and `<style>`.

## Component Structure

```vaisx
<script>
  # Vais logic here
  count := $state(0)

  F increment() {
    count = count + 1
  }
</script>

<template>
  <button on:click={increment}>
    Clicked {count} times
  </button>
</template>

<style>
  button { background: #3b82f6; color: white; }
</style>
```

## Props

Declare props with the `props` keyword. Props are typed using the Vais type system:

```vaisx
<script>
  props {
    name: String
    count: Int = 0
    disabled: Bool = false
  }
</script>

<template>
  <p>Hello, {name}! Count: {count}</p>
</template>
```

Pass props from a parent component:

```vaisx
<template>
  <MyComponent name="VaisX" count={42} />
</template>
```

## Reactive State

Use `$state()` to declare reactive variables. Any change automatically updates the DOM:

```vaisx
<script>
  items := $state([])

  F addItem(text: String) {
    items = [...items, text]
  }
</script>

<template>
  <ul>
    @each(items as item) {
      <li>{item}</li>
    }
  </ul>
</template>
```

## Events

Bind DOM events with the `on:` prefix:

```vaisx
<script>
  F handleClick(event: Event) {
    # handle the event
  }

  F handleInput(event: InputEvent) {
    value := event.target.value
  }
</script>

<template>
  <button on:click={handleClick}>Click me</button>
  <input on:input={handleInput} />
</template>
```

## Slots

Use `{slot}` in a component to accept child content:

```vaisx
<!-- Card.vaisx -->
<template>
  <div class="card">
    <div class="card-body">
      {slot}
    </div>
  </div>
</template>
```

Use named slots for multiple injection points:

```vaisx
<!-- Dialog.vaisx -->
<template>
  <div class="dialog">
    <header>{slot:header}</header>
    <main>{slot}</main>
    <footer>{slot:footer}</footer>
  </div>
</template>
```

Fill named slots from the parent:

```vaisx
<template>
  <Dialog>
    <slot:header>My Dialog</slot:header>
    <p>Dialog body content goes here.</p>
    <slot:footer><button>Close</button></slot:footer>
  </Dialog>
</template>
```

## Server Components

Add `context="server"` to the `<script>` tag to make the component server-only. No JavaScript is sent to the client:

```vaisx
<script context="server">
  data := await fetchData()
</script>

<template>
  <ul>
    @each(data.items as item) {
      <li>{item.title}</li>
    }
  </ul>
</template>
```

## Derived Values

Compute derived state with `:=` — VaisX tracks dependencies automatically:

```vaisx
<script>
  firstName := $state("John")
  lastName := $state("Doe")
  fullName := firstName + " " + lastName
</script>

<template>
  <p>{fullName}</p>
</template>
```
