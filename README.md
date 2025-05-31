# @superbuilders/errors

🚨 **Complete replacement for try/catch with type-safe error chaining and Go-inspired error handling**

Stop using `try/catch` blocks. This library provides a better way to handle errors that preserves context, enables elegant error propagation, and eliminates the chaos of traditional JavaScript error handling.

## Why Replace try/catch?

Traditional JavaScript error handling is broken:
- **Lost context**: Errors lose valuable debugging information as they bubble up
- **Scattered logic**: Error handling code mixed with business logic
- **Poor composition**: Hard to add context without losing the original error
- **Type unsafety**: No way to handle different error types safely
- **Inconsistent patterns**: Every developer handles errors differently

This library provides **Go-inspired error handling** that's consistent, type-safe, and elegant.

## Installation

```bash
npm install @superbuilders/errors
# or
bun add @superbuilders/errors
# or
pnpm add @superbuilders/errors
```

## Core Philosophy: Never Use try/catch Again

This library is a **complete replacement** for try/catch blocks. Once you adopt it, you'll never need to write `try/catch` again.

```typescript
import { Errors } from '@superbuilders/errors'

// ❌ NEVER do this anymore
try {
  const data = await fetchUserData(userId)
  return data
} catch (error) {
  console.error('Failed:', error)
  throw error
}

// ✅ ALWAYS do this instead
const result = await Errors.try(fetchUserData(userId))
if (result.error) {
  throw Errors.wrap(result.error, "user data fetch")
}
return result.data // Safe to use
```

## Quick Start

```typescript
import { Errors } from '@superbuilders/errors'

// Replace async try/catch
const result = await Errors.try(fetchUserData(userId))
if (result.error) {
  throw Errors.wrap(result.error, "user data fetch")
}
const userData = result.data

// Replace sync try/catch  
const parseResult = Errors.trySync(() => JSON.parse(jsonString))
if (parseResult.error) {
  throw Errors.wrap(parseResult.error, "json parsing")
}
const data = parseResult.data

// Create errors (replaces new Error)
throw Errors.new("invalid user id")

// Chain errors for debugging
const dbError = Errors.new("connection timeout")
throw Errors.wrap(dbError, "user profile fetch")
// Error message: "user profile fetch: connection timeout"
```

## API Reference

### `Errors.try<T>(promise: Promise<T>)`

**Complete replacement for async try/catch blocks.**

```typescript
// ❌ Old way with try/catch
async function fetchUser(id: string) {
  try {
    const response = await fetch(`/api/users/${id}`)
    return await response.json()
  } catch (error) {
    throw new Error(`Failed to fetch user: ${error.message}`)
  }
}

// ✅ New way with Errors.try
async function fetchUser(id: string) {
  const result = await Errors.try(fetch(`/api/users/${id}`))
  if (result.error) {
    throw Errors.wrap(result.error, "api request")
  }
  
  const jsonResult = await Errors.try(result.data.json())
  if (jsonResult.error) {
    throw Errors.wrap(jsonResult.error, "response parsing")
  }
  
  return jsonResult.data
}
```

**Critical Rule**: The `if (result.error)` check must be on the line immediately following the `Errors.try` call:

```typescript
// ✅ CORRECT: Immediate error checking
const result = await Errors.try(operation())
if (result.error) {
  throw Errors.wrap(result.error, "operation")
}

// ❌ WRONG: Gap between operation and error check
const result = await Errors.try(operation())

if (result.error) {
  throw Errors.wrap(result.error, "operation")
}
```

### `Errors.trySync<T>(fn: () => T)`

**Complete replacement for synchronous try/catch blocks.**

```typescript
// ❌ Old way with try/catch
function parseConfig(configString: string) {
  try {
    return JSON.parse(configString)
  } catch (error) {
    throw new Error(`Invalid config: ${error.message}`)
  }
}

// ✅ New way with Errors.trySync
function parseConfig(configString: string) {
  const result = Errors.trySync(() => JSON.parse(configString))
  if (result.error) {
    throw Errors.wrap(result.error, "config parsing")
  }
  return result.data
}
```

### `Errors.new(message: string)`

**Complete replacement for `new Error()`.**

Always use `Errors.new()` instead of `new Error()`:

```typescript
// ❌ Old way
throw new Error("invalid user id")

// ✅ New way
throw Errors.new("invalid user id")

// Benefits:
// - Proper stack trace handling
// - Frozen for immutability  
// - Enhanced toString() for error chains
// - Consistent with the rest of the API
```

### `Errors.wrap<E>(error: E, message: string)`

**Adds context to errors while preserving the original error chain.**

Only use `Errors.wrap` for errors from external sources. Never wrap errors you create yourself:

```typescript
// ✅ CORRECT: Wrapping external errors
const result = await Errors.try(database.query(sql))
if (result.error) {
  throw Errors.wrap(result.error, "user query")
}

// ✅ CORRECT: Creating your own errors
if (!userId) {
  throw Errors.new("missing user id")
}

// ❌ WRONG: Wrapping your own error
throw Errors.wrap(Errors.new("some error"), "operation")
```

**Go-style error messages**: Use lowercase, terse, context-focused descriptions:

```typescript
// ✅ CORRECT: Terse and focused
throw Errors.wrap(result.error, "database connection")
throw Errors.wrap(result.error, "user authentication")  
throw Errors.new("missing required field")

// ❌ WRONG: Verbose and redundant
throw Errors.wrap(result.error, "Failed to connect to database")
throw Errors.wrap(result.error, "Error during user authentication")
```

### `Errors.cause<T>(error: WrappedError<T>)`

**Finds the root cause in an error chain.**

```typescript
const originalError = Errors.new("connection timeout")
const wrapped1 = Errors.wrap(originalError, "database query")
const wrapped2 = Errors.wrap(wrapped1, "user fetch")

const rootCause = Errors.cause(wrapped2)
console.log(rootCause.message) // "connection timeout"
```

### `Errors.is<T, U>(error: T, target: U)`

**Checks if a specific error exists anywhere in the error chain.**

```typescript
const timeoutError = Errors.new("connection timeout")
const wrappedError = Errors.wrap(timeoutError, "api call")

if (Errors.is(wrappedError, timeoutError)) {
  // Implement timeout-specific retry logic
  return await retryWithBackoff(operation)
}
```

### `Errors.as<T, U>(error: T, ErrorClass: new (...args: any[]) => U)`

**Type-safe extraction of specific error types from error chains.**

```typescript
class ValidationError extends Error {
  constructor(public field: string, message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

class NetworkError extends Error {
  constructor(public code: number, message: string) {
    super(message)  
    this.name = 'NetworkError'
  }
}

function handleError(error: Error) {
  const validationError = Errors.as(error, ValidationError)
  if (validationError) {
    return { field: validationError.field, message: validationError.message }
  }
  
  const networkError = Errors.as(error, NetworkError)
  if (networkError && networkError.code >= 500) {
    return scheduleRetry()
  }
  
  throw error // Re-throw unknown errors
}
```

## Real-World Patterns

### API Operations with Fallbacks

```typescript
async function getUserWithFallback(id: string) {
  // Try primary API
  const primaryResult = await Errors.try(primaryApi.getUser(id))
  if (!primaryResult.error) {
    return primaryResult.data
  }
  
  // Try backup API
  const backupResult = await Errors.try(backupApi.getUser(id))
  if (!backupResult.error) {
    return backupResult.data
  }
  
  // Try cache
  const cacheResult = await Errors.try(cache.getUser(id))
  if (!cacheResult.error) {
    return cacheResult.data
  }
  
  // All sources failed
  throw Errors.wrap(primaryResult.error, `user fetch ${id}`)
}
```

### Database Operations

```typescript
async function updateUserProfile(userId: string, profile: UserProfile) {
  const transaction = await db.beginTransaction()
  
  const updateResult = await Errors.try(
    transaction.query('UPDATE users SET profile = ? WHERE id = ?', [profile, userId])
  )
  if (updateResult.error) {
    await transaction.rollback()
    throw Errors.wrap(updateResult.error, `profile update ${userId}`)
  }
  
  const commitResult = await Errors.try(transaction.commit())
  if (commitResult.error) {
    await transaction.rollback()
    throw Errors.wrap(commitResult.error, `transaction commit ${userId}`)
  }
  
  return updateResult.data
}
```

### File Processing

```typescript
async function processDataFile(filePath: string) {
  const readResult = await Errors.try(fs.promises.readFile(filePath, 'utf8'))
  if (readResult.error) {
    throw Errors.wrap(readResult.error, `file read ${filePath}`)
  }
  
  const parseResult = Errors.trySync(() => JSON.parse(readResult.data))
  if (parseResult.error) {
    throw Errors.wrap(parseResult.error, `json parsing ${filePath}`)
  }
  
  const processResult = await Errors.try(processData(parseResult.data))
  if (processResult.error) {
    throw Errors.wrap(processResult.error, `data processing ${filePath}`)
  }
  
  return processResult.data
}
```

### Retry Logic with Type-Safe Error Matching

```typescript
async function robustApiCall<T>(
  operation: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await Errors.try(operation())
    if (!result.error) {
      return result.data
    }
    
    // Check for retryable errors
    const networkError = Errors.as(result.error, NetworkError)
    if (networkError && networkError.code >= 500 && attempt < maxRetries) {
      await sleep(Math.pow(2, attempt) * 1000) // Exponential backoff
      continue
    }
    
    // Non-retryable or max attempts reached
    throw Errors.wrap(result.error, `api call failed after ${attempt} attempts`)
  }
  
  throw Errors.new("unreachable")
}
```

## Migration Guide

### Replace All try/catch Blocks

```typescript
// ❌ Before: Traditional try/catch
async function oldFunction() {
  try {
    const response = await fetch('/api/data')
    const data = await response.json()
    return processData(data)
  } catch (error) {
    console.error('Operation failed:', error)
    throw new Error(`Failed: ${error.message}`)
  }
}

// ✅ After: Errors.try pattern
async function newFunction() {
  const fetchResult = await Errors.try(fetch('/api/data'))
  if (fetchResult.error) {
    throw Errors.wrap(fetchResult.error, "api request")
  }
  
  const jsonResult = await Errors.try(fetchResult.data.json())
  if (jsonResult.error) {
    throw Errors.wrap(jsonResult.error, "response parsing")
  }
  
  const processResult = await Errors.try(processData(jsonResult.data))
  if (processResult.error) {
    throw Errors.wrap(processResult.error, "data processing")
  }
  
  return processResult.data
}
```

### Replace Error Construction

```typescript
// ❌ Before
throw new Error("invalid input")
const error = new Error("connection failed")

// ✅ After  
throw Errors.new("invalid input")
const error = Errors.new("connection failed")
```

## Error Chain Visualization

With proper error chaining, you get complete context:

```
❌ Traditional error:
Error: connection timeout

✅ With @superbuilders/errors:
user profile fetch: api request: response parsing: connection timeout

🔍 This tells you exactly:
- What operation failed (user profile fetch)
- Where it failed (api request, then response parsing)  
- What the root cause was (connection timeout)
```

## TypeScript Support

Full type safety with advanced type inference:

```typescript
import { Errors, WrappedError, DeepestCause } from '@superbuilders/errors'

// Type-safe error chaining
const dbError = Errors.new("connection failed")
const queryError = Errors.wrap(dbError, "user query")
const apiError = Errors.wrap(queryError, "api request")

// TypeScript knows the exact chain structure
type ApiErrorType = typeof apiError // WrappedError<WrappedError<Error>>
type RootType = DeepestCause<typeof apiError> // Error

// Result types are properly discriminated
const result = await Errors.try(asyncOperation())
if (result.error) {
  // TypeScript knows result.data is undefined
  handleError(result.error)
} else {
  // TypeScript knows result.error is undefined  
  return result.data // Safe to use
}
```

## Best Practices

### 1. Always Use Immediate Error Checking

```typescript
// ✅ CORRECT: Immediate check
const result = await Errors.try(operation())
if (result.error) {
  throw Errors.wrap(result.error, "operation")
}

// ❌ WRONG: Gap between operation and check
const result = await Errors.try(operation())
// Some other code here
if (result.error) {
  throw Errors.wrap(result.error, "operation")
}
```

### 2. Use Terse, Context-Focused Error Messages

```typescript
// ✅ CORRECT: Terse and focused
throw Errors.wrap(result.error, "database connection")
throw Errors.wrap(result.error, "user authentication")  
throw Errors.new("missing required field")

// ❌ WRONG: Verbose and redundant
throw Errors.wrap(result.error, "Failed to connect to database")
throw Errors.wrap(result.error, "Error during user authentication")
```

### 3. Always Propagate, Never Just Log

```typescript
// ✅ CORRECT: Propagate errors up
const result = await Errors.try(operation())
if (result.error) {
  throw Errors.wrap(result.error, "operation")
}

// ❌ WRONG: Only logging (loses the error)
const result = await Errors.try(operation())
if (result.error) {
  console.error('Operation failed:', result.error)
  return null // Error is lost!
}
```

### 4. Use Errors.new Instead of new Error

```typescript
// ✅ CORRECT
throw Errors.new("invalid configuration")
const error = Errors.new("validation failed")

// ❌ WRONG  
throw new Error("invalid configuration")
const error = new Error("validation failed")
```

## License

0BSD - Use this library however you want!

## Contributing

Contributions welcome! This library is designed to completely replace try/catch with a more elegant, type-safe error handling pattern. Please ensure any changes maintain this core philosophy.