# The last error handling library you'll need

```typescript
import * as errors from '@superbuilders/errors';

// 🚫 Instead of this:
async function oldFetchAndProcess(userId: string) {
  try {
    const response = await fetch(`/api/users/${userId}`);
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }
    const user = await response.json();
    const processedData = await processData(user);
    return processedData;
  } catch (error: any) {
    // Context can be lost or manually (and verbosely) reconstructed
    console.error(`Operation failed for user ${userId}: ${error.message}`);
    // Re-throwing often loses the original error type and stack
    throw new Error(`User data processing chain failed: ${error.message}`);
  }
}

// ✅ Do this with @superbuilders/errors:
async function newFetchAndProcess(userId: string) {
  const responseResult = await errors.try(fetch(`/api/users/${userId}`));
  if (responseResult.error) {
    // Preserves original error, adds specific context
    throw errors.wrap(responseResult.error, `API request for user ${responseResult.error.value}`);
  }

  if (!responseResult.data.ok) {
    // Create a new, specific error
    throw errors.new(`API request failed with status ${responseResult.data.status}`);
  }

  const userResult = await errors.try(responseResult.data.json());
  if (userResult.error) {
    throw errors.wrap(userResult.error, `parsing user JSON for ${userId}`);
  }

  const processedResult = await errors.try(processData(userResult.data));
  if (processedResult.error) {
    throw errors.wrap(processedResult.error, `processing data for user ${userId}`);
  }

  return processedResult.data; // Safely access data
}
```

**Key Benefits:**
- 🎯 **Type-Safe Results**: `result.data` and `result.error` are properly typed and discriminated.
- 🔗 **Rich Error Context**: Errors accumulate context (e.g., `"processing data for user admin: parsing user JSON for admin: API returned invalid JSON"`).
- Go **Go-Inspired Simplicity**: Handle errors with a clear `if (result.error)` check, similar to Go's `if err != nil`.
- 🧹 **Cleaner Code**: Decouples the happy path from error handling logic.
- 🚫 **Eliminate `try/catch`**: Adopt a more robust and consistent error handling pattern across your codebase.

---

## Installation

```bash
npm install @superbuilders/errors
# or
yarn add @superbuilders/errors
# or
pnpm add @superbuilders/errors
# or
bun add @superbuilders/errors
```

## Core Philosophy: Never Use `try/catch` Again

This library is designed as a **complete replacement** for `try/catch` blocks. Once you adopt `@superbuilders/errors`, you should aim to eliminate `try/catch` from your application logic.

The fundamental pattern is:
1. Perform an operation using `errors.try()` (for async) or `errors.trySync()` (for sync).
2. Immediately check the `error` property of the result.
3. If an error exists, handle it (often by `throw errors.wrap(result.error, "context")` or `throw errors.new("new error")`).
4. If no error, proceed with `result.data`.

```typescript
import * as errors from '@superbuilders/errors';

// Example of the core pattern
async function fetchImportantData(id: string) {
  const result = await errors.try(someAsyncOperation(id));

  // CRITICAL: Check for error immediately
  if (result.error) {
    // Add context and propagate
    throw errors.wrap(result.error, `fetching important data for id ${id}`);
  }

  // If we're here, result.data is available and typed
  console.log("Success:", result.data);
  return result.data;
}
```

## API Reference

### `errors.try<T, E extends Error = Error>(promise: Promise<T>): Promise<Result<T, E>>`
Replaces `async try/catch` blocks. Wraps a `Promise` and returns a `Result` object.

- **`Result<T, E>`**: `{ data: T, error: undefined } | { data: undefined, error: E }`

```typescript
// ❌ Before:
async function fetchDataOld(url: string) {
  try {
    const response = await fetch(url);
    return await response.json();
  } catch (error) {
    console.error("Fetch failed:", error);
    throw error; // Or wrap manually: new Error(`Failed: ${error.message}`)
  }
}

// ✅ After:
async function fetchDataNew(url: string) {
  const responseResult = await errors.try(fetch(url));
  if (responseResult.error) {
    throw errors.wrap(responseResult.error, `network request to ${url}`);
  }

  const jsonResult = await errors.try(responseResult.data.json());
  if (jsonResult.error) {
    throw errors.wrap(jsonResult.error, `parsing JSON from ${url}`);
  }
  return jsonResult.data;
}
```
**Important**: Always check `result.error` immediately after the `errors.try` call.

### `errors.trySync<T, E extends Error = Error>(fn: () => T): Result<T, E>`
Replaces synchronous `try/catch` blocks. Wraps a function call and returns a `Result` object.

```typescript
// ❌ Before:
function parseJSONOld(jsonString: string) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    throw new Error(`JSON parsing failed: ${error.message}`);
  }
}

// ✅ After:
function parseJSONNew(jsonString: string) {
  const result = errors.trySync(() => JSON.parse(jsonString));
  if (result.error) {
    throw errors.wrap(result.error, "JSON parsing");
  }
  return result.data;
}
```

### `errors.new(message: string): Readonly<Error>`
Replaces `new Error()`. Creates a new, immutable error object.
- Always use this for creating your own application-specific errors.
- Ensures proper stack trace and compatibility with the chaining mechanism.

```typescript
// ❌ Before:
if (!isValid) throw new Error("Invalid input provided.");

// ✅ After:
if (!isValid) throw errors.new("invalid input provided");
```

### `errors.wrap<E extends Error>(originalError: E, message: string): Readonly<WrappedError<E>>`
Adds context to an existing error while preserving the original error and its stack trace. This is key to building informative error chains.
- **Use `errors.wrap` primarily for errors originating from `errors.try`, `errors.trySync`, or external libraries.**
- Do NOT wrap errors you created with `errors.new()`. Just throw the `errors.new()` error directly or create a new one with more context.

```typescript
// dbCall() might throw an error from a database driver
const result = await errors.try(dbCall());
if (result.error) {
  // ✅ CORRECT: Wrapping an external/caught error
  throw errors.wrap(result.error, "database operation failed");
}

// ❌ AVOID: Wrapping an error you just created
// const myError = errors.new("something specific went wrong");
// throw errors.wrap(myError, "operation failed"); // Redundant, just make the first message better

// ✅ BETTER for self-created errors:
if (condition) {
    throw errors.new("operation failed: something specific went wrong");
}
```
**Message Style**: Use lowercase, terse, context-focused descriptions (Go style).
   - Good: `"user authentication"`, `"database connection"`, `"reading file /path/to/file"`
   - Avoid: `"An error occurred while trying to authenticate the user."` (too verbose)

### `errors.cause<T extends Error>(error: WrappedError<T>): DeepestCause<T>`
Finds the root cause in an error chain. Traverses the `.cause` properties.

```typescript
const dbErr = errors.new("connection timeout");
const serviceErr = errors.wrap(dbErr, "user service query");
const apiErr = errors.wrap(serviceErr, "GET /api/users");

const rootCause = errors.cause(apiErr);
console.log(rootCause.message); // "connection timeout"
// Type of rootCause can be inferred if the chain is typed
```

### `errors.is<T extends Error, U extends Error>(error: T, target: U): boolean`
Checks if a specific error instance exists anywhere in the error chain. Compares by reference (`===`).

```typescript
const ErrTimeout = errors.new("request timed out"); // Create a sentinel error

async function operationWithRetry() {
  const result = await errors.try(apiCall());
  if (result.error) {
    if (errors.is(result.error, ErrTimeout)) {
      // Specific retry logic for timeouts
      console.log("Operation timed out, retrying...");
      // ... retry logic ...
    }
    throw errors.wrap(result.error, "apiCall");
  }
  return result.data;
}
```

### `errors.as<T extends Error, U extends Error>(error: T, ErrorClass: new (...args: any[]) => U): U | undefined`
Checks if an error in the chain is an instance of a specific error class and returns it, allowing type-safe access to custom error properties.

```typescript
class NetworkError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = "NetworkError";
  }
}

function handleApiError(err: Error) {
  const networkErr = errors.as(err, NetworkError);
  if (networkErr) {
    console.log(`Network error with status: ${networkErr.statusCode}`);
    if (networkErr.statusCode === 503) {
      // schedule retry
    }
    return;
  }
  // Handle other errors or re-throw
  throw err;
}

// Usage:
const apiResult = await errors.try(fetchFromApi());
if (apiResult.error) {
  handleApiError(apiResult.error);
}
```

## The Power of Chained Context
With proper use of `errors.wrap`, your error messages become incredibly informative:

Imagine an error occurs deep within a series of calls:
- `fs.readFile` fails with `ENOENT: no such file or directory`.

Without `@superbuilders/errors`, you might just see:
`Error: ENOENT: no such file or directory`
*(Where? Why was it being read?)*

With `@superbuilders/errors`:
```
Error: processing user config: reading user settings file: /home/user/.myapp/settings.json: ENOENT: no such file or directory
```
This tells you the full story:
1. The overall operation was `"processing user config"`.
2. Which involved `"reading user settings file"`.
3. Specifically the file `"/home/user/.myapp/settings.json"`.
4. And the root cause was `ENOENT: no such file or directory`.

This drastically reduces debugging time.

## TypeScript Advantages
`@superbuilders/errors` is written in TypeScript and provides strong type safety:

- **Discriminated Unions for `Result`**:
  ```typescript
  const result = await errors.try(fetchUserData());
  if (result.error) {
    // result.data is undefined here, TypeScript knows!
    // result.error is typed (Error by default, or specify E in errors.try<T,E>)
    handleError(result.error);
  } else {
    // result.error is undefined here, TypeScript knows!
    // result.data is typed (T)
    processUserData(result.data);
  }
  ```
- **`WrappedError<C>` and `DeepestCause<E>` Types**: Exported types `WrappedError` and `DeepestCause` allow you to precisely type your error chains and their root causes if needed.
- **Type Inference**: TypeScript often infers the types correctly, reducing boilerplate.

## Real-World Examples

### API Operations with Fallbacks
```typescript
async function getUserPreferred(id: string) {
  const primaryResult = await errors.try(primaryApi.getUser(id));
  if (!primaryResult.error) return primaryResult.data;
  console.warn(`Primary API failed for user ${id}: ${primaryResult.error.toString()}`);

  const backupResult = await errors.try(backupApi.getUser(id));
  if (!backupResult.error) return backupResult.data;
  console.warn(`Backup API failed for user ${id}: ${backupResult.error.toString()}`);
  
  throw errors.wrap(backupResult.error, `all user sources failed for ${id}`);
}
```

### Database Transactions
```typescript
async function updateUserBalance(userId: string, amount: number) {
  const tx = await db.beginTransaction(); // Assume this can't fail or has its own error system

  const currentBalanceResult = await errors.try(tx.query("SELECT balance FROM users WHERE id = ?", [userId]));
  if (currentBalanceResult.error) {
    await errors.try(tx.rollback()); // Log rollback error if it occurs
    throw errors.wrap(currentBalanceResult.error, `fetching balance for user ${userId}`);
  }

  const newBalance = currentBalanceResult.data[0].balance + amount;
  const updateResult = await errors.try(tx.query("UPDATE users SET balance = ? WHERE id = ?", [newBalance, userId]));
  if (updateResult.error) {
    await errors.try(tx.rollback());
    throw errors.wrap(updateResult.error, `updating balance for user ${userId}`);
  }

  const commitResult = await errors.try(tx.commit());
  if (commitResult.error) {
    // Data might be in an inconsistent state or commit failed after successful ops
    throw errors.wrap(commitResult.error, `committing transaction for user ${userId}`);
  }
  return { newBalance };
}
```

## Best Practices
1.  **Immediate Error Checking**: Always check `result.error` on the line(s) immediately following an `errors.try` or `errors.trySync` call. Don't intersperse other logic.
    ```typescript
    // ✅ CORRECT
    const result = await errors.try(operation());
    if (result.error) { /* handle or throw */ }

    // ❌ AVOID
    const result = await errors.try(operation());
    // ... other logic ...
    if (result.error) { /* handle or throw */ }
    ```
2.  **Propagate or Handle Deliberately**: If an error occurs, either wrap it and re-throw it to a higher-level handler, or handle it specifically at the current level. Don't just `console.error` and continue as if nothing happened (unless that's truly the desired behavior for minor, recoverable issues).
3.  **Use `errors.new` for Your Errors**: When you detect an error condition in your own logic (e.g., invalid input, failed business rule), create errors with `errors.new("descriptive message")`.
4.  **Use `errors.wrap` for External/Caught Errors**: When an error comes from an external library, a native function, or is caught by `errors.try`/`errors.trySync`, use `errors.wrap(err, "context")` to add your application's context.
5.  **Terse, Lowercase Context Messages**: When wrapping, keep context messages concise, lowercase, and focused on *what* your code was trying to do. E.g., `"authenticating user"`, `"reading config file"`.
6.  **Leverage `errors.as` for Custom Error Types**: If you have custom error classes with specific properties, use `errors.as(err, MyCustomError)` to safely access those properties.

## Migration Guide

Refactoring an existing codebase to use `@superbuilders/errors` involves two main steps:

### 1. Replace `try/catch` blocks:

**Before (Async):**
```typescript
async function oldAsyncFunction() {
  try {
    const data = await somePromise();
    const processed = await anotherPromise(data);
    return processed;
  } catch (error) {
    throw new Error(`Async operation failed: ${error.message}`);
  }
}
```
**After (Async):**
```typescript
async function newAsyncFunction() {
  const dataResult = await errors.try(somePromise());
  if (dataResult.error) {
    throw errors.wrap(dataResult.error, "somePromise step");
  }
  const processedResult = await errors.try(anotherPromise(dataResult.data));
  if (processedResult.error) {
    throw errors.wrap(processedResult.error, "anotherPromise step");
  }
  return processedResult.data;
}
```

**Before (Sync):**
```typescript
function oldSyncFunction(input: string) {
  try {
    const parsed = JSON.parse(input);
    return processSync(parsed);
  } catch (error) {
    throw new Error(`Sync operation failed: ${error.message}`);
  }
}
```
**After (Sync):**
```typescript
function newSyncFunction(input: string) {
  const parsedResult = errors.trySync(() => JSON.parse(input));
  if (parsedResult.error) {
    throw errors.wrap(parsedResult.error, "JSON parsing");
  }
  const processedResult = errors.trySync(() => processSync(parsedResult.data));
  if (processedResult.error) {
    throw errors.wrap(processedResult.error, "processing sync");
  }
  return processedResult.data;
}
```

### 2. Replace `new Error()`:

**Before:**
```typescript
if (value < 0) {
  throw new Error("Value cannot be negative.");
}
```
**After:**
```typescript
if (value < 0) {
  throw errors.new("value cannot be negative");
}
```

## Inspiration
This library is heavily inspired by the robust error handling patterns from the Go programming language and the excellent [efficientgo/core](https://github.com/efficientgo/core) library for Go. The goal is to bring similar clarity, context preservation, and predictability to the TypeScript/JavaScript ecosystem. While this is an independent implementation, we acknowledge and appreciate the foundational ideas demonstrated by these Go patterns.

## Contributing
Contributions are welcome! If you have ideas for improvements or find any issues, please open an issue or submit a pull request. The core philosophy is to provide a complete, elegant, and type-safe replacement for `try/catch`, so changes should align with this goal.

## License
[0BSD](https://opensource.org/licenses/0BSD). This library is free to use, modify, and distribute.
