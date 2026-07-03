# @superbuilders/errors

Go-style error handling for TypeScript: errors are **values** you check, not control flow you catch; context is **wrapped on** at every layer, never lost; and the resulting chain is inspected at the call site with `is`/`as`/`cause` — never through static types.

This is a TypeScript port of the error-handling doctrine in [efficientgo/core/errors](https://github.com/efficientgo/core/tree/main/errors) (itself the modern successor to `pkg/errors`), built on the platform's own primitives: ES2022 `Error.cause` is the chain, `Error.captureStackTrace` trims constructor frames, and every function returns a plain `Error`.

```typescript
import * as errors from "@superbuilders/errors"

async function loadUser(userId: string) {
	const response = await errors.try(fetch(`/api/users/${userId}`))
	if (response.error) {
		throw errors.wrap(response.error, "user fetch")
	}

	const body = await errors.try(response.data.json())
	if (body.error) {
		throw errors.wrap(body.error, "user body decode")
	}

	return body.data
}
```

When the fetch fails three layers down, the error that surfaces reads like a story told outermost-first:

```
user fetch: request timeout: socket closed
```

## Install

```
pnpm add @superbuilders/errors
```

ESM only. Requires a runtime with ES2022 `Error.cause` (Node 18+, all evergreen browsers, Bun, Deno).

## The doctrine

Three rules carry the whole library:

1. **Construct with `errors.new`, never `new Error`.** You get chain-aware `toString`, structured `toJSON`, and a stack trace that starts at your call site.
2. **At every boundary where you catch, either handle or wrap.** `errors.wrap(cause, "what this layer was doing")` preserves the entire original — type, stack, chain — and prepends one clause of context. Wrap messages are noun phrases naming the operation (`"user fetch"`, `"config parse"`), not sentences; the chain's `": "` joints do the grammar.
3. **Errors are opaque.** Every constructor returns plain `Error`. Do not encode the chain in types — a generic thread snaps at the first function boundary. When a caller needs to know *what* failed, ask the value: `errors.is` for identity, `errors.as` for class, `errors.cause` for the root.

## API

### `errors.new(message: string): Error`

Creates an error whose stack trace begins at the caller (the constructor frame is trimmed, as in Go). Use for original failures — points where *your* code determines something is wrong.

```typescript
if (rows.length === 0) {
	throw errors.new(`frontend ${frontendId} not found`)
}
```

Do not wrap an error you just created — `errors.new` with a complete message is the whole story at an origin point.

### `errors.wrap(originalError: Error, message: string): Error`

Returns a new error with `originalError` as its `cause` (the standard ES2022 mechanism — `errors.cause(wrapped)` and any tooling that reads `.cause` see the real chain). Use at every layer that catches an error it cannot handle.

```typescript
const parsed = errors.trySync(() => JSON.parse(raw))
if (parsed.error) {
	throw errors.wrap(parsed.error, "manifest parse")
}
```

### `errors.try(promise: Promise<T>): Promise<Result<T>>`

Awaits a promise into a `Result` instead of a throw — the port of Go's multiple-return, and the reason `try/catch` blocks disappear from consuming codebases:

```typescript
type Result<T, E extends Error = Error> =
	| { data: T; error: undefined }
	| { data: undefined; error: E }
```

The union is discriminated: checking `result.error` narrows `result.data` to `T` in the other branch. The canonical shape is always the same three lines:

```typescript
const result = await errors.try(db.query(sql))
if (result.error) {
	throw errors.wrap(result.error, "user lookup")
}
// result.data is T here
```

If the promise rejects with a non-Error value (strings, numbers — the ecosystem's sins), it is converted to an `Error` carrying the value's string form, so `result.error` is always a real `Error`.

The optional `E` parameter (`errors.try<T, DatabaseError>(...)`) is a caller assertion, not a runtime check — the same contract as a Go `errors.As` target. Prefer leaving it defaulted and using `errors.as` on the value.

### `errors.trySync(fn: () => T): Result<T>`

The synchronous twin, for throwing APIs like `JSON.parse`:

```typescript
const url = errors.trySync(() => new URL(raw))
if (url.error) {
	throw errors.wrap(url.error, "endpoint url parse")
}
```

### `errors.cause(error: Error): Error`

Walks the chain to the root: the first error whose `cause` is not itself an `Error`. Returns the error unchanged when there is no chain. (Go's `errors.Cause`.)

```typescript
logger.error({ root: errors.cause(err).message }, "request failed")
```

### `errors.is(err: Error, target: Error): boolean`

Reports whether any error in the chain is **identical** (`===`) to `target`. This enables the sentinel pattern — export a fixed error value, wrap it freely, and detect it anywhere up-stack (Go's `errors.Is` with `ErrNotFound`-style sentinels):

```typescript
export const ErrNotFound = errors.new("not found")

// deep in a data layer
throw errors.wrap(ErrNotFound, `user ${id}`)

// at the API boundary
if (errors.is(result.error, ErrNotFound)) {
	return new Response(null, { status: 404 })
}
```

### `errors.as(err: Error, ErrorClass): U | undefined`

Returns the first error in the chain that is an `instanceof ErrorClass`, or `undefined`. The one place a type parameter genuinely narrows — you get the concrete instance with its fields:

```typescript
const httpError = errors.as(result.error, HttpError)
if (httpError) {
	return new Response(null, { status: httpError.status })
}
```

Works with abstract base classes.

## Serialization

Errors from `new`/`wrap` carry two non-enumerable helpers:

- **`toString()`** renders the full message chain: `"outer: middle: root"`. This is what template literals and `String(err)` produce.
- **`toJSON()`** renders a structured object — `name`, `message`, `stack`, a recursively serialized `cause`, and any enumerable own properties (an `HttpError`'s `status` survives) — so `JSON.stringify` and structured loggers like Pino emit the whole chain without custom serializers.

Both are defined **non-enumerably** (v4): they never appear in `Object.keys`, spreads, or serialized output, and the error object is otherwise a completely ordinary, mutable `Error` that any logger can handle.

## Relationship to the Go original

| efficientgo/core | @superbuilders/errors | Notes |
| --- | --- | --- |
| `errors.New(msg)` | `errors.new(msg)` | both trim the constructor frame from the stack |
| `errors.Wrap(err, msg)` | `errors.wrap(err, msg)` | chain via `Error.cause` instead of `Unwrap()`; `wrap` requires a real `Error` (the type system replaces Go's nil-check) |
| `errors.Newf` / `Wrapf` | — | template literals make format variants pointless |
| `err.Error()` → `"a: b: c"` | `err.toString()` | identical chain rendering |
| `errors.Cause(err)` | `errors.cause(err)` | walk to the root |
| `errors.Is(err, target)` | `errors.is(err, target)` | identity against sentinels |
| `errors.As(err, &target)` | `errors.as(err, Class)` | returns the instance instead of an out-param |
| multiple return `(T, error)` | `errors.try` / `errors.trySync` → `Result<T>` | the piece Go gets from the language and TypeScript needs a library for |

The philosophical inheritance matters more than the signatures: in both libraries every constructor returns the opaque error type, because the chain is a **runtime** structure. Version 4 removed this port's youthful attempt to say otherwise (`WrappedError<C>`, `DeepestCause<E>`, and a pile of overloads) — types that promised static knowledge of a dynamic chain and delivered casts.

## License

[0BSD](./LICENSE) © Bjorn Pagen
